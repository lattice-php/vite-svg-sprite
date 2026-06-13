import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Rollup } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { svgSprite } from "../src/index.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const baseDir = join(fixtures, "base");
const entry = join(fixtures, "entry.js");

type CallablePlugin = {
  configResolved?: (config: unknown) => void;
  configureServer?: (server: unknown) => void;
};

async function buildWith(plugins: ReturnType<typeof svgSprite>[]): Promise<Rollup.RollupOutput> {
  const result = (await build({
    logLevel: "silent",
    configFile: false,
    build: {
      write: false,
      minify: false,
      rollupOptions: { input: entry },
    },
    plugins,
  })) as Rollup.RollupOutput;

  return result;
}

describe("svgSprite plugin (build)", () => {
  const relativePathRoot = join(tmpdir(), "vite-svg-sprite-relative-path-test");
  const fallbackPathRoot = join(process.cwd(), ".tmp-vite-svg-sprite-relative-path-test");

  afterEach(() => {
    rmSync(relativePathRoot, { recursive: true, force: true });
    rmSync(fallbackPathRoot, { recursive: true, force: true });
  });

  it("emits a hashed sprite asset and resolves its URL into the bundle", async () => {
    const { output } = await buildWith([svgSprite({ iconDirs: [baseDir] })]);

    const asset = output.find(
      (item): item is Rollup.OutputAsset => item.type === "asset" && /sprite-.*\.svg$/.test(item.fileName),
    );
    expect(asset).toBeDefined();
    expect(String(asset?.source)).toContain('<symbol id="house"');

    const chunk = output.find((item): item is Rollup.OutputChunk => item.type === "chunk");
    expect(chunk).toBeDefined();
    // The href export must point at the emitted, hashed sprite file (referenced
    // relative to the chunk, so by basename) via `new URL(..., import.meta.url)`.
    const spriteBasename = (asset?.fileName ?? "MISSING").split("/").pop() ?? "MISSING";
    expect(chunk?.code).toContain(spriteBasename);
    expect(chunk?.code).toContain("import.meta.url");
    // ...and the ids must be inlined.
    expect(chunk?.code).toContain("house");
    expect(chunk?.code).toContain("check");
    // No leftover Rollup placeholder.
    expect(chunk?.code).not.toContain("ROLLUP_FILE_URL");
  });

  it("respects a custom virtualModuleId", async () => {
    // Different id => the default import in entry.js no longer resolves.
    await expect(
      buildWith([svgSprite({ iconDirs: [baseDir], virtualModuleId: "virtual:other" })]),
    ).rejects.toThrow();
  });

  it("resolves relative plugin paths from the Vite root", async () => {
    const appRoot = join(relativePathRoot, "app");
    const sourceDir = join(relativePathRoot, "source");

    mkdirSync(join(appRoot, "icons"), { recursive: true });
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(appRoot, "entry.js"), 'import sprite from "virtual:svg-sprite"; console.log(sprite);');
    writeFileSync(
      join(appRoot, "icons", "house.svg"),
      '<svg viewBox="0 0 24 24"><path d="M3 12h18"/></svg>',
    );
    writeFileSync(
      join(sourceDir, "check.svg"),
      '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>',
    );

    const result = (await build({
      root: appRoot,
      logLevel: "silent",
      configFile: false,
      build: {
        write: false,
        minify: false,
        rollupOptions: { input: join(appRoot, "entry.js") },
      },
      plugins: [
        svgSprite({
          iconDirs: ["icons"],
          include: [{ from: sourceDir, names: ["check"], outDir: ".generated/icons" }],
          dts: { file: ".generated/icons.ts" },
          phpEnum: { file: ".generated/Icon.php", namespace: "App" },
        }),
      ],
    })) as Rollup.RollupOutput;

    const asset = result.output.find(
      (item): item is Rollup.OutputAsset => item.type === "asset" && /sprite-.*\.svg$/.test(item.fileName),
    );

    expect(String(asset?.source)).toContain('<symbol id="check"');
    expect(String(asset?.source)).toContain('<symbol id="house"');
    expect(existsSync(join(appRoot, ".generated", "icons", "check.svg"))).toBe(true);
    expect(existsSync(join(appRoot, ".generated", "icons.ts"))).toBe(true);
    expect(existsSync(join(appRoot, ".generated", "Icon.php"))).toBe(true);
    expect(existsSync(join(fallbackPathRoot, "app", ".generated", "icons", "check.svg"))).toBe(false);
  });

  it("ignores watched svg changes from sibling directories with the same prefix", () => {
    const appRoot = join(relativePathRoot, "watcher");
    const iconDir = join(appRoot, "icons");
    const siblingDir = join(appRoot, "icons-extra");
    const handlers: Array<(file: string) => void> = [];
    const messages: unknown[] = [];

    mkdirSync(iconDir, { recursive: true });
    mkdirSync(siblingDir, { recursive: true });

    const plugin = svgSprite({ iconDirs: [iconDir] }) as CallablePlugin;
    plugin.configResolved?.({ command: "serve" });
    plugin.configureServer?.({
      watcher: {
        add() {},
        on(_event: string, handler: (file: string) => void) {
          handlers.push(handler);
        },
      },
      moduleGraph: {
        getModuleById() {
          return undefined;
        },
        invalidateModule() {},
      },
      ws: {
        send(message: unknown) {
          messages.push(message);
        },
      },
    });

    handlers[0]?.(join(siblingDir, "ghost.svg"));

    expect(messages).toHaveLength(0);
  });

  it("reloads watched svg changes from configured directories", () => {
    const appRoot = join(relativePathRoot, "watcher-reload");
    const iconDir = join(appRoot, "icons");
    const handlers: Array<(file: string) => void> = [];
    const messages: unknown[] = [];

    mkdirSync(iconDir, { recursive: true });

    const plugin = svgSprite({ iconDirs: [iconDir] }) as CallablePlugin;
    plugin.configResolved?.({ command: "serve" });
    plugin.configureServer?.({
      watcher: {
        add() {},
        on(_event: string, handler: (file: string) => void) {
          handlers.push(handler);
        },
      },
      moduleGraph: {
        getModuleById() {
          return undefined;
        },
        invalidateModule() {},
      },
      ws: {
        send(message: unknown) {
          messages.push(message);
        },
      },
    });

    handlers[0]?.(join(iconDir, "house.svg"));

    expect(messages).toHaveLength(1);
  });

  describe("include", () => {
    const outDir = join(tmpdir(), "vite-svg-sprite-include-test");
    afterEach(() => rmSync(outDir, { recursive: true, force: true }));

    it("vendors named icons to outDir and adds them to the sprite", async () => {
      const { output } = await buildWith([
        svgSprite({ include: [{ from: baseDir, names: ["check"], outDir }] }),
      ]);

      expect(existsSync(join(outDir, "check.svg"))).toBe(true);

      const asset = output.find(
        (item): item is Rollup.OutputAsset =>
          item.type === "asset" && /sprite-.*\.svg$/.test(item.fileName),
      );
      expect(String(asset?.source)).toContain('<symbol id="check"');
    });
  });
});
