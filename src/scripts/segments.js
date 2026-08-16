import { nextTab, selectTab } from './lib/segments.js';

/**
 * Wires the segmented control to the DOM.
 *
 * The page ships with every panel visible and the control hidden. This adds
 * data-tabs="on" to the root, which is what switches the stylesheet into the
 * tabbed presentation. If this script never runs, the page stays readable.
 */
export function initSegments(root = document) {
  const host = root.querySelector('[data-segments]');
  if (!host) return;

  const buttons = [...host.querySelectorAll('[role=tab]')];
  const panels = [...host.querySelectorAll('[role=tabpanel]')];
  if (buttons.length < 2) return;

  const names = buttons.map((b) => b.dataset.tab);

  function show(name, { focus = false } = {}) {
    for (const button of buttons) {
      const on = button.dataset.tab === name;
      button.setAttribute('aria-selected', String(on));
      // Only the selected tab is reachable by Tab; arrow keys move within.
      button.tabIndex = on ? 0 : -1;
      if (on && focus) button.focus();
    }
    for (const panel of panels) {
      panel.hidden = panel.dataset.panel !== name;
    }
  }

  host.addEventListener('click', (event) => {
    const button = event.target.closest('[role=tab]');
    if (!button) return;
    show(button.dataset.tab);
    // replaceState, not pushState: switching tabs should not fill the back
    // stack with states the reader has to walk out of.
    history.replaceState(null, '', `#${button.dataset.tab}`);
  });

  host.addEventListener('keydown', (event) => {
    const button = event.target.closest('[role=tab]');
    if (!button) return;

    const moved = nextTab(names, button.dataset.tab, event.key);
    if (moved === button.dataset.tab) return;

    event.preventDefault();
    show(moved, { focus: true });
    history.replaceState(null, '', `#${moved}`);
  });

  window.addEventListener('hashchange', () => {
    show(selectTab(names, location.hash, names[0]));
  });

  document.documentElement.setAttribute('data-tabs', 'on');
  show(selectTab(names, location.hash, names[0]));
}
