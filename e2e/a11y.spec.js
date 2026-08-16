import { readdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Accessibility audit of the built pages.
 *
 * Runs inside Playwright's own Chromium rather than through the axe CLI, which
 * needs a ChromeDriver matching whatever Chrome happens to be installed. This
 * way the audit runs identically here and in CI.
 */

function anyVideoSlug() {
  return readdirSync('dist/videos', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)[0];
}

async function audit(page) {
  return new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
}

/*
 * /api/live is a Cloudflare Worker route and does not exist in a static build.
 * Stubbed to the shape the Worker serves when nothing is live, so these audits
 * run against the same page production serves. Tests override it by routing
 * again: Playwright matches the most recently registered route first.
 */
test.beforeEach(async ({ page }) => {
  await page.route('**/api/live*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ live: false }),
    }));

  // The live takeover frames a real player. Stubbed so the audit never depends
  // on reaching Twitch or YouTube.
  for (const host of ['**://player.twitch.tv/**', '**://*.youtube-nocookie.com/**']) {
    await page.route(host, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>player</title>' }));
  }
});

/** Flattens violations to one readable line per offending node. */
function report(violations) {
  return violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id} @ ${n.target.join(' ')} — ${n.failureSummary?.split('\n').pop()?.trim()}`));
}

test('the homepage has no accessibility violations', async ({ page }) => {
  await page.goto('/');
  const { violations } = await audit(page);

  expect(report(violations)).toEqual([]);
});

// The text sits over a photograph. The scrim is measured against the real
// image rather than assumed, which is only meaningful if it is checked.
test('the hero text clears contrast over the actual image', async ({ page }) => {
  await page.goto('/');

  const { violations } = await new AxeBuilder({ page })
    .include('[data-hero]')
    .withRules(['color-contrast'])
    .analyze();

  expect(violations).toEqual([]);
});

// The live badge only exists in a state the other audits never reach, so its
// colours went unchecked. Ink on the raw crimson stop measured 3.76:1.
test('the hero has no violations in its live state', async ({ page }) => {
  await page.route('**/api/live*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      live: true,
      platform: 'twitch',
      title: 'Cathedral roof, night four',
      url: 'https://twitch.tv/alaydriem',
      viewers: 1204,
      heartbeatAt: new Date().toISOString(),
    }),
  }));

  await page.goto('/');
  await page.evaluate(() => {
    document.querySelector('meta[name="live-status-url"]').content = '/api/live';
    window.__initLiveStatus();
  });
  await expect(page.locator('[data-hero]')).toHaveAttribute('data-live', 'true');

  const { violations } = await audit(page);
  expect(report(violations)).toEqual([]);
});

test('the playlists page has no accessibility violations', async ({ page }) => {
  await page.goto('/playlists/');
  const { violations } = await audit(page);

  expect(report(violations)).toEqual([]);
});

test('the tools panel has no violations once opened', async ({ page }) => {
  await page.goto('/#tools');
  await expect(page.locator('[data-panel=tools]')).toBeVisible();

  const { violations } = await audit(page);
  expect(report(violations)).toEqual([]);
});

// The video URLs are redirect stubs. Navigating to one lands on YouTube before
// anything can be audited, so the markup is fetched and mounted with its meta
// refresh stripped. The refresh itself is asserted in smoke.spec.js; what is
// checked here is that the fallback a reader actually sees is sound.
test('a video redirect stub has no accessibility violations', async ({ page, request }) => {
  const html = (await (await request.get(`/videos/${anyVideoSlug()}/`)).text())
    .replace(/<meta http-equiv="refresh"[^>]*>/, '');

  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main a')).toBeAttached();

  const { violations } = await audit(page);
  expect(report(violations)).toEqual([]);
});



