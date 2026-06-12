# @lattice-php/vite-svg-sprite

A small [Vite](https://vite.dev) plugin that compiles one or more folders of
SVGs into a single sprite and exposes it through a virtual module. Built for
**server-driven UIs** where the icon name is a runtime string the bundler can't
see — drop an SVG in a folder, reference it by name, done.

- **One request.** All icons compile into a single `<symbol>` sprite.
- **Mergeable sources.** Pass several directories; later ones win on collisions,
  so a library can ship a base set that the app extends or overrides.
- **Backend-agnostic dev.** In production the sprite is an external hashed asset;
  in dev it's inlined for same-document `<use href="#id">`, so it works even when
  the page is served from a different origin than the Vite dev server (Laravel,
  Rails, …).
- **`currentColor` safe.** The default SVGO config keeps the `viewBox` and paint
  attributes, so both stroke-based (lucide) and fill-based icons keep working.

## Install

```sh
npm i -D @lattice-php/vite-svg-sprite
```

## Usage

```ts
// vite.config.ts
import { svgSprite } from "@lattice-php/vite-svg-sprite";

export default defineConfig({
  plugins: [
    svgSprite({
      iconDirs: ["node_modules/@some-lib/icons", "resources/icons"],
    }),
  ],
});
```

Add the client types (for the `virtual:svg-sprite` import) to your `tsconfig.json`:

```jsonc
{ "compilerOptions": { "types": ["@lattice-php/vite-svg-sprite/client"] } }
```

Then read the sprite in app code:

```ts
import sprite from "virtual:svg-sprite";
// sprite.href   -> external URL in builds, "" in dev
// sprite.ids    -> string[] of every symbol id
// sprite.source -> inline sprite markup in dev, "" in builds

// Render an icon:
//   <svg><use href={`${sprite.href}#${name}`} /></svg>
// In dev, inject `sprite.source` once near the root so `#${name}` resolves.
```

## Options

| Option            | Default               | Description                                                        |
| ----------------- | --------------------- | ------------------------------------------------------------------ |
| `iconDirs`        | —                     | Directories globbed for `*.svg` (recursive). Later dirs win.       |
| `virtualModuleId` | `"virtual:svg-sprite"`| The id app code imports.                                           |
| `assetName`       | `"sprite.svg"`        | Base name of the emitted asset in builds.                          |
| `symbolId`        | filename              | `({ name, dir, path }) => string` to derive each `<symbol id>`.    |
| `svgoConfig`      | conservative preset   | SVGO config, or `false` to skip optimization.                      |

## License

MIT
