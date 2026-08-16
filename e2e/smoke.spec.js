import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Picks a generated video page off disk.
 *
 * The /videos/ index links to none of them, so a crawler cannot reach one, and
 * hard-coding a video id would rot as the channel changes.
 */
function anyVideoSlug() {
  return readdirSync('dist/videos', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)[0];
}

/** A live payload the page should accept, stamped relative to the browser. */
const LIVE_PAYLOAD = {
  live: true,
  platform: 'twitch',
  title: 'Cathedral roof, night four',
  url: 'https://twitch.tv/alaydriem',
  viewers: 1204,
};

async function mockLive(page, body) {
  await page.route('**/api/live*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }));
}

/*
 * In production /api/live is served by a Cloudflare Worker on a route ahead of
 * the static host. A static build has no such route, so without this every test
 * sees a 404 the real site never returns.
 *
 * That 404 arrives asynchronously, after first paint, which made the console
 * assertion below a race: it passed on one CI run and failed on the next
 * against identical code. Defaulting to the shape the Worker actually serves
 * when nothing is live removes both the false failure and the flake.
 *
 * Playwright matches the most recently registered route first, so any test can
 * override this by calling page.route again.
 */
test.beforeEach(async ({ page }) => {
  await page.route('**/api/live*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ live: false }),
    }));
});

test.describe('the page itself', () => {
  test('renders with styles and no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));

    // networkidle, not the default load: the live check fires after first
    // paint, so anything it logs must be collected before asserting.
    await page.goto('/', { waitUntil: 'networkidle' });

    // A blocked or missing stylesheet leaves the body on its default background.
    const background = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor);
    expect(background).not.toBe('rgba(0, 0, 0, 0)');
    expect(background).toBe('rgb(15, 10, 28)');

    expect(errors).toEqual([]);
  });

  test('carries no unsubstituted placeholders', async ({ page }) => {
    await page.goto('/');
    const html = await page.content();

    expect(html).not.toContain('__CSP_NONCE__');
    expect(html).not.toContain('intregrity');
    expect(html).not.toContain('’');
  });

  // Go prints a failed verb inline rather than erroring, so "%!d(float64=203)"
  // renders as page copy and the build still succeeds. Hugo decodes every JSON
  // number as float64, which makes %d on data a standing hazard.
  test('contains no Go format errors', async ({ page }) => {
    await page.goto('/');
    const html = await page.content();

    expect(html).not.toMatch(/%!\w?\(/);
  });

  // Astro hashes asset filenames itself, so a stale stylesheet is impossible
  // rather than merely detectable. What still matters is that the reference
  // resolves and the file is content-addressed.
  test('loads a content-hashed stylesheet', async ({ page }) => {
    await page.goto('/');

    const sheets = await page.evaluate(() =>
      [...document.querySelectorAll('link[rel=stylesheet]')].map((el) => el.getAttribute('href')));

    expect(sheets.length).toBeGreaterThan(0);
    for (const href of sheets) {
      expect(href).toMatch(/\/_astro\/.+\.[A-Za-z0-9_-]{8,}\.css$/);
    }
  });

  test('every asset the page references resolves', async ({ page }) => {
    const missing = [];
    page.on('response', (r) => r.status() >= 400 && missing.push(`${r.status()} ${r.url()}`));

    await page.goto('/', { waitUntil: 'networkidle' });

    expect(missing).toEqual([]);
  });
});

test.describe('the hero', () => {
  test('renders pinned, with no network mocking', async ({ page }) => {
    await page.goto('/');

    const hero = page.locator('[data-hero]');
    await expect(hero).toHaveAttribute('data-live', 'false');
    await expect(page.locator('[data-live-badge-text]')).toHaveText(/start here/i);

    // The primary action must point at a real watch URL.
    await expect(page.locator('[data-live-cta]'))
      .toHaveAttribute('href', /youtube\.com\/watch\?v=.+/);
  });

  test('shows the product band, and it is the only violet on the page', async ({ page }) => {
    await page.goto('/');

    const band = page.locator('.band');
    await expect(band).toBeVisible();
    await expect(band.locator('a')).toHaveAttribute('href', /bedrockvoicechat\.com/);

    // rgb(130, 57, 216) is --sp-violet, which is also --brand. The rule is that
    // violet marks Bedrock Voice Chat and nothing else, so every element
    // painted with it must be the band or a link to the product. A decorative
    // use anywhere else dilutes the one signal the band depends on.
    const stray = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .filter((el) => getComputedStyle(el).backgroundColor === 'rgb(130, 57, 216)')
        .filter((el) => !el.classList.contains('band')
          && !(el.getAttribute('href') || '').includes('bedrockvoicechat.com'))
        .map((el) => el.className.toString() || el.tagName));

    expect(stray).toEqual([]);
  });
});

test.describe('the segmented control', () => {
  test('switches panels and writes the hash', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('[data-panel=watch]')).toBeVisible();
    await expect(page.locator('[data-panel=tools]')).toBeHidden();

    await page.locator('[data-tab=tools]').click();

    await expect(page.locator('[data-panel=tools]')).toBeVisible();
    await expect(page.locator('[data-panel=watch]')).toBeHidden();
    expect(page.url()).toContain('#tools');
  });

  test('opens the tab named in the hash on load', async ({ page }) => {
    await page.goto('/#tools');

    await expect(page.locator('[data-panel=tools]')).toBeVisible();
    await expect(page.locator('[data-tab=tools]')).toHaveAttribute('aria-selected', 'true');
  });

  test('moves between tabs with arrow keys, and focus follows', async ({ page }) => {
    await page.goto('/');

    await page.locator('[data-tab=watch]').focus();
    await page.keyboard.press('ArrowRight');

    await expect(page.locator('[data-tab=tools]')).toBeFocused();
    await expect(page.locator('[data-panel=tools]')).toBeVisible();

    // Wrapping: one more step returns to the first tab.
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-tab=watch]')).toBeFocused();
  });

  test('shows the newest videos in the Watch panel', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-panel=watch] .card')).toHaveCount(8);
  });
});

test.describe('the live upgrade', () => {
  /** Points the client at a mocked payload and runs it. */
  async function runLiveCheck(page) {
    await page.evaluate(() => {
      document.querySelector('meta[name="live-status-url"]').content = '/api/live';
      window.__initLiveStatus();
    });
  }

  // The endpoint is a Cloudflare Worker route, so it is absent from any static
  // build: local dev, `astro preview`, and this suite's own server. The hero
  // must stay pinned rather than break — the same path as any network failure.
  //
  // Routed explicitly rather than relying on the file being missing, so the
  // test states the condition it is testing instead of depending on the
  // server's behaviour, and so it overrides the beforeEach stub.
  test('stays pinned when the endpoint is missing, as it is in any static build',
    async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));

      const statuses = [];
      page.on('response', (r) => r.url().includes('/api/live') && statuses.push(r.status()));

      await page.route('**/api/live*', (route) =>
        route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }));

      await page.goto('/', { waitUntil: 'networkidle' });

      // It really did try, so this is not passing by never having asked.
      expect(statuses.length).toBeGreaterThan(0);
      expect(statuses.every((s) => s >= 400)).toBe(true);

      await expect(page.locator('[data-hero]')).toHaveAttribute('data-live', 'false');
      await expect(page.locator('[data-live-badge-text]')).toHaveText(/start here/i);
      expect(errors).toEqual([]);
    });

  test('makes no request at all when no url is configured', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => r.url().includes('/api/live') && requests.push(r.url()));

    // Emptying the meta is what src/lib/site.json does to switch the feature
    // off, so this is the shipped "disabled" path.
    await page.goto('/');
    await page.evaluate(() => {
      document.querySelector('meta[name="live-status-url"]').content = '';
    });
    requests.length = 0;
    await page.evaluate(() => window.__initLiveStatus());

    expect(requests).toEqual([]);
  });

  // This is the assertion the whole two-state design rests on. Both states
  // occupy identical boxes; only text and colour change.
  test('upgrades the hero without moving layout', async ({ page }) => {
    await mockLive(page, { ...LIVE_PAYLOAD, heartbeatAt: new Date().toISOString() });
    await page.goto('/');

    const hero = page.locator('[data-hero]');
    const before = await hero.boundingBox();

    await runLiveCheck(page);

    await expect(hero).toHaveAttribute('data-live', 'true');
    await expect(page.locator('[data-live-badge-text]')).toHaveText(/live now/i);
    await expect(page.locator('[data-live-title]')).toHaveText('Cathedral roof, night four');
    await expect(page.locator('[data-live-cta]'))
      .toHaveAttribute('href', 'https://twitch.tv/alaydriem');
    await expect(page.locator('[data-live-viewers]')).toContainText('1,204');

    const after = await hero.boundingBox();
    expect(after.height).toBe(before.height);
    expect(after.width).toBe(before.width);
  });

  test('stays pinned when the heartbeat is stale', async ({ page }) => {
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await mockLive(page, { ...LIVE_PAYLOAD, heartbeatAt: stale });
    await page.goto('/');

    await runLiveCheck(page);

    await expect(page.locator('[data-hero]')).toHaveAttribute('data-live', 'false');
    await expect(page.locator('[data-live-badge-text]')).toHaveText(/start here/i);
  });

  test('stays pinned when the payload is rubbish', async ({ page }) => {
    await mockLive(page, { nonsense: true });
    await page.goto('/');

    await runLiveCheck(page);

    await expect(page.locator('[data-hero]')).toHaveAttribute('data-live', 'false');
  });
});

test.describe('narrow viewports', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the desktop rail is not shown and the page does not scroll sideways', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.hero__rail')).toBeHidden();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflows).toBe(false);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('every panel is visible and the control is hidden', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('[data-panel=watch]')).toBeVisible();
    await expect(page.locator('[data-panel=tools]')).toBeVisible();
    await expect(page.locator('.segs__bar')).toBeHidden();

    // Each panel keeps its own heading when there is no tab to name it.
    await expect(page.locator('.panel__heading')).toHaveCount(2);
  });
});

// These 266 URLs were published by the old site and are indexed. They must keep
// working and hand their equity to YouTube, which is where the site wants
// people anyway.
//
// The stubs are fetched rather than rendered: a "0; url=" meta refresh fires
// before any assertion could run, so a rendered page would be YouTube's, not
// ours. Reading the response is also what a crawler does.
test.describe('video URLs', () => {
  function attr(html, pattern) {
    return html.match(pattern)?.[1];
  }

  test('still resolve, and redirect to the video', async ({ request }) => {
    const slug = anyVideoSlug();
    const response = await request.get(`/videos/${slug}/`);
    expect(response.status()).toBe(200);

    const html = await response.text();
    const canonical = attr(html, /<link rel="canonical" href="([^"]+)"/);
    const refresh = attr(html, /<meta http-equiv="refresh" content="([^"]+)"/);
    const robots = attr(html, /<meta name="robots" content="([^"]+)"/);

    expect(canonical).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=.+/);
    expect(refresh).toBe(`0; url=${canonical}`);

    // noindex keeps the stub itself out of the index; follow keeps the link
    // through to the video counted.
    expect(robots).toBe('noindex, follow');

    // The visible fallback, for anything that ignores a meta refresh.
    expect(html).toContain(`<a href="${canonical}"`);
  });

  // Hugo lowercased the URL segment; YouTube ids are case-sensitive. If the
  // redirect target were derived from the path, every mixed-case id would point
  // at a video that does not exist.
  test('redirect using the original id casing, not the lowercased path', async ({ request }) => {
    const slugs = readdirSync('dist/videos', { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    let differedInCase = 0;

    for (const slug of slugs.slice(0, 40)) {
      const html = await (await request.get(`/videos/${slug}/`)).text();
      const canonical = attr(html, /<link rel="canonical" href="([^"]+)"/);
      const id = new URL(canonical).searchParams.get('v');

      expect(id.toLowerCase()).toBe(slug);
      if (id !== slug) differedInCase += 1;
    }

    // Some of the sample must actually differ in case, or this would pass on an
    // all-lowercase sample without proving anything.
    expect(differedInCase).toBeGreaterThan(0);
  });

  // Every one of these returned 200 on the Hugo site. Migrating a build system
  // is exactly when URLs disappear quietly, so they are asserted rather than
  // assumed.
  test('every URL the old site published still resolves', async ({ request }) => {
    const legacy = ['/', '/index.xml', '/sitemap.xml', '/robots.txt',
      '/videos/', '/categories/', '/tags/'];

    const broken = [];
    for (const path of legacy) {
      const response = await request.get(path);
      if (response.status() !== 200) broken.push(`${response.status()} ${path}`);
    }

    expect(broken).toEqual([]);
  });

  test('the feed is well formed and points at YouTube', async ({ request }) => {
    const xml = await (await request.get('/index.xml')).text();

    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<atom:link href="https://www.alaydriem.com/index.xml"');
    expect((xml.match(/<item>/g) ?? []).length).toBeGreaterThan(10);

    // Every link goes to YouTube: the feed drives to the channel, not back to
    // a page on this site.
    const links = [...xml.matchAll(/<link>([^<]+)<\/link>/g)].map((m) => m[1]);
    expect(links.slice(1).every((l) => l.startsWith('https://www.youtube.com/watch?v='))).toBe(true);
  });

  test('every video in the data has a stub', async () => {
    const { videos } = JSON.parse(readFileSync('data/youtube.json', 'utf8'));
    const slugs = new Set(readdirSync('dist/videos', { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name));

    const missing = videos.map((v) => v.id.toLowerCase()).filter((id) => !slugs.has(id));
    expect(missing).toEqual([]);
  });
});
