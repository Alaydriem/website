/**
 * Live-state evaluation, with no platform API.
 *
 * Kept separate from the Worker so it can be tested directly rather than
 * through a deployed edge runtime.
 */

/** A heartbeat older than this means the stream is over. Spec section 8.2. */
export const TTL_MS = 3 * 60 * 1000;

export const OFFLINE = { live: false };

/** Only http(s) may reach an href. Blocks javascript: and data: payloads. */
export function safeUrl(value) {
  if (typeof value !== 'string' || value === '') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : '';
  } catch {
    return '';
  }
}

/**
 * Normalises what streamer.bot sent into what is worth storing.
 *
 * Returns null when the payload is unusable, so a malformed push cannot
 * overwrite a good state with rubbish.
 */
export function normalisePush(payload, nowMs) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  // An explicit stop is always accepted: ending a stream must never be
  // rejected on a technicality, or the badge stays lit until the TTL expires.
  if (payload.live !== true) {
    return { live: false, beatAt: nowMs };
  }

  const url = safeUrl(payload.url);
  if (!url) return null;

  const state = {
    live: true,
    beatAt: nowMs,
    url,
    platform: typeof payload.platform === 'string' ? payload.platform : '',
    title: typeof payload.title === 'string' ? payload.title : '',
  };

  const { viewers } = payload;
  if (typeof viewers === 'number' && Number.isFinite(viewers) && viewers >= 0) {
    state.viewers = Math.round(viewers);
  }

  return state;
}

/**
 * Turns stored state into the response body.
 *
 * The TTL is applied here, on a server with a correct clock, rather than in the
 * browser. That removes the clock-skew failure mode the gist design had to
 * tolerate: a viewer whose device clock is wrong now sees the same answer as
 * everyone else.
 *
 * heartbeatAt is still sent so the client's own validation keeps working
 * unchanged against either backend.
 */
export function readState(stored, nowMs) {
  if (!stored || stored.live !== true) return OFFLINE;

  const age = nowMs - stored.beatAt;
  if (age < 0 || age >= TTL_MS) return OFFLINE;

  const out = {
    live: true,
    platform: stored.platform ?? '',
    title: stored.title ?? '',
    url: stored.url,
    heartbeatAt: new Date(stored.beatAt).toISOString(),
  };
  if (typeof stored.viewers === 'number') out.viewers = stored.viewers;
  return out;
}
