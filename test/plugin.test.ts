import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Rollup } from "vite";
import { describe, expect, it } from "vitest";
import { svgSprite } from "../src/index.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const baseDir = join(fixtures, "base");
const entry = join(fixtures, "entry.js");

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
});
