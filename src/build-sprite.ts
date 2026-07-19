import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { optimize, type Config as SvgoConfig } from "svgo";

const require = createRequire(import.meta.url);

export interface SymbolIdContext {
  name: string;
  dir: string;
  path: string;
}

export interface BuildSpriteOptions {
  /** Derive the `<symbol id>` from a file. Defaults to the filename. */
  symbolId?: (context: SymbolIdContext) => string;
  /** SVGO config, or `false` to skip optimization. */
  svgoConfig?: SvgoConfig | false;
}

export interface Sprite {
  source: string;
  ids: string[];
}

// Conservative on purpose: keeps the viewBox and every paint attribute so
// `currentColor`, stroke, and fill survive for both stroke- and fill-based icons.
// SVGO v4 dropped removeViewBox from preset-default, so viewBox is kept by
// default; removeDimensions then strips the redundant width/height.
export const defaultSvgoConfig: SvgoConfig = {
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          removeUselessStrokeAndFill: false,
        },
      },
    },
    "removeDimensions",
  ],
};

const ROOT_SVG = /<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i;
const ATTRIBUTE = /([:\w-]+)\s*=\s*"([^"]*)"/g;
const DROPPED_ROOT_ATTRIBUTES = new Set([
  "width",
  "height",
  "id",
  "class",
  "xmlns",
  "xmlns:xlink",
  "version",
]);

// Carries the viewBox and presentation attributes onto the symbol so the glyph
// still paints once referenced through `<use>`.
export function svgToSymbol(id: string, svg: string): string {
  const match = ROOT_SVG.exec(svg.trim());

  if (!match) {
    throw new Error(`[vite-svg-sprite] Could not parse the SVG for symbol "${id}".`);
  }

  const [, rawAttributes = "", inner = ""] = match;
  const attributes: string[] = [];
  let attribute: RegExpExecArray | null;

  ATTRIBUTE.lastIndex = 0;
  while ((attribute = ATTRIBUTE.exec(rawAttributes)) !== null) {
    const [, key = "", value = ""] = attribute;

    if (DROPPED_ROOT_ATTRIBUTES.has(key.toLowerCase())) {
      continue;
    }

    attributes.push(`${key}="${value}"`);
  }

  const attributePart = attributes.length > 0 ? ` ${attributes.join(" ")}` : "";

  return `<symbol id="${id}"${attributePart}>${inner.trim()}</symbol>`;
}

function discoverSvgFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => extname(file).toLowerCase() === ".svg")
    .sort();
}

// Later directories win on id collisions, so order base/shared dirs first.
export function buildSprite(iconDirs: string[], options: BuildSpriteOptions = {}): Sprite {
  const symbolId = options.symbolId ?? (({ name }) => name);
  const svgoConfig = options.svgoConfig === false ? null : (options.svgoConfig ?? defaultSvgoConfig);

  // Re-setting a key overrides the earlier symbol — exactly the precedence we want.
  const symbols = new Map<string, string>();

  for (const rawDir of iconDirs) {
    const dir = resolve(rawDir);

    if (!existsSync(dir)) {
      continue;
    }

    for (const relativePath of discoverSvgFiles(dir)) {
      const path = join(dir, relativePath);
      const name = basename(relativePath, extname(relativePath));
      const id = symbolId({ name, dir, path });
      const raw = readFileSync(path, "utf8");
      const optimized = svgoConfig ? (optimize(raw, svgoConfig).data ?? raw) : raw;

      symbols.set(id, svgToSymbol(id, optimized));
    }
  }

  const ids = [...symbols.keys()].sort();
  const body = ids.map((id) => symbols.get(id)).join("");
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ` +
    `style="position:absolute;width:0;height:0;overflow:hidden">${body}</svg>`;

  return { source, ids };
}

// Resolves a source to an absolute directory. Accepts a path (relative or
// absolute) or a package specifier with an optional subpath, e.g.
// "lucide-static/icons" -> <node_modules>/lucide-static/icons.
function resolveSourceDir(from: string): string {
  if (from.startsWith(".") || isAbsolute(from)) {
    return resolve(from);
  }

  const direct = resolve(from);
  if (existsSync(direct)) {
    return direct;
  }

  const segments = from.split("/");
  const pkg = from.startsWith("@") ? segments.slice(0, 2).join("/") : (segments[0] ?? from);
  const subpath = from.slice(pkg.length + 1);

  // Resolve from the project, not the plugin's install location — the source
  // package is the consumer's dependency (works under npm, pnpm, and npm link).
  const fromProject = { paths: [process.cwd()] };
  let root: string;
  try {
    root = dirname(require.resolve(`${pkg}/package.json`, fromProject));
  } catch {
    // Some packages don't expose ./package.json — resolve the entry and walk up.
    root = dirname(require.resolve(pkg, fromProject));
    while (!existsSync(join(root, "package.json")) && dirname(root) !== root) {
      root = dirname(root);
    }
  }

  return subpath ? join(root, subpath) : root;
}

// Idempotent write: skips the disk write (and any churn) when content is unchanged.
function writeIfChanged(file: string, content: string): void {
  if (existsSync(file) && readFileSync(file, "utf8") === content) {
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

export interface ExtractIconsOptions {
  /** A directory or package specifier to pull SVGs from, e.g. "lucide-static/icons". */
  from: string;
  /** Icon names (filenames without `.svg`) to materialize. */
  names: string[];
  /** Directory the named SVGs are written to. */
  outDir: string;
}

/**
 * Idempotently materializes `names` from `from` into `outDir`: writes only files
 * whose content changed, so re-running is a no-op once synced. Other files in
 * `outDir` are left untouched — the copy never deletes anything, so hand-authored
 * icons and other sources can share the directory. Throws if any requested icon
 * is missing from the source. Returns the synced icon names.
 */
export function extractIcons({ from, names, outDir }: ExtractIconsOptions): string[] {
  const sourceDir = resolveSourceDir(from);
  const target = resolve(outDir);
  mkdirSync(target, { recursive: true });

  const wanted = new Map<string, string>();
  const missing: string[] = [];
  for (const name of names) {
    const sourcePath = join(sourceDir, `${name}.svg`);
    if (!existsSync(sourcePath)) {
      missing.push(name);
      continue;
    }
    wanted.set(`${name}.svg`, readFileSync(sourcePath, "utf8"));
  }

  if (missing.length > 0) {
    const list = [...new Set(missing)].sort().join(", ");
    throw new Error(`[vite-svg-sprite] Missing icons in "${from}": ${list}`);
  }

  for (const [file, content] of wanted) {
    writeIfChanged(join(target, file), content);
  }

  return [...wanted.keys()].map((file) => basename(file, ".svg")).sort();
}

export interface IconTypesOptions {
  /** File to (idempotently) write the generated `iconNames`/`IconName` module to. */
  file: string;
  /** Optionally augment this module's `interface` so a `name` prop autocompletes. */
  augmentModule?: string;
  augmentInterface?: string;
  /** Indentation unit for the generated module. Defaults to two spaces. */
  indent?: string;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Generates a typed module of the sprite's icon names: an `iconNames` const and
 * an `IconName` union, optionally augmenting a module's interface so a `name`
 * prop autocompletes. Idempotent.
 */
export function writeIconTypes(ids: string[], options: IconTypesOptions): void {
  const indent = options.indent ?? "  ";
  const list = ids.map((id) => `${indent}${JSON.stringify(id)}`).join(",\n");
  let content =
    `// Generated by @lattice-php/vite-svg-sprite. Do not edit.\n\n` +
    `export const iconNames = [\n${list},\n] as const;\n\n` +
    `export type IconName = (typeof iconNames)[number];\n`;

  if (options.augmentModule && options.augmentInterface) {
    const entries = ids
      .map((id) => `${indent.repeat(2)}${IDENTIFIER.test(id) ? id : JSON.stringify(id)}: true;`)
      .join("\n");
    content +=
      `\ndeclare module ${JSON.stringify(options.augmentModule)} {\n` +
      `${indent}interface ${options.augmentInterface} {\n${entries}\n${indent}}\n}\n`;
  }

  writeIfChanged(resolve(options.file), content);
}

export interface PhpEnumOptions {
  /** File to (idempotently) write the generated PHP enum to. */
  file: string;
  /** PHP namespace for the enum. */
  namespace: string;
  /** Enum name. Defaults to `Icon`. */
  enum?: string;
  /** Derive the case name from an icon name. Defaults to PascalCase. */
  caseName?: (name: string) => string;
}

function pascalCase(name: string): string {
  const pascal = name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  // PHP identifiers can't start with a digit.
  return /^\d/.test(pascal) ? `_${pascal}` : pascal;
}

/**
 * Generates a backed string PHP enum of the sprite's icons (`Case = 'icon-name'`),
 * so the server can pick icons type-safely. Idempotent. Throws if two icon names
 * collapse to the same case name.
 */
export function writePhpEnum(ids: string[], options: PhpEnumOptions): void {
  const enumName = options.enum ?? "Icon";
  const toCase = options.caseName ?? pascalCase;

  const seen = new Map<string, string>();
  const cases = ids.map((id) => {
    const name = toCase(id);
    const clash = seen.get(name);
    if (clash) {
      throw new Error(
        `[vite-svg-sprite] PHP enum case "${name}" maps to both "${clash}" and "${id}".`,
      );
    }
    seen.set(name, id);
    const value = id.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    return `    case ${name} = '${value}';`;
  });

  const content =
    `<?php\n\n` +
    `declare(strict_types=1);\n\n` +
    `namespace ${options.namespace};\n\n` +
    `// Generated by @lattice-php/vite-svg-sprite. Do not edit.\n` +
    `enum ${enumName}: string\n{\n${cases.join("\n")}\n}\n`;

  writeIfChanged(resolve(options.file), content);
}
