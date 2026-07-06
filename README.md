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
| `iconDirs`        | `[]`                  | Directories globbed for `*.svg` (recursive). Later dirs win.       |
| `include`         | `[]`                  | `[{ from, names, outDir }]` — idempotently vendor named icons from a source into `outDir` before building; each `outDir` is globbed like an iconDir. |
| `dts`             | —                     | `{ file, augmentModule?, augmentInterface? }` — generate a typed module of the icon names (see below). |
| `phpEnum`         | —                     | `{ file, namespace, enum?, caseName? }` — generate a backed PHP enum of the icon names (see below). |
| `virtualModuleId` | `"virtual:svg-sprite"`| The id app code imports.                                           |
| `assetName`       | `"sprite.svg"`        | Base name of the emitted asset in builds.                          |
| `symbolId`        | filename              | `({ name, dir, path }) => string` to derive each `<symbol id>`.    |
| `svgoConfig`      | conservative preset   | SVGO config, or `false` to skip optimization.                      |

With `include`, a library can pull a fixed icon set from a package and commit the
result, without a separate sync script:

```ts
svgSprite({
  include: [{ from: "lucide-static/icons", names: ["house", "x"], outDir: "resources/icons" }],
  iconDirs: ["app/icons"],
})
```

## Vendoring icons from a package

`extractIcons` idempotently copies named icons out of an installed icon package
(or any directory) into a folder you commit — handy for a library that wants to
ship a fixed set of icons without depending on the source package at build time.

```ts
import { extractIcons } from "@lattice-php/vite-svg-sprite";

extractIcons({
  from: "lucide-static/icons",        // package specifier or directory
  names: ["house", "settings", "x"],  // filenames without .svg
  outDir: "resources/icons",
});
```

It writes only files whose content changed, and throws if a requested icon is
missing from the source — so running it twice is a no-op. Other files in `outDir`
are left untouched, so hand-authored icons and other sources can share the
directory; drop an icon from `names` and its committed `*.svg` simply stays until
you remove it.

## Generating a type for the icons

The `dts` option (or the standalone `writeIconTypes`) emits a module of the
sprite's icon names — an importable `IconName` union plus an `iconNames` const:

```ts
svgSprite({
  iconDirs: ["resources/icons"],
  dts: {
    file: "resources/js/sprite-icons.ts",
    // Optional: augment a module's interface so a `name` prop autocompletes.
    augmentModule: "@my-lib/ui",
    augmentInterface: "KnownIcons",
  },
})
```

```ts
// generated, committable, idempotent
export const iconNames = ["house", "x", …] as const;
export type IconName = (typeof iconNames)[number];
```

## Generating a PHP enum

The `phpEnum` option (or the standalone `writePhpEnum`) emits a backed string enum
so a PHP backend can pick icons type-safely:

```ts
svgSprite({
  iconDirs: ["resources/icons"],
  phpEnum: { file: "src/Enums/Icon.php", namespace: "App\\Enums", enum: "Icon" },
})
```

```php
<?php

declare(strict_types=1);

namespace App\Enums;

enum Icon: string
{
    case House = 'house';
    case ArrowDown = 'arrow-down';
}
```

Case names default to PascalCase (override via `caseName`); it throws if two icon
names collapse to the same case.

## License

MIT
