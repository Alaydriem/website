/**
 * Re-encodes hero background photographs into the responsive set the hero
 * cycles through.
 *
 * The hero shows one photograph at a time and fades between several of them, so
 * every one of them is paid for over the wire. A 2.5MB screenshot straight out
 * of Minecraft is fine as a source and indefensible as a background: the set
 * this produces lands each large AVIF near 100KB, against the 853KB JPEG the
 * site shipped with one image.
 *
 * Sources live outside the repository. Committing six 16:9 screenshots at full
 * resolution would add several megabytes that nothing ever serves, so this runs
 * by hand when the set changes and only its output is committed.
 *
 *   node scripts/optimize-backgrounds.mjs cathedral=/path/to/shot.png ...
 *
 * The slug on the left must match an entry in src/lib/backgrounds.js. The build
 * does not run this; it reads the files it leaves behind.
 */
import { mkdirSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const OUT_DIR = join('public', 'assets', 'images', 'bg');

/* Matched one-for-one by the media queries in _hero.scss and by the preload
   links in Base.astro. Changing a width here without changing both of those
   makes the browser download two copies of the same photograph. */
const WIDTHS = [
  { suffix: 'sm', width: 1024 },
  { suffix: 'md', width: 1600 },
  { suffix: 'lg', width: 2400 },
];

/* 16:9. Sources arrive at everything from 1632x640 to 4250x2086, and the hero
   is a full-bleed band, so they are all cropped to the same shape from the
   centre rather than letterboxed. */
const RATIO = 16 / 9;

/* AVIF at 50 is visually indistinguishable from the source on a photograph that
   sits behind a scrim at 35% opacity or less. JPEG is the fallback path only,
   so it is tuned for compatibility rather than for size. */
const AVIF = { quality: 50, effort: 6 };
const JPEG = { quality: 78, progressive: true, mozjpeg: true };

function parseArgs(argv) {
  if (argv.length === 0) {
    throw new Error(
      'No sources given. Usage: node scripts/optimize-backgrounds.mjs <slug>=<path> [...]',
    );
  }

  return argv.map((arg) => {
    const at = arg.indexOf('=');
    if (at < 1 || at === arg.length - 1) {
      throw new Error(`Expected <slug>=<path>, got "${arg}".`);
    }
    return { slug: arg.slice(0, at), source: arg.slice(at + 1) };
  });
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

async function encode(source, slug) {
  const rows = [];

  for (const { suffix, width } of WIDTHS) {
    const height = Math.round(width / RATIO);
    // Re-read the source per size. Reusing one pipeline across several
    // toFile calls resizes the already-resized buffer.
    const resized = () => sharp(source).resize(width, height, { fit: 'cover', position: 'centre' });

    const base = join(OUT_DIR, `${slug}-${suffix}`);
    await resized().avif(AVIF).toFile(`${base}.avif`);
    await resized().jpeg(JPEG).toFile(`${base}.jpg`);

    const [avif, jpeg] = await Promise.all([stat(`${base}.avif`), stat(`${base}.jpg`)]);
    rows.push({ suffix, width, avif: avif.size, jpeg: jpeg.size });
  }

  return rows;
}

const sources = parseArgs(process.argv.slice(2));
mkdirSync(OUT_DIR, { recursive: true });

let cycleAtLarge = 0;

for (const { slug, source } of sources) {
  const { size } = await stat(source);
  console.log(`${slug}  (source ${kb(size)})`);

  for (const row of await encode(source, slug)) {
    if (row.suffix === 'lg') cycleAtLarge += row.avif;
    console.log(
      `  ${row.suffix.padEnd(3)} ${String(row.width).padStart(4)}px`
      + `   avif ${kb(row.avif).padStart(9)}   jpeg ${kb(row.jpeg).padStart(9)}`,
    );
  }
}

/* The number that matters: what a visitor who sits through the whole cycle on a
   large screen downloads. Anyone who leaves earlier pays for less, because the
   cycler fetches each photograph in the slot before the one it is shown in. */
console.log(`\n${sources.length} backgrounds. Whole cycle at lg, AVIF: ${kb(cycleAtLarge)}.`);
