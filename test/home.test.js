import { describe, expect, it } from 'vitest';
import { buildHomeRows } from '../src/lib/home.js';

const video = (id) => ({ id, title: `Video ${id}`, thumbnail: '', viewCount: 0, publishedAt: '' });
const playlist = (title, id, videoIds, slug = title.toLowerCase()) =>
  ({ id, title, slug, description: '', itemCount: videoIds.length, thumbnail: '', videoIds });

// Newest first, as data/youtube.json stores them.
const videos = ['s1', 'l1', 'v1', 'l2', 'v2', 'v3', 'v4', 'v5', 'b1', 'b2'].map(video);

const playlists = [
  playlist('Shorts', 'PLshorts', ['s1', 'b2']),
  playlist('Previous Livestreams', 'PLlive', ['l1', 'l2']),
  playlist('The Best Survival Builds', 'PLbuilds', ['v5', 'v4', 'v3'], 'the-best-survival-builds'),
  playlist('Bedrock Voice Chat', 'PLbvc', ['b2', 'b1', 'gone'], 'bedrock-voice-chat'),
];

const config = {
  perRow: 4,
  latest: { title: 'Latest videos', exclude: ['Previous Livestreams', 'Shorts'] },
  playlists: [
    { playlist: 'The Best Survival Builds', exclude: ['Shorts'] },
    { playlist: 'PLbvc', exclude: ['Shorts'] },
  ],
};

describe('buildHomeRows', () => {
  it('leads with the newest videos, minus livestreams and shorts', () => {
    const [latest] = buildHomeRows({ videos, playlists }, config);

    expect(latest.title).toBe('Latest videos');
    expect(latest.href).toBeNull();
    expect(latest.videos.map((v) => v.id)).toEqual(['v1', 'v2', 'v3', 'v4']);
  });

  it('follows with each configured playlist, in playlist order', () => {
    const [, builds] = buildHomeRows({ videos, playlists }, config);

    expect(builds.title).toBe('The Best Survival Builds');
    expect(builds.href).toBe('/playlists/the-best-survival-builds/');
    expect(builds.total).toBe(3);
    expect(builds.videos.map((v) => v.id)).toEqual(['v5', 'v4', 'v3']);
  });

  it('matches a playlist by id as well as by title', () => {
    const rows = buildHomeRows({ videos, playlists }, config);

    expect(rows[2].title).toBe('Bedrock Voice Chat');
  });

  it('drops excluded videos and videos missing from the data', () => {
    const [, , bvc] = buildHomeRows({ videos, playlists }, config);

    expect(bvc.videos.map((v) => v.id)).toEqual(['b1']);
  });

  it('caps every row at perRow', () => {
    const rows = buildHomeRows({ videos, playlists }, { ...config, perRow: 2 });

    expect(rows.every((row) => row.videos.length <= 2)).toBe(true);
  });

  it('leaves out a row whose playlist does not exist', () => {
    const rows = buildHomeRows({ videos, playlists }, {
      ...config,
      playlists: [{ playlist: 'Renamed Away', exclude: [] }],
    });

    expect(rows.map((row) => row.title)).toEqual(['Latest videos']);
  });

  it('leaves out a row that has no videos left after exclusion', () => {
    const rows = buildHomeRows({ videos, playlists }, {
      ...config,
      playlists: [{ playlist: 'Shorts', exclude: ['Shorts'] }],
    });

    expect(rows.map((row) => row.title)).toEqual(['Latest videos']);
  });

  it('ignores an exclusion that names no playlist', () => {
    const [latest] = buildHomeRows({ videos, playlists }, {
      ...config,
      latest: { title: 'Latest videos', exclude: ['Nope'] },
    });

    expect(latest.videos.map((v) => v.id)).toEqual(['s1', 'l1', 'v1', 'l2']);
  });
});
