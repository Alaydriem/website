/**
 * The video rows on the homepage's Watch panel.
 *
 * The newest uploads alone made a poor front page: the channel streams most
 * weekends, so the latest eight were nearly all livestream replays. The rows
 * are configured in src/lib/site.json instead — the newest videos with the
 * replays taken out, then a short list of hand-picked playlists.
 */
import { matches } from './playlists.js';

/**
 * @typedef {{ id: string, title: string, thumbnail: string, viewCount: number, publishedAt: string }} Video
 * @typedef {{ id: string, title: string, slug: string, videoIds: string[] }} Playlist
 * @typedef {{ title: string, href: string | null, total: number, videos: Video[] }} HomeRow
 * @typedef {{
 *   perRow: number,
 *   latest: { title: string, exclude: string[] },
 *   playlists: { playlist: string, exclude: string[] }[],
 * }} HomeConfig
 */

/**
 * Every video id in the playlists named by `entries`. An entry that names no
 * playlist excludes nothing, so a renamed playlist cannot break the build.
 *
 * @param {Playlist[]} playlists
 * @param {string[]} entries
 * @returns {Set<string>}
 */
function excludedIds(playlists, entries) {
  return new Set(playlists
    .filter((playlist) => entries.some((entry) => matches(entry, playlist)))
    .flatMap((playlist) => playlist.videoIds));
}

/**
 * Builds the rows in display order. A row with no videos is left out: an
 * empty heading is worse than no heading.
 *
 * @param {{ videos: Video[], playlists: Playlist[] }} youtube
 *   `playlists` must already carry slugs, from arrangePlaylists, so the links
 *   here agree with the playlists page.
 * @param {HomeConfig} config
 * @returns {HomeRow[]}
 */
export function buildHomeRows({ videos, playlists }, { perRow, latest, playlists: picks }) {
  const byId = new Map(videos.map((video) => [video.id, video]));

  const latestOut = excludedIds(playlists, latest.exclude);
  const latestRow = {
    title: latest.title,
    href: null,
    total: videos.length,
    videos: videos.filter((video) => !latestOut.has(video.id)).slice(0, perRow),
  };

  const playlistRows = picks.flatMap(({ playlist: entry, exclude }) => {
    const playlist = playlists.find((candidate) => matches(entry, candidate));
    if (!playlist) return [];

    const out = excludedIds(playlists, exclude);
    // flatMap rather than map().filter(Boolean): a playlist can name a video
    // that is no longer public, and so is not in the data.
    const shown = playlist.videoIds
      .filter((id) => !out.has(id))
      .flatMap((id) => {
        const video = byId.get(id);
        return video ? [video] : [];
      })
      .slice(0, perRow);

    return [{
      title: playlist.title,
      href: `/playlists/${playlist.slug}/`,
      total: playlist.videoIds.length,
      videos: shown,
    }];
  });

  return [latestRow, ...playlistRows].filter((row) => row.videos.length > 0);
}
