import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests only. e2e/ holds Playwright specs, which throw if Vitest
    // imports them, and Vitest's default glob would otherwise collect them now
    // that it runs from the repository root.
    include: ['test/**/*.test.js'],
  },
});
