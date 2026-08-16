import { normalisePush, readState } from './state.js';

/**
 * Live status for www.alaydriem.com.
 *
 *   streamer.bot  --POST /api/live-->  Worker  --> Durable Object
 *   the page      --GET  /api/live-->  Worker  <-- Durable Object
 *
 * The Worker runs on a route of the site's own domain, ahead of GitHub Pages,
 * so the page reads it same-origin: no CORS, no third-party host, and the URL
 * stays valid if the site is ever hosted elsewhere.
 *
 * A Durable Object rather than KV, for two reasons. KV's free tier allows
 * 1,000 writes a day and a 60 second heartbeat is 1,440, so a single long
 * stream would exhaust it. KV is also eventually consistent, which is the same
 * propagation delay that made the raw gist URL unusable. A Durable Object is
 * strongly consistent, so a push is visible on the next read.
 */

/** Holds the single live-state record. One instance, named "live". */
export class LiveState {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const now = Date.now();

    if (request.method === 'POST') {
      const payload = await request.json().catch(() => null);
      const next = normalisePush(payload, now);

      // A malformed push must not overwrite good state with rubbish.
      if (!next) {
        return Response.json({ ok: false, error: 'unusable payload' }, { status: 400 });
      }

      await this.state.storage.put('state', next);
      return Response.json({ ok: true, ...readState(next, now) });
    }

    const stored = await this.state.storage.get('state');
    return Response.json(readState(stored, now));
  }
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  // The whole point is freshness. Nothing between the edge and the reader may
  // hold a copy: a cached "live" outlives the stream.
  'cache-control': 'no-store, max-age=0',
};

/** Constant-time-ish compare, so a wrong token leaks nothing by timing. */
function tokenMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false;
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname !== '/api/live' && pathname !== '/api/live/') {
      return new Response('Not found', { status: 404 });
    }

    const object = env.LIVE_STATE.get(env.LIVE_STATE.idFromName('live'));

    if (request.method === 'POST') {
      const header = request.headers.get('authorization') ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';

      if (!tokenMatches(token, env.LIVE_TOKEN)) {
        // Deliberately terse: no hint about which part was wrong.
        return new Response('Unauthorized', { status: 401 });
      }

      const response = await object.fetch(request);
      return new Response(response.body, { status: response.status, headers: JSON_HEADERS });
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      const response = await object.fetch(new Request(request.url, { method: 'GET' }));
      return new Response(response.body, { status: 200, headers: JSON_HEADERS });
    }

    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, POST' } });
  },
};
