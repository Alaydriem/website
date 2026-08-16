import youtube from '../../data/youtube.json';
import { watchUrl } from '../lib/format.js';

/**
 * The video feed.
 *
 * Hugo published this at /index.xml with 266 items and it returns 200 today, so
 * anyone subscribed keeps their feed. Items link straight to YouTube, which is
 * where the site wants people anyway.
 */

const escape = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function GET() {
  const items = youtube.videos
    .slice(0, 50)
    .map((video) => {
      const url = watchUrl(video.id);
      return `    <item>
      <title>${escape(video.title)}</title>
      <link>${escape(url)}</link>
      <guid isPermaLink="false">${escape(video.id)}</guid>
      <pubDate>${new Date(video.publishedAt).toUTCString()}</pubDate>
      <description>${escape(video.description.slice(0, 500))}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Alaydriem</title>
    <link>https://www.alaydriem.com/</link>
    <description>Minecraft Bedrock builds, farms and tools.</description>
    <language>en-us</language>
    <atom:link href="https://www.alaydriem.com/index.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
