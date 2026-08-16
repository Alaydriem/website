import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.alaydriem.com',

  // Directory format keeps the trailing slash on every URL. The Hugo site
  // published /videos/<id>/ and those URLs are indexed, so changing the shape
  // here would move every one of them.
  build: { format: 'directory' },

  // No @astrojs/sitemap: it emits sitemap-index.xml and sitemap-0.xml, while
  // the live site publishes /sitemap.xml. src/pages/sitemap.xml.js keeps that
  // URL. See the comment there.
});
