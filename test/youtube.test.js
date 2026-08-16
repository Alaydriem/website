import { describe, expect, it, vi } from 'vitest';
import {
  buildYouTubeData,
  chunk,
  fetchPlaylists,
  fetchPlaylistVideoIds,
  fetchUploadsPlaylistId,
  fetchVideoDetails,
  roundViews,
} from '../scripts/lib/youtube.js';

import channels from './fixtures/channels.json' with { type: 'json' };
import page1 from './fixtures/playlist-page1.json' with { type: 'json' };
import page2 from './fixtures/playlist-page2.json' with { type: 'json' };
import videos from './fixtures/videos.json' with { type: 'json' };
import playlists from './fixtures/playlists.json' with { type: 'json' };

/** Returns a fetch stand-in that answers by matching a substring of the URL. */
function fakeFetch(routes) {
  return vi.fn(async (url) => {
    for (const [needle, body] of routes) {
      if (url.includes(needle)) {
        return { ok: true, status: 200, json: async () => body };
      }
    }
    throw new Error(`unexpected url: ${url}`);
  });
}

describe('chunk', () => {
  it('splits into equal groups', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it('leaves a short final group', () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });

  it('returns nothing for an empty list', () => {
    expect(chunk([], 50)).toEqual([]);
  });
});

describe('roundViews', () => {
  it('keeps counts below a thousand exact, because they are shown in full', () => {
    expect(roundViews(0)).toBe(0);
    expect(roundViews(7)).toBe(7);
    expect(roundViews(999)).toBe(999);
  });

  it('keeps three significant figures, which is what "8.8K" resolves', () => {
    expect(roundViews(8804)).toBe(8800);
    expect(roundViews(10875)).toBe(10900);
    expect(roundViews(919129)).toBe(919000);
  });

  // The point of the rounding: absorb small drift so a quiet channel produces
  // no diff and therefore no deploy. It cannot absorb all of it — every
  // rounding scheme has a boundary, and a count sitting on one still flips.
  // The guarantee is "quiet periods are free", not "never changes".
  it('collapses a run of drifting counts onto one value', () => {
    const bucket = [8801, 8802, 8803, 8804].map(roundViews);
    expect(new Set(bucket).size).toBe(1);
    expect(bucket[0]).toBe(8800);
  });

  it('still moves when the count crosses a rounding boundary', () => {
    expect(roundViews(8804)).not.toBe(roundViews(8805));
  });

  it('leaves an already-round number alone', () => {
    expect(roundViews(82000)).toBe(82000);
    expect(roundViews(41200)).toBe(41200);
    expect(roundViews(4800000)).toBe(4800000);
  });
});

describe('fetchUploadsPlaylistId', () => {
  it('reads the uploads playlist and the channel statistics', async () => {
    const f = fakeFetch([['/channels?', channels]]);
    const result = await fetchUploadsPlaylistId(f, { channelId: 'UCX', apiKey: 'k' });

    expect(result.playlistId).toBe('UUXgqRZv7bHsKzwYBrtA9DFA');
    expect(result.channel).toEqual({
      id: 'UCXgqRZv7bHsKzwYBrtA9DFA',
      title: 'Alaydriem',
      subscriberCount: 41200,
      videoCount: 312,
      viewCount: 4800000,
    });
  });

  it('costs exactly one call', async () => {
    const f = fakeFetch([['/channels?', channels]]);
    await fetchUploadsPlaylistId(f, { channelId: 'UCX', apiKey: 'k' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('never calls the search endpoint', async () => {
    const f = fakeFetch([['/channels?', channels]]);
    await fetchUploadsPlaylistId(f, { channelId: 'UCX', apiKey: 'k' });
    expect(f.mock.calls.some(([url]) => url.includes('/search'))).toBe(false);
  });

  it('throws when the channel is not found', async () => {
    const f = fakeFetch([['/channels?', { items: [] }]]);
    await expect(fetchUploadsPlaylistId(f, { channelId: 'UCX', apiKey: 'k' }))
      .rejects.toThrow('Channel not found: UCX');
  });
});

describe('fetchPlaylistVideoIds', () => {
  it('follows every page', async () => {
    const f = vi.fn(async (url) => ({
      ok: true,
      status: 200,
      json: async () => (url.includes('pageToken=PAGE2') ? page2 : page1),
    }));

    const ids = await fetchPlaylistVideoIds(f, { playlistId: 'UUX', apiKey: 'k' });

    expect(ids).toEqual(['vid001', 'vid002', 'vid003']);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('requests the maximum page size so page count stays low', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => page2 }));
    await fetchPlaylistVideoIds(f, { playlistId: 'UUX', apiKey: 'k' });
    expect(f.mock.calls[0][0]).toContain('maxResults=50');
  });
});

describe('fetchVideoDetails', () => {
  it('normalises statistics to numbers and picks the largest thumbnail', async () => {
    const f = fakeFetch([['/videos?', videos]]);
    const result = await fetchVideoDetails(f, { ids: ['vid001', 'vid002'], apiKey: 'k' });

    expect(result[0]).toEqual({
      id: 'vid001',
      title: 'The 400/hr iron farm',
      description: 'A farm that should not work.',
      publishedAt: '2026-08-12T15:00:00Z',
      duration: 'PT18M2S',
      viewCount: 82000,
      thumbnail: 'https://i.ytimg.com/vi/vid001/maxresdefault.jpg',
      tags: ['minecraft', 'bedrock'],
    });
  });

  // The fixture always returns both items, so index 1 is vid002, which has no
  // maxres thumbnail and no tags.
  it('falls back to a smaller thumbnail when maxres is absent', async () => {
    const f = fakeFetch([['/videos?', videos]]);
    const result = await fetchVideoDetails(f, { ids: ['vid001', 'vid002'], apiKey: 'k' });
    expect(result[1].thumbnail).toBe('https://i.ytimg.com/vi/vid002/mqdefault.jpg');
  });

  it('defaults tags to an empty list', async () => {
    const f = fakeFetch([['/videos?', videos]]);
    const result = await fetchVideoDetails(f, { ids: ['vid001', 'vid002'], apiKey: 'k' });
    expect(result[1].tags).toEqual([]);
  });

  it('sends at most 50 ids per call', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `v${i}`);
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) }));
    await fetchVideoDetails(f, { ids, apiKey: 'k' });

    expect(f).toHaveBeenCalledTimes(3);
    for (const [url] of f.mock.calls) {
      expect(url.match(/id=([^&]*)/)[1].split(',').length).toBeLessThanOrEqual(50);
    }
  });
});

describe('fetchPlaylists', () => {
  it('reads title, description, item count and thumbnail', async () => {
    const f = fakeFetch([['/playlists?', playlists]]);
    const result = await fetchPlaylists(f, { channelId: 'UCX', apiKey: 'k' });

    expect(result[0]).toEqual({
      id: 'PLlivestreams',
      title: 'Previous livestreams',
      description: 'Every stream, after the fact.',
      itemCount: 2,
      thumbnail: 'https://i.ytimg.com/vi/vid001/maxresdefault.jpg',
    });
  });

  it('costs one call per page, not one per playlist', async () => {
    const f = fakeFetch([['/playlists?', playlists]]);
    await fetchPlaylists(f, { channelId: 'UCX', apiKey: 'k' });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('buildYouTubeData', () => {
  /**
   * Routes a whole build. `/playlists?` must be matched before
   * `/playlistItems?`, and the uploads listing paginates while a named
   * playlist does not.
   */
  function wholeChannel() {
    return vi.fn(async (url) => {
      let body;
      if (url.includes('/channels?')) body = channels;
      else if (url.includes('/playlists?')) body = playlists;
      else if (url.includes('/playlistItems?')) {
        if (url.includes('PLlivestreams')) body = { items: [{ contentDetails: { videoId: 'vid001' } }] };
        else if (url.includes('PLforeign')) body = { items: [{ contentDetails: { videoId: 'notmine' } }] };
        else if (url.includes('PLempty')) body = { items: [] };
        // Anything else is the uploads playlist, which paginates.
        else body = url.includes('PAGE2') ? page2 : page1;
      } else body = videos;

      return { ok: true, status: 200, json: async () => body };
    });
  }

  it('assembles the committed shape, newest first', async () => {
    const data = await buildYouTubeData(wholeChannel(), {
      channelId: 'UCX',
      apiKey: 'k',
      now: () => new Date('2026-08-15T00:00:00Z'),
    });

    expect(data.channel.subscriberCount).toBe(41200);
    expect(data.videos.map((v) => v.id)).toEqual(['vid001', 'vid002']);
  });

  // A timestamp in the committed file would change on every scheduled run and
  // force a deploy every three hours whether or not the channel changed.
  it('carries no wall-clock timestamp', async () => {
    const data = await buildYouTubeData(wholeChannel(), {
      channelId: 'UCX',
      apiKey: 'k',
      now: () => new Date('2026-08-15T00:00:00Z'),
    });

    expect(data.fetchedAt).toBeUndefined();
    expect(Object.keys(data).sort()).toEqual(['channel', 'playlists', 'videos']);
  });

  it('keeps only playlist members it holds details for', async () => {
    const data = await buildYouTubeData(wholeChannel(), {
      channelId: 'UCX',
      apiKey: 'k',
      now: () => new Date('2026-08-15T00:00:00Z'),
    });

    const live = data.playlists.find((p) => p.id === 'PLlivestreams');
    expect(live.title).toBe('Previous livestreams');
    expect(live.videoIds).toEqual(['vid001']);

    // A playlist of other people's videos has nothing renderable left, so it
    // is dropped rather than rendered as a heading over an empty row.
    expect(data.playlists.map((p) => p.id)).not.toContain('PLforeign');

    // An empty playlist never had anything to drop.
    expect(data.playlists.map((p) => p.id)).not.toContain('PLempty');
  });

  it('rejects on a non-ok response rather than writing partial data', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }));
    await expect(
      buildYouTubeData(f, { channelId: 'UCX', apiKey: 'k', now: () => new Date() }),
    ).rejects.toThrow('YouTube API returned 403');
  });
});
