import { describe, expect, it } from 'vitest';
import { normalisePush, readState, safeUrl, TTL_MS } from '../worker/src/state.js';

const NOW = Date.parse('2026-08-16T02:15:00Z');

const push = (overrides = {}) => ({
  live: true,
  platform: 'twitch',
  title: 'Cathedral roof, night four',
  url: 'https://twitch.tv/alaydriem',
  viewers: 1204,
  ...overrides,
});

describe('safeUrl', () => {
  it('accepts http and https', () => {
    expect(safeUrl('https://twitch.tv/a')).toBe('https://twitch.tv/a');
    expect(safeUrl('http://twitch.tv/a')).toBe('http://twitch.tv/a');
  });

  it('rejects anything that could execute or embed', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('data:text/html,<script>')).toBe('');
    expect(safeUrl('not a url')).toBe('');
    expect(safeUrl('')).toBe('');
    expect(safeUrl(null)).toBe('');
  });
});

describe('normalisePush', () => {
  it('stamps the heartbeat from the server clock, not the sender', () => {
    // A sender-supplied timestamp would let a wrong clock on the streaming
    // machine keep the badge lit forever.
    expect(normalisePush(push({ beatAt: 0, heartbeatAt: '1999-01-01' }), NOW).beatAt).toBe(NOW);
  });

  it('keeps the fields worth storing', () => {
    expect(normalisePush(push(), NOW)).toEqual({
      live: true,
      beatAt: NOW,
      platform: 'twitch',
      title: 'Cathedral roof, night four',
      url: 'https://twitch.tv/alaydriem',
      viewers: 1204,
    });
  });

  // Ending a stream must never be rejected on a technicality, or the badge
  // stays lit until the TTL expires.
  it('always accepts a stop, even with nothing else in the payload', () => {
    expect(normalisePush({ live: false }, NOW)).toEqual({ live: false, beatAt: NOW });
  });

  it('refuses a live push with no usable url, so good state is not clobbered', () => {
    expect(normalisePush(push({ url: 'javascript:alert(1)' }), NOW)).toBeNull();
    expect(normalisePush(push({ url: '' }), NOW)).toBeNull();
  });

  it('refuses anything that is not an object', () => {
    for (const bad of [null, undefined, 42, 'live', []]) {
      expect(normalisePush(bad, NOW)).toBeNull();
    }
  });

  it('drops a viewer count that is not a sane number', () => {
    expect(normalisePush(push({ viewers: -1 }), NOW).viewers).toBeUndefined();
    expect(normalisePush(push({ viewers: 'lots' }), NOW).viewers).toBeUndefined();
    expect(normalisePush(push({ viewers: 12.6 }), NOW).viewers).toBe(13);
  });
});

describe('readState', () => {
  const stored = (overrides = {}) => normalisePush(push(), NOW - 60_000) && {
    ...normalisePush(push(), NOW - 60_000),
    ...overrides,
  };

  it('reports a fresh stream as live', () => {
    const state = readState(stored(), NOW);
    expect(state.live).toBe(true);
    expect(state.url).toBe('https://twitch.tv/alaydriem');
    expect(state.viewers).toBe(1204);
  });

  // Sent so the browser client's own validation keeps working unchanged
  // against either this Worker or the earlier gist.
  it('still sends heartbeatAt, so the client contract does not change', () => {
    expect(readState(stored(), NOW).heartbeatAt).toBe(new Date(NOW - 60_000).toISOString());
  });

  it('is live just inside the window and offline at the edge', () => {
    expect(readState(stored({ beatAt: NOW - TTL_MS + 1 }), NOW).live).toBe(true);
    expect(readState(stored({ beatAt: NOW - TTL_MS }), NOW).live).toBe(false);
  });

  // A crashed streaming machine stops sending heartbeats and self-corrects,
  // rather than advertising a stream that ended hours ago.
  it('goes offline once the heartbeats stop', () => {
    expect(readState(stored({ beatAt: NOW - 10 * 60_000 }), NOW).live).toBe(false);
  });

  it('treats an explicit stop as offline regardless of freshness', () => {
    expect(readState({ live: false, beatAt: NOW }, NOW)).toEqual({ live: false });
  });

  it('treats missing state as offline', () => {
    expect(readState(undefined, NOW)).toEqual({ live: false });
    expect(readState(null, NOW)).toEqual({ live: false });
  });
});
