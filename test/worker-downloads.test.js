import { describe, expect, it } from 'vitest';
import {
  DOWNLOAD_PREFIX,
  UPSTREAM_ORIGIN,
  downloadHeaders,
  resolveUpstream,
} from '../worker-downloads/src/upstream.js';

const site = (path) => `https://www.alaydriem.com${path}`;

describe('resolveUpstream', () => {
  // The bucket mirrors the old site's paths one for one, in both the flat
  // shape the early YouTube descriptions used and the foldered shape the
  // later ones use. One rule has to serve both.
  it('maps a foldered path straight through to the bucket', () => {
    expect(resolveUpstream(site('/world-downloads/shroomlight-farm/ShroomLightFarm.mcstructure'))).toEqual({
      url: `${UPSTREAM_ORIGIN}/world-downloads/shroomlight-farm/ShroomLightFarm.mcstructure`,
      filename: 'ShroomLightFarm.mcstructure',
    });
  });

  it('maps a flat path straight through to the bucket', () => {
    expect(resolveUpstream(site('/world-downloads/Raid-Farm.mcworld'))).toEqual({
      url: `${UPSTREAM_ORIGIN}/world-downloads/Raid-Farm.mcworld`,
      filename: 'Raid-Farm.mcworld',
    });
  });

  it('keeps percent-encoded spaces intact rather than decoding them', () => {
    // The bucket key is what was uploaded. Decoding here would ask the bucket
    // for a key that does not exist.
    const path = '/world-downloads/Nether%20Tree%20Farm.mcworld';
    expect(resolveUpstream(site(path)).url).toBe(`${UPSTREAM_ORIGIN}${path}`);
  });

  it('drops the query string', () => {
    // Nothing downstream needs one, and forwarding it would let a caller hand
    // S3 request parameters to the bucket through our domain.
    expect(resolveUpstream(site('/world-downloads/Iron-Farm.mcworld?x-id=GetObject')).url)
      .toBe(`${UPSTREAM_ORIGIN}/world-downloads/Iron-Farm.mcworld`);
  });

  it('refuses a path outside the downloads prefix', () => {
    expect(resolveUpstream(site('/'))).toBeNull();
    expect(resolveUpstream(site('/videos/abc/'))).toBeNull();
    expect(resolveUpstream(site('/world-downloadsX/a.mcworld'))).toBeNull();
  });

  it('refuses the prefix itself, which names no object', () => {
    expect(resolveUpstream(site('/world-downloads/'))).toBeNull();
  });

  it('refuses encoded traversal', () => {
    // new URL() folds a literal ../ away before we see it, but an encoded one
    // survives and would reach the bucket as a key escape.
    expect(resolveUpstream(site('/world-downloads/%2e%2e%2fsecret'))).toBeNull();
    expect(resolveUpstream(site('/world-downloads/%2E%2E/secret'))).toBeNull();
    expect(resolveUpstream(site('/world-downloads/a/../../secret'))).toBeNull();
  });

  it('refuses characters that have no business in a bucket key', () => {
    expect(resolveUpstream(site('/world-downloads/a%00.mcworld'))).toBeNull();
    expect(resolveUpstream(site('/world-downloads/a%0d%0aX.mcworld'))).toBeNull();
    expect(resolveUpstream(site('/world-downloads/a%22b.mcworld'))).toBeNull();
    expect(resolveUpstream(site('/world-downloads/a%5cb.mcworld'))).toBeNull();
  });

  // The upstream host is fixed. No request path may move it.
  it('never leaves the bucket host', () => {
    for (const path of [
      '/world-downloads//evil.example/x.mcworld',
      '/world-downloads/@evil.example/x.mcworld',
      '/world-downloads/x.mcworld',
    ]) {
      const resolved = resolveUpstream(site(path));
      if (resolved) expect(new URL(resolved.url).origin).toBe(UPSTREAM_ORIGIN);
    }
  });

  it('refuses a request that is not for this site path at all', () => {
    expect(resolveUpstream('not a url')).toBeNull();
  });

  it('exports the prefix it matches', () => {
    expect(DOWNLOAD_PREFIX).toBe('/world-downloads/');
  });
});

describe('downloadHeaders', () => {
  const upstream = (extra = {}) => new Headers({
    'content-type': 'text/plain',
    'content-length': '4194304',
    etag: '"abc123"',
    'last-modified': 'Wed, 21 Oct 2020 07:28:00 GMT',
    'x-amz-request-id': 'tx000-secret',
    ...extra,
  });

  // Spaces labels every one of these files text/plain. Left alone, a browser
  // renders a world file as gibberish instead of saving it, which is why the
  // old video descriptions had to say "right click, save link as".
  it('forces a binary type over the upstream text/plain', () => {
    expect(downloadHeaders(upstream(), 'Raid-Farm.mcworld')['content-type'])
      .toBe('application/octet-stream');
  });

  it('asks the browser to save the file under its own name', () => {
    expect(downloadHeaders(upstream(), 'Raid-Farm.mcworld')['content-disposition'])
      .toBe('attachment; filename="Raid-Farm.mcworld"');
  });

  it('passes through what the browser needs to resume a download', () => {
    const headers = downloadHeaders(
      upstream({ 'accept-ranges': 'bytes', 'content-range': 'bytes 0-1023/4194304' }),
      'Raid-Farm.mcworld',
    );
    expect(headers['content-length']).toBe('4194304');
    expect(headers['content-range']).toBe('bytes 0-1023/4194304');
    expect(headers['accept-ranges']).toBe('bytes');
    expect(headers.etag).toBe('"abc123"');
    expect(headers['last-modified']).toBe('Wed, 21 Oct 2020 07:28:00 GMT');
  });

  it('omits a header the bucket did not send', () => {
    expect(downloadHeaders(upstream(), 'a.mcworld')['content-range']).toBeUndefined();
  });

  it('does not relay the bucket vendor headers', () => {
    const headers = downloadHeaders(upstream(), 'a.mcworld');
    for (const key of Object.keys(headers)) expect(key).not.toMatch(/^x-amz-/);
  });

  it('lets the file be cached, since a published download does not change', () => {
    expect(downloadHeaders(upstream(), 'a.mcworld')['cache-control'])
      .toMatch(/^public, max-age=\d+$/);
  });

  // Defence in depth: resolveUpstream rejects these already, so a quote here
  // would mean the first guard failed.
  it('never lets a filename break out of the disposition header', () => {
    expect(downloadHeaders(upstream(), 'a"b\r\nX: y.mcworld')['content-disposition'])
      .toBe('attachment; filename="ab-X-y.mcworld"');
  });
});

describe('downloadHeaders and compressed upstreams', () => {
  // The Workers runtime hands back a decompressed body when the origin
  // encoded one, so the origin's content-length describes bytes the browser
  // will never receive. Relaying it truncates or stalls the download.
  it('drops content-length when the bucket encoded the body', () => {
    const upstream = new Headers({
      'content-length': '900000',
      'content-encoding': 'gzip',
    });
    const headers = downloadHeaders(upstream, 'a.mcworld');
    expect(headers['content-length']).toBeUndefined();
    expect(headers['content-encoding']).toBeUndefined();
  });

  it('still drops content-range for an encoded body, for the same reason', () => {
    const upstream = new Headers({
      'content-range': 'bytes 0-1023/900000',
      'content-encoding': 'gzip',
    });
    expect(downloadHeaders(upstream, 'a.mcworld')['content-range']).toBeUndefined();
  });
});
