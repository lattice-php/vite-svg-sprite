import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writePhpEnum } from "../src/index.js";

const file = join(tmpdir(), "vite-svg-sprite-Icon.php");
afterEach(() => rmSync(file, { force: true }));

describe("writePhpEnum", () => {
  it("generates a backed string enum with PascalCase cases", () => {
    writePhpEnum(["arrow-down", "trash-2", "x"], { file, namespace: "App\\Icons", enum: "Icon" });
    const php = readFileSync(file, "utf8");

    expect(php).toContain("declare(strict_types=1);");
    expect(php).toContain("namespace App\\Icons;");
    expect(php).toContain("enum Icon: string");
    expect(php).toContain("case ArrowDown = 'arrow-down';");
    expect(php).toContain("case Trash2 = 'trash-2';");
    expect(php).toContain("case X = 'x';");
  });

  it("throws when two icon names collapse to the same case", () => {
    expect(() => writePhpEnum(["trash-2", "trash2"], { file, namespace: "App", enum: "Icon" })).toThrow(
      /maps to both/,
    );
  });
});
