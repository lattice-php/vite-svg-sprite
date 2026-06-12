import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { optimize, type Config as SvgoConfig } from "svgo";

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
export const defaultSvgoConfig: SvgoConfig = {
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          removeViewBox: false,
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
