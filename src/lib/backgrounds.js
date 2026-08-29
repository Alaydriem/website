/**
 * The hero backgrounds, in the order the hero fades through them.
 *
 * One list, three readers: Hero.astro renders the first one into the markup,
 * Base.astro preloads it, and the client cycler walks the rest. Keeping them on
 * one array is what stops the preloaded image and the painted image drifting
 * apart, which costs a whole extra download when it happens.
 *
 * Every slug here must have six files under public/assets/images/bg/, produced
 * by scripts/optimize-backgrounds.mjs.
 */
export const BACKGROUNDS = [
  'cathedral',
  'oak',
  'spire',
  'pines',
  'chapel',
  'canopy',
];

/** The one that is server-rendered, preloaded, and used as the social card. */
export const FIRST_BACKGROUND = BACKGROUNDS[0];

/* Matched by the media queries in _hero.scss. A viewport wider than the middle
   bound gets the large file; anything below the small bound gets the small one.
   These are CSS pixels before device pixel ratio is applied. */
export const BREAKPOINTS = { sm: 700, md: 1400 };
