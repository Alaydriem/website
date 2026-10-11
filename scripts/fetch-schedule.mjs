/**
 * Writes data/schedule.json from the Twitch schedule feed. The parsing lives
 * in lib/schedule.js; this file only touches the network and the filesystem,
 * which is why it has no tests.
 *
 * No key needed: the feed is public.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import site from '../src/lib/site.json' with { type: 'json' };
import { parseSchedule, toHttps } from './lib/schedule.js';

const ROOT = resolve(import.meta.dirname, '..');

const response = await fetch(toHttps(site.links.twitchSchedule));
if (!response.ok) {
  throw new Error(`Twitch schedule returned ${response.status}`);
}

const { schedule, skipped } = parseSchedule(await response.text(), new Date());

for (const title of skipped) {
  console.warn(`Skipped "${title}": not a weekly repeating event`);
}

// Same rule as the YouTube fetch. An empty answer is far more likely to be a
// bad response than a cleared schedule, and failing here keeps the last good
// file. To take the line off the site for real, empty this file by hand.
if (schedule.slots.length === 0) {
  throw new Error('Refusing to write an empty schedule');
}

mkdirSync(resolve(ROOT, 'data'), { recursive: true });
writeFileSync(
  resolve(ROOT, 'data/schedule.json'),
  `${JSON.stringify(schedule, null, 2)}\n`,
);

console.log(`Wrote ${schedule.slots.length} slots to data/schedule.json`);
