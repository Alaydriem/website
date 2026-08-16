import { describe, expect, it } from 'vitest';
import { readLive, TTL_MS } from '../src/scripts/lib/live.js';

const NOW = Date.parse('2026-08-15T02:15:00Z');

function payload(overrides = {}) {
  return {
    live: true,
    platform: 'twitch',
    title: 'Cathedral roof, night four',
    url: 'https://twitch.tv/alaydriem',
    viewers: 1204,
    heartbeatAt: '2026-08-15T02:14:00Z',
    ...overrides,
  };
}

describe('readLive', () => {
  it('accepts a fresh live payload', () => {
    expect(readLive(payload(), NOW)).toEqual({
      live: true,
      platform: 'twitch',
      title: 'Cathedral roof, night four',
      url: 'https://twitch.tv/alaydriem',
      viewers: 1204,
    });
  });

  it('treats a stale heartbeat as offline', () => {
    expect(readLive(payload({ heartbeatAt: '2026-08-15T02:10:00Z' }), NOW).live).toBe(false);
  });

  // The boundary is the whole point of the TTL: a crashed streaming machine
  // must self-correct rather than advertise a stream that ended hours ago.
  it('is live just inside the window and offline at the edge', () => {
    const inside = new Date(NOW - TTL_MS + 1).toISOString();
    const edge = new Date(NOW - TTL_MS).toISOString();
    expect(readLive(payload({ heartbeatAt: inside }), NOW).live).toBe(true);
    expect(readLive(payload({ heartbeatAt: edge }), NOW).live).toBe(false);
  });

  // A device whose clock is behind would otherwise see every heartbeat as
  // impossibly fresh, forever.
  it('rejects a heartbeat from the future', () => {
    expect(readLive(payload({ heartbeatAt: new Date(NOW + 60_000).toISOString() }), NOW).live)
      .toBe(false);
  });

  it('honours live:false even with a fresh heartbeat', () => {
    expect(readLive(payload({ live: false }), NOW).live).toBe(false);
  });

  it('requires a usable http(s) url', () => {
    expect(readLive(payload({ url: '' }), NOW).live).toBe(false);
    expect(readLive(payload({ url: 'javascript:alert(1)' }), NOW).live).toBe(false);
    expect(readLive(payload({ url: 'not a url' }), NOW).live).toBe(false);
  });

  it('survives every kind of malformed input', () => {
    for (const bad of [null, undefined, 42, 'live', [], {}, { live: true }]) {
      expect(readLive(bad, NOW).live).toBe(false);
    }
  });

  it('omits a viewer count that is not a sane number', () => {
    expect(readLive(payload({ viewers: -1 }), NOW).viewers).toBeUndefined();
    expect(readLive(payload({ viewers: 'lots' }), NOW).viewers).toBeUndefined();
    expect(readLive(payload({ viewers: Infinity }), NOW).viewers).toBeUndefined();
  });

  it('tolerates a missing title and platform', () => {
    const state = readLive(payload({ title: undefined, platform: undefined }), NOW);
    expect(state.live).toBe(true);
    expect(state.title).toBe('');
  });
});
