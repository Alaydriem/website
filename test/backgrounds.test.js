import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BACKGROUNDS, BREAKPOINTS, FIRST_BACKGROUND } from '../src/lib/backgrounds.js';
import { backgroundImage, nextIndex, sizeFor, urlFor } from '../src/scripts/lib/backgrounds.js';

describe('sizeFor', () => {
  it('picks a size from the CSS breakpoints', () => {
    expect(sizeFor(390, 1)).toBe('sm');
    expect(sizeFor(1024, 1)).toBe('md');
    expect(sizeFor(1440, 1)).toBe('lg');
  });

  it('treats the breakpoints as lower bounds, matching the media queries', () => {
    // (min-width: 700px) and (min-width: 1400px) both match at their own value,
    // so the same width must not resolve to a smaller file here.
    expect(sizeFor(BREAKPOINTS.sm - 1, 1)).toBe('sm');
    expect(sizeFor(BREAKPOINTS.sm, 1)).toBe('md');
    expect(sizeFor(BREAKPOINTS.md - 1, 1)).toBe('md');
    expect(sizeFor(BREAKPOINTS.md, 1)).toBe('lg');
  });

  it('accounts for device pixel ratio', () => {
    // A 390px phone at 3x is asking for 1170 real pixels, which is a md file.
    expect(sizeFor(390, 3)).toBe('md');
    expect(sizeFor(760, 2)).toBe('lg');
  });

  it('stops counting pixel ratio above 2, so a 4x phone is not sent 2400px', () => {
    expect(sizeFor(390, 4)).toBe(sizeFor(390, 2));
  });

  it('survives a missing or nonsense pixel ratio', () => {
    expect(sizeFor(1440, undefined)).toBe('lg');
    expect(sizeFor(390, 0)).toBe('sm');
    expect(sizeFor(390, NaN)).toBe('sm');
  });
});

describe('urlFor', () => {
  it('builds a path that exists on disk', () => {
    expect(urlFor('cathedral', 'lg', 'avif')).toBe('/assets/images/bg/cathedral-lg.avif');
    expect(urlFor('oak', 'sm', 'jpg')).toBe('/assets/images/bg/oak-sm.jpg');
  });
});

describe('backgroundImage', () => {
  it('offers AVIF first and JPEG as the fallback', () => {
    const value = backgroundImage('spire', 'md');
    expect(value).toContain("url('/assets/images/bg/spire-md.avif') type('image/avif')");
    expect(value).toContain("url('/assets/images/bg/spire-md.jpg') type('image/jpeg')");
    expect(value.indexOf('avif')).toBeLessThan(value.indexOf('jpeg'));
    expect(value.startsWith('image-set(')).toBe(true);
  });
});

describe('nextIndex', () => {
  it('advances through the set', () => {
    expect(nextIndex(0, 6)).toBe(1);
    expect(nextIndex(4, 6)).toBe(5);
  });

  it('wraps back to the first', () => {
    expect(nextIndex(5, 6)).toBe(0);
  });

  it('holds still when there is only one background to show', () => {
    expect(nextIndex(0, 1)).toBe(0);
  });
});

describe('the shipped set', () => {
  it('has more than one background, or the cycle is pointless', () => {
    expect(BACKGROUNDS.length).toBeGreaterThan(1);
  });

  it('has no duplicate slugs, which would fade an image into itself', () => {
    expect(new Set(BACKGROUNDS).size).toBe(BACKGROUNDS.length);
  });
});

/*
 * The stylesheet paints the first photograph and the layout preloads it, and
 * neither can read the slug out of JavaScript. When they drift the page still
 * looks completely correct — it just preloads one file and paints another, and
 * the visitor pays for both. These are the only thing that catches it.
 */
describe('the first background, across the three places it is named', () => {
  const hero = readFileSync('src/styles/_hero.scss', 'utf8');
  const base = readFileSync('src/layouts/Base.astro', 'utf8');
  const home = readFileSync('src/pages/index.astro', 'utf8');

  it('is painted by the stylesheet at every size', () => {
    for (const size of ['sm', 'md', 'lg']) {
      expect(hero).toContain(`/assets/images/bg/${FIRST_BACKGROUND}-${size}.avif`);
      expect(hero).toContain(`/assets/images/bg/${FIRST_BACKGROUND}-${size}.jpg`);
    }
  });

  it('has stylesheet media queries on the breakpoints the cycler uses', () => {
    expect(hero).toContain(`@media (min-width: ${BREAKPOINTS.sm}px)`);
    expect(hero).toContain(`@media (min-width: ${BREAKPOINTS.md}px)`);
  });

  it('is what the layout preloads, and it preloads nothing retired', () => {
    expect(base).toContain('FIRST_BACKGROUND');
    expect(base).not.toContain('header-bg');
    expect(hero).not.toContain('header-bg');
  });

  it('is the social card, which has to be a format every scraper reads', () => {
    expect(home).toContain(`/assets/images/bg/${FIRST_BACKGROUND}-lg.jpg`);
  });
});

describe('the files on disk', () => {
  it('has all six variants of every background', () => {
    const missing = BACKGROUNDS.flatMap((slug) => ['sm', 'md', 'lg'].flatMap(
      (size) => ['avif', 'jpg']
        .map((format) => `public/assets/images/bg/${slug}-${size}.${format}`)
        .filter((path) => !existsSync(path)),
    ));

    expect(missing).toEqual([]);
  });
});
