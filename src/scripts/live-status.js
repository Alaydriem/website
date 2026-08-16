import { readLive } from './lib/live.js';
import { streamEmbed } from './lib/embed.js';

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
/**
 * Swaps the hero between its pinned and live states.
 *
 * Going live replaces the whole block rather than editing the pinned one in
 * place. An earlier version only changed text and colour, which kept the page
 * from ever shifting but made a live stream look indistinguishable from a
 * badly written hero. Offline — the overwhelmingly common case — nothing here
 * runs and nothing moves.
 */
function apply(hero, state) {
  const wasLive = hero.dataset.live === 'true';
  hero.dataset.live = String(state.live);

  const pinned = hero.querySelector('[data-pinned-block]');
  const block = hero.querySelector('[data-live-block]');
  const player = hero.querySelector('[data-live-player]');
  const fallback = hero.querySelector('[data-live-fallback]');
  const title = hero.querySelector('[data-live-title]');
  const cta = hero.querySelector('[data-live-cta]');
  const viewers = hero.querySelector('[data-live-viewers]');

  if (!state.live) {
    if (block) block.hidden = true;
    if (pinned) pinned.hidden = false;
    // Drop the src so a stream that has ended stops playing and stops
    // fetching. Only touched on a real transition, so a poll while already
    // offline does not reload anything.
    if (player && wasLive) player.removeAttribute('src');
    return;
  }

  const onYouTube = state.platform === 'youtube';

  if (title) title.textContent = state.title || 'Live on stream';
  if (cta) {
    cta.textContent = onYouTube ? 'Watch on YouTube' : 'Watch on Twitch';
    cta.href = state.url;
  }
  if (fallback) fallback.href = state.url;

  // The stream runs on both platforms at once, so whichever one is embedded,
  // the other gets a link. Hidden if that URL was never configured.
  const alt = hero.querySelector('[data-live-alt]');
  if (alt && block) {
    const href = onYouTube ? block.dataset.altTwitch : block.dataset.altYoutube;
    if (href) {
      alt.href = href;
      alt.textContent = onYouTube ? 'Also on Twitch' : 'Also on YouTube';
      alt.hidden = false;
    } else {
      alt.hidden = true;
    }
  }
  if (viewers) {
    viewers.textContent = typeof state.viewers === 'number'
      ? `${state.viewers.toLocaleString()} watching now`
      : '';
  }

  if (player) {
    // Rebuilt only on the offline-to-live transition. Setting src on every
    // poll would restart the player every two minutes.
    if (!wasLive || !player.getAttribute('src')) {
      const motion = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const embed = streamEmbed(state, window.location.hostname, { motion });

      if (embed) {
        player.setAttribute('src', embed);
        player.hidden = false;
        if (fallback) fallback.hidden = true;
      } else {
        // Nothing we are willing to frame. The link still works.
        player.removeAttribute('src');
        player.hidden = true;
        if (fallback) fallback.hidden = false;
      }
    }
  }

  if (pinned) pinned.hidden = true;
  if (block) block.hidden = false;
}

/** Hosts where the preview override is honoured. */
const LOCAL = ['localhost', '127.0.0.1', '[::1]', ''];

/**
 * Renders the live takeover from canned data, with no network.
 *
 * /api/live is a Cloudflare Worker route, so it does not exist in `astro dev`
 * and the takeover is otherwise impossible to look at without going live.
 * Visit http://localhost:4321/?preview=live to see it.
 *
 * Restricted to local hosts on purpose: on the deployed site this would be a
 * link that makes the page claim a stream is running when none is.
 */
function previewIfRequested(hero) {
  if (!LOCAL.includes(window.location.hostname)) return false;
  if (new URLSearchParams(window.location.search).get('preview') !== 'live') return false;

  apply(hero, readLive({
    live: true,
    platform: 'twitch',
    title: 'Cathedral roof, night four',
    url: 'https://twitch.tv/alaydriem',
    viewers: 1204,
    heartbeatAt: new Date().toISOString(),
  }, Date.now()));

  return true;
}

export function initLiveStatus(root = document) {
  const hero = root.querySelector('[data-hero]');
  if (!hero) return;

  // Checked before the URL, so the preview works whether or not live status
  // is configured.
  if (previewIfRequested(hero)) return;

  const url = root.querySelector('meta[name="live-status-url"]')?.content;

  // No URL configured means the feature is off. Make no request at all.
  if (!url) return;

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
