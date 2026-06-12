import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSprite, svgToSymbol } from "../src/index.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const baseDir = join(fixtures, "base");
const appDir = join(fixtures, "app");

describe("buildSprite", () => {
  it("compiles every svg into a symbol keyed by filename", () => {
    const sprite = buildSprite([baseDir]);

    expect(sprite.ids).toEqual(["check", "house"]);
    expect(sprite.source).toContain('<symbol id="house"');
    expect(sprite.source).toContain('<symbol id="check"');
    expect(sprite.source.startsWith("<svg")).toBe(true);
  });

  it("keeps the viewBox and currentColor paint attributes", () => {
    const sprite = buildSprite([baseDir]);

    expect(sprite.source).toContain('viewBox="0 0 24 24"');
    expect(sprite.source).toContain('stroke="currentColor"');
    expect(sprite.source).toContain('fill="none"');
  });

  it("drops width/height in favour of the viewBox", () => {
    const symbol = svgToSymbol(
      "x",
      '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M0 0"/></svg>',
    );

    expect(symbol).not.toContain("width=");
    expect(symbol).not.toContain("height=");
    expect(symbol).toContain('viewBox="0 0 24 24"');
  });

  it("lets later directories override earlier ones on id collisions", () => {
    const sprite = buildSprite([baseDir, appDir]);

    // `house` exists in both; the app fixture (fill-based, 32x32) must win.
    expect(sprite.ids).toEqual(["check", "house", "spark"]);
    const houseSymbol = /<symbol id="house"[\s\S]*?<\/symbol>/.exec(sprite.source)?.[0] ?? "";
    expect(houseSymbol).toContain('viewBox="0 0 32 32"');
    expect(houseSymbol).toContain('fill="currentColor"');
  });

  it("ignores missing directories", () => {
    const sprite = buildSprite([baseDir, join(fixtures, "does-not-exist")]);

    expect(sprite.ids).toEqual(["check", "house"]);
  });

  it("can skip optimization", () => {
    const sprite = buildSprite([appDir], { svgoConfig: false });

    expect(sprite.ids).toEqual(["house", "spark"]);
    expect(sprite.source).toContain('<symbol id="spark"');
  });

  it("supports a custom symbolId", () => {
    const sprite = buildSprite([baseDir], { symbolId: ({ name }) => `icon-${name}` });

    expect(sprite.ids).toEqual(["icon-check", "icon-house"]);
  });
});
