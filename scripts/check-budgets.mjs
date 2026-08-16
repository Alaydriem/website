/**
 * Enforces the size budgets from spec section 11: under 40KB of JavaScript and
 * under 40KB of CSS, both compressed.
 *
 * Phase 2 measured 3.1KB and 1.4KB, so this is a guard against regression
 * rather than a target to hit. It fails loudly rather than warning, because a
 * budget nobody enforces is a comment.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const LIMIT = { '.css': 40 * 1024, '.js': 40 * 1024 };
const DIST = 'dist';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const totals = { '.css': 0, '.js': 0 };

for (const file of walk(DIST)) {
  const ext = extname(file);
  if (!(ext in totals)) continue;
  totals[ext] += gzipSync(readFileSync(file)).length;
}

// Scripts small enough for Astro to inline live inside index.html rather than
// as a .js file, so they would otherwise escape the budget entirely.
const home = readFileSync(join(DIST, 'index.html'), 'utf8');
for (const [, body] of home.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
  totals['.js'] += gzipSync(Buffer.from(body)).length;
}

let failed = false;
for (const [ext, bytes] of Object.entries(totals)) {
  const kb = (bytes / 1024).toFixed(2);
  const limitKb = (LIMIT[ext] / 1024).toFixed(0);
  const ok = bytes <= LIMIT[ext];
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${ext.padEnd(5)} ${kb.padStart(8)} KB gzipped (limit ${limitKb} KB)`);
}

if (failed) {
  process.exit(1);
}
