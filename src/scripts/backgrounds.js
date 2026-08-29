import { BACKGROUNDS } from '../lib/backgrounds.js';
import { backgroundImage, nextIndex, sizeFor, urlFor } from './lib/backgrounds.js';

/** How long each photograph is held before the fade to the next one starts. */
const HOLD_MS = 8000;

/**
 * Fades the hero through its set of backgrounds.
 *
 * The hero ships with the first photograph already painted by the stylesheet,
 * so the page is complete before this runs and stays complete if it never does.
 * All this adds is the movement.
 *
 * Two layers sit under a fixed scrim. The idle one takes the next photograph a
 * whole slot early, which is what makes the fade cheap: applying the background
 * starts the download eight seconds before anyone sees it, and a visitor who
 * leaves after fifteen seconds has paid for two images rather than six.
 *
 * Nothing here moves layout. The layers are absolutely positioned and only
 * their opacity changes, so the hero cannot shift under someone mid-read.
 */
export function initBackgrounds(root = document, { hold = HOLD_MS } = {}) {
  const host = root.querySelector('[data-hero-bg]');
  if (!host) return;

  const layers = [...host.querySelectorAll('[data-bg-layer]')];
  if (layers.length < 2 || BACKGROUNDS.length < 2) return;

  // Motion is the whole feature, so honouring the preference means not
  // starting rather than starting gently. The first photograph is already on
  // screen and is the only one that will ever be downloaded.
  if (root.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const size = sizeFor(root.defaultView.innerWidth, root.defaultView.devicePixelRatio);

  let shown = 0;
  let front = layers[0];
  let back = layers[1];
  let timer = 0;

  /* Loads the next photograph into the hidden layer. The fetch happens here,
     one slot ahead of the fade. */
  function queue() {
    const slug = BACKGROUNDS[nextIndex(shown, BACKGROUNDS.length)];
    // A browser without image-set drops the declaration, taking the previous
    // value with it, so the plain URL goes on first as the floor.
    back.style.backgroundImage = `url('${urlFor(slug, size, 'jpg')}')`;
    back.style.backgroundImage = backgroundImage(slug, size);
  }

  function advance() {
    shown = nextIndex(shown, BACKGROUNDS.length);

    back.classList.add('is-active');
    front.classList.remove('is-active');
    [front, back] = [back, front];

    queue();
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(advance, hold);
  }

  /* A hidden tab should not be fetching photographs nobody is looking at, and
     coming back to a hero mid-fade looks like a glitch rather than a feature. */
  root.addEventListener('visibilitychange', () => {
    if (root.hidden) clearTimeout(timer);
    else schedule();
  });

  queue();
  schedule();
}
