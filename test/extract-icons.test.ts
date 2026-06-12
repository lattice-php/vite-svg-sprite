import { existsSync, mkdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractIcons } from "../src/index.js";

const baseDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "base");
const outDir = join(tmpdir(), "vite-svg-sprite-extract-test");

beforeEach(() => rmSync(outDir, { recursive: true, force: true }));
afterEach(() => rmSync(outDir, { recursive: true, force: true }));

describe("extractIcons", () => {
  it("materializes the named svgs into the target", () => {
    const synced = extractIcons({ from: baseDir, names: ["check", "house"], outDir });

    expect(synced).toEqual(["check", "house"]);
    expect(existsSync(join(outDir, "check.svg"))).toBe(true);
    expect(existsSync(join(outDir, "house.svg"))).toBe(true);
  });

  it("is idempotent — re-running does not rewrite unchanged files", () => {
    extractIcons({ from: baseDir, names: ["check"], outDir });

    // Backdate the file; a rewrite would bump its mtime.
    const past = new Date(2020, 0, 1);
    utimesSync(join(outDir, "check.svg"), past, past);

    extractIcons({ from: baseDir, names: ["check"], outDir });

    expect(statSync(join(outDir, "check.svg")).mtime.getFullYear()).toBe(2020);
  });

  it("removes stale svgs no longer requested", () => {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "stale.svg"), "<svg/>");

    extractIcons({ from: baseDir, names: ["check"], outDir });

    expect(existsSync(join(outDir, "stale.svg"))).toBe(false);
    expect(existsSync(join(outDir, "check.svg"))).toBe(true);
  });

  it("throws when a requested icon is missing from the source", () => {
    expect(() => extractIcons({ from: baseDir, names: ["nope"], outDir })).toThrow(/Missing icons/);
  });
});
