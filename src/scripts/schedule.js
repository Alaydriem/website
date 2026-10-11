import schedule from '../../data/schedule.json';
import { describeNext, nextStream } from './lib/schedule.js';

/**
 * Turns the hero's weekly summary into the next stream, in the reader's zone.
 *
 * The line is complete without this — it names the days and the streamer's
 * zone — so a failure here leaves something true on screen. Only text changes;
 * the stylesheet holds each line to one line, so nothing moves.
 *
 * @param {Document | HTMLElement} [root]
 * @param {() => number} [now]
 */
export function initSchedule(root = document, now = () => Date.now()) {
  const host = root.querySelector('[data-schedule]');
  if (!host) return;

  const label = host.querySelector('[data-schedule-label]');
  const when = host.querySelector('[data-schedule-when]');
  const what = host.querySelector('[data-schedule-what]');

  const render = () => {
    const at = now();
    const next = nextStream(schedule, at);
    if (!next) return;

    const words = describeNext(next, at);
    label.textContent = words.label;
    when.textContent = words.when;
    what.textContent = words.what;
    host.dataset.now = String(next.now);
  };

  render();

  // A tab left open overnight would otherwise still say "Tonight" tomorrow.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render();
  });
}
