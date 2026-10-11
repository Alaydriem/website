/**
 * The starfield behind the homepage, ported from the Stream Kit overlays.
 *
 * Generated at build time from a fixed seed, so every build ships the same sky
 * and the page needs no script to draw it. Three layers, as in the overlays:
 * many small dim blocks, a few glowing ones, and faint lines that join some of
 * the glowing ones into constellations.
 *
 * Stars are squares, not dots. Minecraft is made of blocks, and so is the
 * Bedrock Voice Chat mark the spectrum is sampled from.
 */

/** Every colour a star may take: spectrum stops from _tokens.scss. Violet is
    left out because it belongs to the product band. */
export const STAR_COLOURS = [
  '--sp-indigo', '--sp-blue', '--sp-azure', '--sp-cyan',
  '--sp-teal', '--sp-green', '--sp-grass', '--sp-lime', '--sp-yellow',
  '--sp-amber', '--sp-orange', '--sp-red',
];

const DIM_STARS = 70;
const LONE_BRIGHT_STARS = 6;
const CONSTELLATIONS = 3;
const CONSTELLATION_POINTS = { min: 3, max: 6 };
const CONSTELLATION_RADIUS = 170;

/**
 * mulberry32: small, fast, and good enough for scattering decoration.
 * @param {number} seed
 * @returns {() => number} a function returning values in [0, 1)
 */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @typedef {{ x: number, y: number, size: number, colour: string, opacity: number, glow: boolean }} Star
 * @typedef {{ x1: number, y1: number, x2: number, y2: number }} Line
 */

/**
 * @param {{ seed: number, width: number, height: number }} options
 * @returns {{ stars: Star[], lines: Line[] }}
 */
export function generateStarfield({ seed, width, height }) {
  const next = random(seed);
  const between = (min, max) => min + next() * (max - min);
  const whole = (min, max) => Math.floor(between(min, max + 1));
  const pick = () => STAR_COLOURS[whole(0, STAR_COLOURS.length - 1)];
  const clamp = (value, size, limit) => Math.min(Math.max(value, 0), limit - size);

  /** Positions are whole numbers so line ends meet star centres exactly. */
  const star = (x, y, size, opacity, glow) => ({
    x: Math.round(clamp(x, size, width)),
    y: Math.round(clamp(y, size, height)),
    size,
    colour: pick(),
    opacity,
    glow,
  });

  const dim = Array.from({ length: DIM_STARS }, () =>
    star(between(0, width), between(0, height), whole(2, 4), Number(between(0.2, 0.5).toFixed(2)), false));

  const lone = Array.from({ length: LONE_BRIGHT_STARS }, () =>
    star(between(0, width), between(0, height), whole(4, 6) * 2, 1, true));

  const groups = Array.from({ length: CONSTELLATIONS }, () => {
    const cx = between(0, width);
    const cy = between(0, height);
    const count = whole(CONSTELLATION_POINTS.min, CONSTELLATION_POINTS.max);
    return Array.from({ length: count }, () => star(
      cx + between(-CONSTELLATION_RADIUS, CONSTELLATION_RADIUS),
      cy + between(-CONSTELLATION_RADIUS, CONSTELLATION_RADIUS),
      // Even sizes keep each centre on a whole number.
      whole(3, 5) * 2,
      1,
      true,
    ));
  });

  const centre = (s) => [s.x + s.size / 2, s.y + s.size / 2];

  // A chain through the points in the order they were placed. Crossed lines
  // are fine; the overlays have them too.
  const lines = groups.flatMap((points) => points.slice(1).map((point, i) => {
    const [x1, y1] = centre(points[i]);
    const [x2, y2] = centre(point);
    return { x1, y1, x2, y2 };
  }));

  return { stars: [...dim, ...lone, ...groups.flat()], lines };
}
