import { readLive } from './lib/live.js';

/** Spec 8.3: give up quickly. A slow answer is worth nothing here. */
const TIMEOUT_MS = 2000;

/** Never re-check more often than this, and only while the tab is visible. */
const POLL_MS = 2 * 60 * 1000;

async function fetchLive(url) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);

  try {
    // Phase 0 measured this: without a cache-busting parameter the raw gist
    // URL serves a stale body for 304 seconds, which a 60 second heartbeat
    // cannot use. With one it lands at 63 seconds.
    const bust = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    const response = await fetch(bust, { signal: abort.signal, cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    // Timeout, network failure, or unparseable body. The hero stays pinned and
    // nothing is reported to the reader.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Applies live state to the hero.
 *
 * Changes text and colour only. It never inserts or removes an element, so the
 * upgrade cannot move layout — the constraint the whole two-state hero rests on.
 */
function apply(hero, state) {
  hero.dataset.live = String(state.live);

  const badge = hero.querySelector('[data-live-badge-text]');
  const title = hero.querySelector('[data-live-title]');
  const cta = hero.querySelector('[data-live-cta]');
  const viewers = hero.querySelector('[data-live-viewers]');

  if (!state.live) return;

  if (badge) badge.textContent = 'Live now';
  if (title && state.title) title.textContent = state.title;
  if (cta) {
    cta.textContent = state.platform === 'youtube' ? 'Watch on YouTube' : 'Watch the stream';
    cta.href = state.url;
  }
  if (viewers) {
    viewers.textContent = typeof state.viewers === 'number'
      ? `${state.viewers.toLocaleString()} watching`
      : '';
  }
}

export function initLiveStatus(root = document) {
  const hero = root.querySelector('[data-hero]');
  const url = root.querySelector('meta[name="live-status-url"]')?.content;

  // No URL configured means the feature is off. Make no request at all.
  if (!hero || !url) return;

  let last = 0;

  async function check() {
    last = Date.now();
    const payload = await fetchLive(url);
    if (payload === null) return;
    apply(hero, readLive(payload, Date.now()));
  }

  // After first paint. The hero is already complete and correct without this.
  requestAnimationFrame(() => setTimeout(check, 0));

  setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - last >= POLL_MS) {
      check();
    }
  }, 20000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - last >= POLL_MS) {
      check();
    }
  });
}
