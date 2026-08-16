import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Screenshots are a review aid, not a check, so they stay out of the default
  // run. testIgnore applies even to an explicitly named file, so it is opt-in:
  //   SHOTS=1 npx playwright test e2e/shots.spec.js
  testIgnore: process.env.SHOTS ? [] : '**/shots.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // A test that fails and then passes on retry is reported as "flaky" and, by
  // default, the run still succeeds. That is how a race hides: it passed on the
  // pull request and failed on the merge, against identical code. In CI a flake
  // is a failure.
  failOnFlakyTests: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8123',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx --yes http-server dist -p 8123 --silent',
    url: 'http://127.0.0.1:8123',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
