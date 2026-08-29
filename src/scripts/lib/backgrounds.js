/**
 * Background selection arithmetic, with no DOM and no browser API.
 *
 * Kept separate from backgrounds.js so the one thing that is easy to get wrong
 * — resolving a viewport to the same file the stylesheet would have asked for —
 * can be tested directly. When these disagree with the media queries in
 * _hero.scss the page still looks right, so nothing catches it; it just quietly
 * downloads two copies of the same photograph.
 */
import { BREAKPOINTS } from '../../lib/backgrounds.js';

const DIR = '/assets/images/bg';

/* A 3x phone asking for 3x2400px would be handed a file far larger than the
   difference anyone can see, on the connection least able to afford it. */
const MAX_DPR = 2;

/**
 * The size suffix for a viewport, matching the media queries in _hero.scss.
 *
 * The breakpoints are lower bounds on both sides: (min-width: 700px) matches at
 * exactly 700px, so this must return 'md' there and not 'sm'.
 */
export function sizeFor(width, dpr) {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, MAX_DPR) : 1;
  const pixels = width * ratio;

  if (pixels >= BREAKPOINTS.md) return 'lg';
  if (pixels >= BREAKPOINTS.sm) return 'md';
  return 'sm';
}

export function urlFor(slug, size, format) {
  return `${DIR}/${slug}-${size}.${format}`;
}

/**
 * A background-image value that lets the browser choose the format.
 *
 * image-set is how a CSS background gets the fallback that <picture> gives an
 * <img>. A browser too old to understand it drops the whole declaration, which
 * is why the caller keeps a plain url() on hand.
 */
export function backgroundImage(slug, size) {
  return 'image-set('
    + `url('${urlFor(slug, size, 'avif')}') type('image/avif'), `
    + `url('${urlFor(slug, size, 'jpg')}') type('image/jpeg')`
    + ')';
}

export function nextIndex(index, count) {
  return (index + 1) % count;
}
