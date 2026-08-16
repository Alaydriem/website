const API = 'https://youtube.googleapis.com/youtube/v3';

/** The API accepts at most 50 ids or results per request. */
const PAGE = 50;

export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function getJson(fetchFn, url) {
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`YouTube API returned ${response.status}`);
  }
  return response.json();
}

export async function fetchUploadsPlaylistId(fetchFn, { channelId, apiKey }) {
  const url = `${API}/channels?part=contentDetails,snippet,statistics&id=${channelId}&key=${apiKey}`;
  const body = await getJson(fetchFn, url);
  const item = body.items?.[0];
  if (!item) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  const stats = item.statistics ?? {};
  return {
    playlistId: item.contentDetails.relatedPlaylists.uploads,
    channel: {
      id: item.id,
      title: item.snippet.title,
      // videoCount stays exact: it is a small integer that moves only when a
      // video is published, which is a change worth deploying for. The other
      // two drift continuously, so they get the same treatment as per-video
      // counts. See roundViews below.
      subscriberCount: roundViews(Number(stats.subscriberCount ?? 0)),
      videoCount: Number(stats.videoCount ?? 0),
      viewCount: roundViews(Number(stats.viewCount ?? 0)),
    },
  };
}

export async function fetchPlaylistVideoIds(fetchFn, { playlistId, apiKey }) {
  const ids = [];
  let pageToken = '';

  do {
    const page = pageToken ? `&pageToken=${pageToken}` : '';
    const url = `${API}/playlistItems?part=contentDetails&maxResults=${PAGE}`
      + `&playlistId=${playlistId}&key=${apiKey}${page}`;
    const body = await getJson(fetchFn, url);

    for (const item of body.items ?? []) {
      ids.push(item.contentDetails.videoId);
    }
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);

  return ids;
}

/**
 * Rounds a view count to the precision the site renders.
 *
 * Raw counts tick up continuously: two fetches a minute apart already disagree
 * on several videos. Committing that precision means the scheduled refresh
 * finds a diff on every run and deploys, for a change no visitor could see.
 *
 * Three significant figures is what the "8.8K views" display format resolves,
 * so anything finer is stored precision the page throws away. Counts below a
 * thousand are shown in full and are kept exact.
 *
 * This absorbs drift rather than eliminating it. A count sitting on a rounding
 * boundary still flips, so an active channel will still produce commits — which
 * is correct, because the rendered page really has changed. What it buys is
 * that a quiet channel produces no diff and no deploy at all.
 */
export function roundViews(count) {
  if (count < 1000) {
    return count;
  }
  const magnitude = 10 ** (Math.floor(Math.log10(count)) - 2);
  return Math.round(count / magnitude) * magnitude;
}

/** Largest first. The hero and the cards both want the biggest available. */
const THUMBNAIL_ORDER = ['maxres', 'standard', 'high', 'medium', 'default'];

function pickThumbnail(thumbnails = {}) {
  for (const size of THUMBNAIL_ORDER) {
    if (thumbnails[size]?.url) {
      return thumbnails[size].url;
    }
  }
  return '';
}

/**
 * Lists the channel's public playlists.
 *
 * One unit per page of 50, the same as the uploads listing, so grouping the
 * channel by playlist costs about as much as listing it once.
 */
export async function fetchPlaylists(fetchFn, { channelId, apiKey }) {
  const out = [];
  let pageToken = '';

  do {
    const page = pageToken ? `&pageToken=${pageToken}` : '';
    const url = `${API}/playlists?part=snippet,contentDetails&maxResults=${PAGE}`
      + `&channelId=${channelId}&key=${apiKey}${page}`;
    const body = await getJson(fetchFn, url);

    for (const item of body.items ?? []) {
      out.push({
        id: item.id,
        title: item.snippet.title,
        description: item.snippet.description ?? '',
        itemCount: Number(item.contentDetails?.itemCount ?? 0),
        thumbnail: pickThumbnail(item.snippet.thumbnails),
      });
    }
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);

  return out;
}

export async function fetchVideoDetails(fetchFn, { ids, apiKey }) {
  const out = [];

  for (const group of chunk(ids, PAGE)) {
    const url = `${API}/videos?part=snippet,contentDetails,statistics`
      + `&maxResults=${PAGE}&id=${group.join(',')}&key=${apiKey}`;
    const body = await getJson(fetchFn, url);

    for (const item of body.items ?? []) {
      out.push({
        id: item.id,
        title: item.snippet.title,
        description: item.snippet.description ?? '',
        publishedAt: item.snippet.publishedAt,
        duration: item.contentDetails.duration,
        viewCount: roundViews(Number(item.statistics?.viewCount ?? 0)),
        thumbnail: pickThumbnail(item.snippet.thumbnails),
        tags: item.snippet.tags ?? [],
      });
    }
  }

  return out;
}

/**
 * Builds the object written to data/youtube.json.
 *
 * Deliberately carries no fetch timestamp. The scheduled refresh commits this
 * file only when it changes, and a wall-clock field would change on every run,
 * forcing a deploy every three hours whether or not the channel had moved.
 *
 * `now` is still accepted so callers have one place to inject a clock if a
 * future field needs one.
 */
export async function buildYouTubeData(fetchFn, { channelId, apiKey, now }) {
  const { playlistId, channel } = await fetchUploadsPlaylistId(fetchFn, { channelId, apiKey });
  const ids = await fetchPlaylistVideoIds(fetchFn, { playlistId, apiKey });
  const videos = await fetchVideoDetails(fetchFn, { ids, apiKey });

  videos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const known = new Set(videos.map((v) => v.id));
  const playlists = [];

  for (const playlist of await fetchPlaylists(fetchFn, { channelId, apiKey })) {
    const members = await fetchPlaylistVideoIds(fetchFn, {
      playlistId: playlist.id,
      apiKey,
    });

    // Only ids we hold details for. A playlist can contain someone else's
    // video, or one since made private, and neither can be rendered as a card.
    const videoIds = members.filter((id) => known.has(id));

    // An empty playlist renders as a heading over nothing.
    if (videoIds.length > 0) {
      playlists.push({ ...playlist, videoIds });
    }
  }

  // Largest first: the playlists someone actually maintains lead.
  playlists.sort((a, b) => b.videoIds.length - a.videoIds.length);

  return { channel, videos, playlists };
}
