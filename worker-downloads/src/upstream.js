/**
 * Path and header rules for the world-download passthrough.
 *
 * The old Hugo site served /world-downloads/... itself. Those URLs are printed
 * in the description of every farm video on YouTube and are indexed, so they
 * have to keep working. The files themselves live in DigitalOcean Spaces.
 *
 * Kept free of the Worker runtime so it can be tested directly rather than
 * through a deployed edge runtime, the same way worker/src/state.js is.
 */

/** The one path shape this Worker answers for. */
export const DOWNLOAD_PREFIX = '/world-downloads/';

/** Where the files actually are. Fixed: no request may move it. */
export const UPSTREAM_ORIGIN = 'https://alaydriem.nyc3.cdn.digitaloceanspaces.com';

/** A day. These are published artefacts; they change when a video is redone. */
const CACHE_SECONDS = 86400;

/**
 * What a decoded path segment may contain.
 *
 * Deliberately narrow. Everything the bucket actually holds is a farm name and
 * an extension, so anything stranger is either a mistake or an attempt to
 * reach a key that is not ours to serve.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9 ._~!$&'()*+,;=:@-]+$/;

/** Headers the browser needs to cache and resume a download. */
const PASSTHROUGH = ['accept-ranges', 'etag', 'last-modified'];

/**
 * Headers that describe the body's size on the wire.
 *
 * Only safe to relay when the bucket sent the bytes as they are. The Workers
 * runtime decompresses an encoded body before we forward it, so an encoded
 * object's length describes bytes the browser will never receive, and relaying
 * it truncates or stalls the download.
 */
const SIZE_HEADERS = ['content-length', 'content-range'];

/**
 * Turns a request URL into the bucket URL to fetch, or null to refuse.
 *
 * The bucket mirrors the old site's paths one for one, so the mapping is the
 * path itself. The work here is proving the path is one we are willing to pass
 * on.
 */
export function resolveUpstream(requestUrl) {
  let pathname;
  try {
    ({ pathname } = new URL(requestUrl));
  } catch {
    return null;
  }

  if (!pathname.startsWith(DOWNLOAD_PREFIX)) return null;

  const key = pathname.slice(DOWNLOAD_PREFIX.length);
  if (key === '') return null;

  const segments = key.split('/');
  const decoded = [];

  for (const segment of segments) {
    // An empty segment is a doubled slash, which is never a real bucket key.
    if (segment === '') return null;

    let plain;
    try {
      plain = decodeURIComponent(segment);
    } catch {
      // A broken escape. Nothing legitimate produces one.
      return null;
    }

    // new URL() folds a literal ../ away before we ever see it, but an encoded
    // one survives, and would reach the bucket as a key escape.
    if (plain === '.' || plain === '..') return null;
    if (!SAFE_SEGMENT.test(plain)) return null;

    decoded.push(plain);
  }

  // Joined as text rather than through new URL(path, base): a path beginning
  // with // would make the URL constructor treat it as a host and send the
  // request somewhere else entirely.
  return {
    url: `${UPSTREAM_ORIGIN}${DOWNLOAD_PREFIX}${segments.join('/')}`,
    filename: decoded[decoded.length - 1],
  };
}

/**
 * Strips a filename down to what can sit inside a quoted header value.
 *
 * resolveUpstream has already refused these characters, so this is the second
 * of two guards rather than the only one.
 */
function safeFilename(name) {
  const cleaned = String(name)
    // The two characters that end or escape the quoted string.
    .replace(/["\\]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-');

  return cleaned === '' || cleaned === '-' ? 'download' : cleaned;
}

/**
 * Builds the response headers for a proxied file.
 *
 * Spaces labels every one of these objects text/plain. Left alone, a browser
 * renders a world file as gibberish instead of saving it, which is why the old
 * video descriptions had to tell people to right click and save link as. The
 * type and disposition set here are the reason this is a Worker and not a
 * plain redirect rule.
 */
export function downloadHeaders(upstream, filename) {
  const headers = {
    'content-type': 'application/octet-stream',
    'content-disposition': `attachment; filename="${safeFilename(filename)}"`,
    'cache-control': `public, max-age=${CACHE_SECONDS}`,
  };

  const names = upstream.get('content-encoding') === null
    ? [...PASSTHROUGH, ...SIZE_HEADERS]
    : PASSTHROUGH;

  for (const name of names) {
    const value = upstream.get(name);
    if (value !== null) headers[name] = value;
  }

  return headers;
}
