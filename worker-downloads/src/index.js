import { downloadHeaders, resolveUpstream } from './upstream.js';

/**
 * World-download passthrough for www.alaydriem.com.
 *
 *   a viewer  --GET /world-downloads/...-->  Worker  --> DigitalOcean Spaces
 *
 * Every farm video on YouTube prints a download URL on this domain, and those
 * descriptions cannot be edited in bulk. The old Hugo site served the files;
 * the rebuilt site on GitHub Pages has no such page and 404s. This Worker sits
 * on the route ahead of Pages and serves the file from the bucket, so the
 * printed URLs keep working unchanged.
 *
 * It streams rather than redirecting, for two reasons. The URL stays on the
 * site's own domain, so the bucket can be moved later without breaking the
 * descriptions a second time. And the response headers can be corrected:
 * Spaces labels these objects text/plain, which makes a browser try to render
 * a world file instead of saving it.
 */

/** Request headers worth forwarding, so caching and resuming still work. */
const FORWARDED = ['range', 'if-range', 'if-none-match', 'if-modified-since'];

export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { allow: 'GET, HEAD' },
      });
    }

    const target = resolveUpstream(request.url);
    if (!target) return new Response('Not found', { status: 404 });

    const headers = new Headers();
    for (const name of FORWARDED) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }

    let upstream;
    try {
      upstream = await fetch(target.url, { method: request.method, headers });
    } catch {
      // The bucket is unreachable. Say so plainly rather than reporting a 404,
      // which would tell a visitor the file is gone when it is not.
      return new Response('Download store unavailable', { status: 502 });
    }

    if (upstream.status >= 400) {
      // A private or missing object both read as "no such download" from here.
      // Anything else is the bucket having a bad day.
      const gone = upstream.status === 403 || upstream.status === 404;
      return new Response(gone ? 'Not found' : 'Download store unavailable', {
        status: gone ? 404 : 502,
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: downloadHeaders(upstream.headers, target.filename),
    });
  },
};
