import { expect, test } from '@playwright/test';

/**
 * Not an assertion suite: produces reference screenshots for review.
 * Run explicitly with `npx playwright test e2e/shots.spec.js`.
 */

const OUT = process.env.SHOT_DIR || 'test-results/shots';

test('desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/desktop-home.png`, fullPage: true });
});

test('desktop, tools panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#tools', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-panel=tools]')).toBeVisible();
  // The section itself, not the viewport: the panel sits below the fold.
  await page.locator('.segs').screenshot({ path: `${OUT}/desktop-tools.png` });
});

test('mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/mobile-home.png`, fullPage: true });
});

test('desktop, live state', async ({ page }) => {
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

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => {
    document.querySelector('meta[name="live-status-url"]').content = '/api/live';
    window.__initLiveStatus();
  });
  await expect(page.locator('[data-hero]')).toHaveAttribute('data-live', 'true');
  await page.screenshot({ path: `${OUT}/desktop-live.png` });
});

