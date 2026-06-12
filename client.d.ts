declare module "virtual:svg-sprite" {
  /** External sprite URL in production builds; empty string in dev. */
  export const href: string;
  /** Every symbol id available in the sprite. */
  export const ids: string[];
  /** Inline sprite markup in dev (for same-document `<use>`); empty in builds. */
  export const source: string;

  const sprite: { href: string; ids: string[]; source: string };
  export default sprite;
}
