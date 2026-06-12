import { resolve } from "node:path";
import type { Plugin } from "vite";
import {
  buildSprite,
  extractIcons,
  writeIconTypes,
  writePhpEnum,
  type BuildSpriteOptions,
  type ExtractIconsOptions,
  type IconTypesOptions,
  type PhpEnumOptions,
  type Sprite,
} from "./build-sprite.js";

export interface SvgSpriteOptions extends BuildSpriteOptions {
  /** Directories globbed for `*.svg`. Later directories win on collisions. */
  iconDirs?: string[];
  /**
   * Named icons to idempotently materialize from a source (e.g. lucide-static)
   * into `outDir` before building — so the vendored SVGs can be committed and
   * are also included in the sprite. Each `outDir` is globbed like an iconDir.
   */
  include?: ExtractIconsOptions[];
  /** Emit a typed module of the sprite's icon names for import/autocomplete. */
  dts?: IconTypesOptions;
  /** Emit a backed PHP enum of the sprite's icon names. */
  phpEnum?: PhpEnumOptions;
  virtualModuleId?: string;
  assetName?: string;
}

// Exposes the sprite through a virtual module that exports `{ href, ids, source }`.
// In builds the sprite is emitted as a hashed asset and `href` resolves to it; in
// dev `href` is empty and `source` holds the markup, so callers inline it and use
// same-document `<use href="#id">` — which works even when the page is served from
// a different origin than the Vite dev server (e.g. a PHP backend).
export function svgSprite(options: SvgSpriteOptions): Plugin {
  const virtualModuleId = options.virtualModuleId ?? "virtual:svg-sprite";
  const resolvedVirtualModuleId = `\0${virtualModuleId}`;
  const assetName = options.assetName ?? "sprite.svg";
  const include = options.include ?? [];
  // Each include's outDir is vendored then globbed alongside the explicit dirs.
  const iconDirs = [
    ...include.map((source) => resolve(source.outDir)),
    ...(options.iconDirs ?? []).map((dir) => resolve(dir)),
  ];

  let command: "build" | "serve" = "build";
  let sprite: Sprite = { source: "", ids: [] };
  let referenceId: string | undefined;

  const rebuild = (): void => {
    for (const source of include) {
      extractIcons(source);
    }
    sprite = buildSprite(iconDirs, options);
    if (options.dts) {
      writeIconTypes(sprite.ids, options.dts);
    }
    if (options.phpEnum) {
      writePhpEnum(sprite.ids, options.phpEnum);
    }
  };

  const moduleBody = (): string => {
    // In build, Rollup rewrites the placeholder to the final hashed, base-prefixed
    // URL; in dev the sprite is inlined via `source` instead.
    const href = command === "build" ? `import.meta.ROLLUP_FILE_URL_${referenceId}` : '""';
    const source = command === "build" ? '""' : JSON.stringify(sprite.source);

    return (
      `export const href = ${href};\n` +
      `export const ids = ${JSON.stringify(sprite.ids)};\n` +
      `export const source = ${source};\n` +
      `export default { href, ids, source };\n`
    );
  };

  return {
    name: "@lattice-php/vite-svg-sprite",

    configResolved(config) {
      command = config.command;
    },

    buildStart() {
      rebuild();

      if (command === "build") {
        referenceId = this.emitFile({ type: "asset", name: assetName, source: sprite.source });
      }
    },

    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },

    load(id) {
      if (id === resolvedVirtualModuleId) {
        return moduleBody();
      }
    },

    configureServer(server) {
      for (const dir of iconDirs) {
        server.watcher.add(dir);
      }

      const handleChange = (file: string): void => {
        const resolved = resolve(file);
        if (!resolved.toLowerCase().endsWith(".svg")) {
          return;
        }

        if (!iconDirs.some((dir) => resolved.startsWith(dir))) {
          return;
        }

        rebuild();

        const module = server.moduleGraph.getModuleById(resolvedVirtualModuleId);
        if (module) {
          server.moduleGraph.invalidateModule(module);
        }

        server.ws.send({ type: "full-reload" });
      };

      server.watcher.on("add", handleChange);
      server.watcher.on("change", handleChange);
      server.watcher.on("unlink", handleChange);
    },
  };
}

export {
  buildSprite,
  extractIcons,
  writeIconTypes,
  writePhpEnum,
  svgToSymbol,
  defaultSvgoConfig,
} from "./build-sprite.js";
export type {
  BuildSpriteOptions,
  ExtractIconsOptions,
  IconTypesOptions,
  PhpEnumOptions,
  Sprite,
  SymbolIdContext,
} from "./build-sprite.js";
