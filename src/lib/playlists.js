/**
 * Ordering, hiding and slugging for the playlists page.
 *
 * YouTube's playlists.list returns no user-defined order — the arrangement on
 * a channel page comes from the separate channelSections API, and that only
 * describes sections someone has explicitly built, not every playlist. So the
 * order here is configured rather than inherited, in src/lib/site.json.
 */

/** "Truly Bedrock Season 6" -> "truly-bedrock-season-6" */
export function slugify(title) {
  return String(title)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Matches a configured entry against a playlist by id or by exact title.
 * @param {string} entry
 * @param {{ id: string, title: string }} playlist
 */
function matches(entry, playlist) {
  return entry === playlist.id || entry === playlist.title;
}

/**
 * @param {{ id: string, title: string }} playlist
 * @param {string[]} order
 */
function rank(playlist, order) {
  const index = order.findIndex((entry) => matches(entry, playlist));
  return index === -1 ? Infinity : index;
}

/**
 * Applies the configured order, drops hidden playlists, and assigns a stable
 * slug to each.
 *
 * Anything named in `order` leads, in that order. Everything else follows,
 * largest first, so a new playlist appears without needing configuration —
 * just not at the top, which is the position that has to be earned.
 *
 * Entries may be given as a playlist id or as its exact title. Titles are
 * friendlier to write; ids survive a rename.
 *
 * The parameters are annotated because the empty-array defaults would
 * otherwise be inferred as never[], which rejects every real call.
 *
 * @typedef {{
 *   id: string, title: string, description: string,
 *   itemCount: number, thumbnail: string, videoIds: string[]
 * }} Playlist
 *
 * @param {Playlist[]} playlists
 * @param {{ order?: string[], hidden?: string[] }} [config]
 * @returns {(Playlist & { slug: string })[]}
 */
export function arrangePlaylists(playlists, { order = [], hidden = [] } = {}) {
  const visible = playlists.filter(
    (playlist) => !hidden.some((entry) => matches(entry, playlist)),
  );

  const sorted = [...visible].sort((a, b) => {
    // Compared for equality first. Both ranks are Infinity for unconfigured
    // playlists, and Infinity - Infinity is NaN, which is !== 0 — so
    // subtracting would return NaN, skip every tie-break below, and leave the
    // array in whatever order the API answered in.
    const rankA = rank(a, order);
    const rankB = rank(b, order);
    if (rankA !== rankB) return rankA - rankB;

    const bySize = b.videoIds.length - a.videoIds.length;
    if (bySize !== 0) return bySize;

    // Last resort, so the build output does not depend on API response order.
    return a.title.localeCompare(b.title);
  });

  const seen = new Map();

  return sorted.map((playlist) => {
    const base = slugify(playlist.title) || playlist.id.toLowerCase();

    // Two playlists can share a title, or slug to the same thing. The id
    // suffix keeps the URL unique and stable for whichever came second.
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const slug = count === 0 ? base : `${base}-${playlist.id.slice(-6).toLowerCase()}`;

    return { ...playlist, slug };
  });
}
