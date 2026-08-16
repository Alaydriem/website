/**
 * Builds a player embed URL from live-status state.
 *
 * The state arrives from a token-authenticated push, but it is still remote
 * input being written into an iframe `src`. Nothing from the payload is
 * interpolated directly: the channel or video id is extracted, matched against
 * a strict allowlist, and anything that does not match returns null so the page
 * falls back to a plain link. A leaked push token must not become a way to
 * frame arbitrary content on the site.
 */

/** Twitch login names: letters, digits and underscore. */
const TWITCH_CHANNEL = /^[A-Za-z0-9_]{3,25}$/;

/** YouTube video ids are 11 characters, but the range is not contractual. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;

/** Hostnames only, for the Twitch parent parameter. No ports, no paths. */
const HOSTNAME = /^[A-Za-z0-9.-]{1,253}$/;

function twitchChannel(url) {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'twitch.tv') return null;

  const channel = url.pathname.split('/').filter(Boolean)[0];
  return channel && TWITCH_CHANNEL.test(channel) ? channel : null;
}

function youtubeId(url) {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id && YOUTUBE_ID.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = url.searchParams.get('v')
      // A live URL can be /live/<id> rather than /watch?v=<id>.
      ?? (url.pathname.startsWith('/live/') ? url.pathname.split('/')[2] : null);
    return id && YOUTUBE_ID.test(id) ? id : null;
  }

  return null;
}

/**
 * @param state    the object readLive() produced
 * @param hostname the page's own hostname; Twitch requires it as `parent`
 * @param options  { motion: boolean } — false suppresses autoplay
 * @returns an embed URL, or null when there is nothing safe to frame
 */
export function streamEmbed(state, hostname, options = {}) {
  const { motion = true } = options;

  if (!state || state.live !== true || typeof state.url !== 'string') return null;
  if (typeof hostname !== 'string' || !HOSTNAME.test(hostname)) return null;

  let url;
  try {
    url = new URL(state.url);
  } catch {
    return null;
  }

  const channel = twitchChannel(url);
  if (channel) {
    // parent is mandatory and must match the embedding page's hostname, or
    // Twitch refuses to play.
    return `https://player.twitch.tv/?channel=${channel}`
      + `&parent=${hostname}`
      + `&autoplay=${motion ? 'true' : 'false'}&muted=true`;
  }

  const video = youtubeId(url);
  if (video) {
    return `https://www.youtube-nocookie.com/embed/${video}`
      + `?autoplay=${motion ? 1 : 0}&mute=1&rel=0`;
  }

  return null;
}
