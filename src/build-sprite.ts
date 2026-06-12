import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { optimize, type Config as SvgoConfig } from "svgo";

export interface SymbolIdContext {
  /** The file's basename without extension, e.g. `house` for `house.svg`. */
  name: string;
  /** The (resolved) source directory the file was found in. */
  dir: string;
  /** The full path to the SVG file. */
  path: string;
}

export interface BuildSpriteOptions {
  /**
   * Derive the `<symbol id>` from a discovered file. Defaults to the filename
   * without extension, so `house.svg` becomes `#house`.
   */
  symbolId?: (context: SymbolIdContext) => string;
  /**
   * SVGO configuration, or `false` to skip optimization. The default keeps the
   * `viewBox`, preserves `currentColor`, and never strips the stroke/fill that
   * draws the glyph — safe for both stroke-based (lucide) and fill-based icons.
   */
  svgoConfig?: SvgoConfig | false;
}

export interface Sprite {
  /** The assembled `<svg>` sprite document containing every `<symbol>`. */
  source: string;
  /** Every symbol id present in the sprite, sorted. */
  ids: string[];
}

/**
 * The default SVGO config. Intentionally conservative: it preserves `viewBox`
 * and any paint attributes (so `currentColor`, stroke, and fill keep working)
 * and only drops width/height in favour of the viewBox.
 */
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

/**
 * Turn a standalone `<svg>` document into a `<symbol>`, carrying over the
 * viewBox and presentation attributes (stroke, fill, …) so the glyph still
 * paints once referenced through `<use>`.
 */
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

/**
 * Compile every `*.svg` under `iconDirs` into one sprite. Later directories win
 * on id collisions, so callers should order shared/base directories first and
 * project-specific ones last.
 */
export function buildSprite(iconDirs: string[], options: BuildSpriteOptions = {}): Sprite {
  const symbolId = options.symbolId ?? (({ name }) => name);
  const svgoConfig = options.svgoConfig === false ? null : (options.svgoConfig ?? defaultSvgoConfig);

  // Map keeps insertion order but later writes override earlier ones, which is
  // exactly the precedence we want (project dirs override base dirs).
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
