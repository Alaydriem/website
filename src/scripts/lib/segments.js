/**
 * Tab selection logic, with no DOM and no browser API.
 *
 * Kept separate from segments.js so the wrapping, bounds and hash handling can
 * be tested directly rather than through a rendered page.
 */

export function selectTab(tabs, requested, fallback) {
  const name = String(requested ?? '').replace(/^#/, '');
  return tabs.includes(name) ? name : fallback;
}

const STEP = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function nextTab(tabs, current, key) {
  if (key === 'Home') return tabs[0];
  if (key === 'End') return tabs[tabs.length - 1];

  const step = STEP[key];
  if (!step) return current;

  const index = tabs.indexOf(current);
  if (index === -1) return current;

  return tabs[(index + step + tabs.length) % tabs.length];
}
