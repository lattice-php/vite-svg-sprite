import { resolve } from "node:path";
import type { Plugin } from "vite";
import { buildSprite, type BuildSpriteOptions, type Sprite } from "./build-sprite.js";

export interface SvgSpriteOptions extends BuildSpriteOptions {
  /** Directories globbed for `*.svg`. Later directories win on collisions. */
  iconDirs: string[];
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
  const iconDirs = options.iconDirs.map((dir) => resolve(dir));

  let command: "build" | "serve" = "build";
  let sprite: Sprite = { source: "", ids: [] };
  let referenceId: string | undefined;

  const rebuild = (): void => {
    sprite = buildSprite(iconDirs, options);
  };

  const moduleBody = (): string => {
    const ids = JSON.stringify(sprite.ids);

    if (command === "build") {
      // Rollup rewrites the placeholder to the final hashed, base-prefixed URL.
      return (
        `export const href = import.meta.ROLLUP_FILE_URL_${referenceId};\n` +
        `export const ids = ${ids};\n` +
        `export const source = "";\n` +
        `export default { href, ids, source };\n`
      );
    }

    return (
      `export const href = "";\n` +
      `export const ids = ${ids};\n` +
      `export const source = ${JSON.stringify(sprite.source)};\n` +
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
        if (!file.toLowerCase().endsWith(".svg")) {
          return;
        }

        if (!iconDirs.some((dir) => resolve(file).startsWith(dir))) {
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

export { buildSprite, svgToSymbol, defaultSvgoConfig } from "./build-sprite.js";
export type { BuildSpriteOptions, Sprite, SymbolIdContext } from "./build-sprite.js";
