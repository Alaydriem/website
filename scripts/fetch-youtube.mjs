/**
 * Writes data/youtube.json. The transform lives in lib/youtube.js; this file
 * only reads the environment and the filesystem, which is why it has no tests.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import site from '../src/lib/site.json' with { type: 'json' };
import { requireEnv } from './lib/env.js';
import { buildYouTubeData } from './lib/youtube.js';

const ROOT = resolve(import.meta.dirname, '..');

const apiKey = requireEnv('YOUTUBE_API_KEY', process.env);

const data = await buildYouTubeData(fetch, {
  channelId: site.channelId,
  apiKey,
  now: () => new Date(),
});

if (data.videos.length === 0) {
  throw new Error('Refusing to write an empty video list');
}

mkdirSync(resolve(ROOT, 'data'), { recursive: true });
writeFileSync(
  resolve(ROOT, 'data/youtube.json'),
  `${JSON.stringify(data, null, 2)}\n`,
);

console.log(`Wrote ${data.videos.length} videos to data/youtube.json`);
