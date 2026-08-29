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

// Load .env when there is one, for local runs. In CI there is no such file and
// the key arrives as a workflow secret already on process.env, so a missing
// file is the normal case rather than an error. Node's own loader, so no
// dependency: available since 20.12.
try {
  process.loadEnvFile(resolve(ROOT, '.env'));
} catch {
  // No .env. Fall through to whatever the environment already provides.
}

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
