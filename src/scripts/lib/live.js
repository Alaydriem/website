/**
 * Live-status payload validation, with no DOM and no network.
 *
 * The hero renders pinned and complete on its own. Everything here exists to
 * decide whether to upgrade it, and every uncertain answer resolves to "no",
 * because staying pinned is the safe failure.
 */

/** A heartbeat older than this is treated as offline. Spec section 8.2. */
export const TTL_MS = 3 * 60 * 1000;

const OFFLINE = { live: false };

/** Only http(s) may reach an href. Blocks javascript: and data: payloads. */
function safeUrl(value) {
  if (typeof value !== 'string' || value === '') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : '';
  } catch {
    return '';
  }
}

export function readLive(payload, nowMs) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return OFFLINE;
  }
  if (payload.live !== true) return OFFLINE;

  const url = safeUrl(payload.url);
  if (!url) return OFFLINE;

  const beat = Date.parse(payload.heartbeatAt);
  if (Number.isNaN(beat)) return OFFLINE;

  // A future heartbeat means a wrong clock somewhere, so it is rejected rather
  // than trusted. The client compares against its own clock, and a device set
  // badly wrong sees the pinned hero.
  const age = nowMs - beat;
  if (age < 0 || age >= TTL_MS) return OFFLINE;

  const state = {
    live: true,
    platform: typeof payload.platform === 'string' ? payload.platform : '',
    title: typeof payload.title === 'string' ? payload.title : '',
    url,
  };

  const { viewers } = payload;
  if (typeof viewers === 'number' && Number.isFinite(viewers) && viewers >= 0) {
    state.viewers = viewers;
  }

  return state;
}
