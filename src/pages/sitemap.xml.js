/**
 * The sitemap.
 *
 * Written by hand rather than via @astrojs/sitemap, which emits
 * sitemap-index.xml and sitemap-0.xml. The old site published /sitemap.xml,
 * that URL returns 200 today and is what any search console registration
 * points at, so changing the filename would break it for no gain.
 *
 * The 266 video routes are canonical redirect stubs carrying robots noindex.
 * Listing them would ask search engines to index pages that tell them not to,
 * so only real pages appear here.
 */
import site from '../lib/site.json';
import youtube from '../../data/youtube.json';
import { arrangePlaylists } from '../lib/playlists.js';

const PAGES = [
  '/',
  '/playlists/',
  ...arrangePlaylists(youtube.playlists, site.playlists)
    .map((playlist) => `/playlists/${playlist.slug}/`),
];

export function GET() {
  const urls = PAGES.map((path) => `  <url>
    <loc>https://www.alaydriem.com${path}</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
