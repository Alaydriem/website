import { describe, expect, it } from 'vitest';
import { STAR_COLOURS, generateStarfield } from '../src/lib/starfield.js';

const options = { seed: 7, width: 1600, height: 1000 };

describe('generateStarfield', () => {
  it('is deterministic for a seed, so every build ships the same sky', () => {
    expect(generateStarfield(options)).toEqual(generateStarfield(options));
  });

  it('changes with the seed', () => {
    expect(generateStarfield(options)).not.toEqual(generateStarfield({ ...options, seed: 8 }));
  });

  it('keeps every star inside the frame', () => {
    const { stars } = generateStarfield(options);

    expect(stars.length).toBeGreaterThan(0);
    for (const star of stars) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.x + star.size).toBeLessThanOrEqual(options.width);
      expect(star.y + star.size).toBeLessThanOrEqual(options.height);
    }
  });

  it('only uses spectrum token colours', () => {
    const { stars } = generateStarfield(options);

    for (const star of stars) {
      expect(STAR_COLOURS).toContain(star.colour);
    }
    expect(STAR_COLOURS.every((c) => /^--sp-[a-z]+$/.test(c))).toBe(true);
  });

  it('has both dim and glowing stars', () => {
    const { stars } = generateStarfield(options);

    expect(stars.some((s) => s.glow)).toBe(true);
    expect(stars.some((s) => !s.glow && s.opacity < 1)).toBe(true);
  });

  it('draws every constellation line between the centres of two glowing stars', () => {
    const { stars, lines } = generateStarfield(options);
    const centres = new Set(stars.filter((s) => s.glow)
      .map((s) => `${s.x + s.size / 2},${s.y + s.size / 2}`));

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(centres.has(`${line.x1},${line.y1}`)).toBe(true);
      expect(centres.has(`${line.x2},${line.y2}`)).toBe(true);
    }
  });
});
