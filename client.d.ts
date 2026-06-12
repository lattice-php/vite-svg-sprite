declare module "virtual:svg-sprite" {
  /** External sprite URL in builds; empty in dev (the sprite is inlined). */
  export const href: string;
  export const ids: string[];
  /** Inline sprite markup in dev; empty in builds. */
  export const source: string;

  const sprite: { href: string; ids: string[]; source: string };
  export default sprite;
}
