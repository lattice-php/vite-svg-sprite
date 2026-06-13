/// <reference path="../client.d.ts" />
import type defaultSprite from "virtual:svg-sprite";
import type { SvgSprite } from "virtual:svg-sprite";
import { expectTypeOf, it } from "vitest";

it("types the virtual sprite module", () => {
  expectTypeOf<typeof defaultSprite>().toEqualTypeOf<SvgSprite>();
});
