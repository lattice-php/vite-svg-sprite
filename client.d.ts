declare module "virtual:svg-sprite" {
  export interface SvgSprite {
    href: string;
    ids: string[];
    source: string;
  }

  /** External sprite URL in builds; empty in dev (the sprite is inlined). */
  export const href: SvgSprite["href"];
  export const ids: SvgSprite["ids"];
  /** Inline sprite markup in dev; empty in builds. */
  export const source: SvgSprite["source"];

  const sprite: SvgSprite;
  export default sprite;
}
