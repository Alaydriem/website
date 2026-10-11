/**
 * Next-stream logic for the hero, with no DOM.
 *
 * data/schedule.json holds weekly rules in the streamer's time zone. This turns
 * them into the next real start time and words for it in the reader's zone.
 * Shared by the build (the no-script summary) and the browser (the upgrade).
 */

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86400000;
/** How far ahead to look. Past one week so a cancelled date, or a slot that
    has not started yet, still finds the next real one. */
const LOOKAHEAD_DAYS = 35;
/** A start at or after this local hour reads as "Tonight" rather than "Today". */
const EVENING_HOUR = 17;

/**
 * Newer ICU puts a narrow no-break space before AM/PM. It renders the same,
 * but it is not what anyone types, so it is normalised here.
 */
const tidy = (text) => text.replace(/[  ]/g, ' ');

/** Calendar fields of an instant, as seen in a zone. */
function partsIn(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(ms);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/**
 * A wall-clock time in a zone, as epoch milliseconds. Daylight time is handled
 * by measuring the zone's offset at the guess and correcting once.
 *
 * @param {{ year: number, month: number, day: number, hour: number, minute: number }} wall
 * @param {string} timeZone
 */
export function zonedToUtc(wall, timeZone) {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const offsetAt = (ms) => {
    const p = partsIn(ms, timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - ms;
  };
  const first = asUtc - offsetAt(asUtc);
  return asUtc - offsetAt(first);
}

/**
 * @typedef {{ day: string, start: string, minutes: number, title: string, from: string, except: string[] }} Slot
 * @typedef {{ timezone: string, slots: Slot[] }} Schedule
 * @typedef {{ startMs: number, endMs: number, title: string, now: boolean }} Occurrence
 *
 * The slot running now, else the soonest one to come. Null when nothing is
 * scheduled in the next week.
 *
 * @param {Schedule} schedule
 * @param {number} nowMs
 * @returns {Occurrence | null}
 */
export function nextStream({ timezone, slots }, nowMs) {
  const today = partsIn(nowMs, timezone);
  let best = null;

  // From yesterday, so a slot that began before midnight and is still running
  // is found.
  for (let offset = -1; offset < LOOKAHEAD_DAYS; offset += 1) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const iso = date.toISOString().slice(0, 10);
    const day = DAYS[date.getUTCDay()];

    for (const slot of slots) {
      if (slot.day !== day || iso < slot.from || slot.except.includes(iso)) continue;

      const [hour, minute] = slot.start.split(':').map(Number);
      const startMs = zonedToUtc({
        year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour, minute,
      }, timezone);
      const endMs = startMs + slot.minutes * 60000;

      if (endMs > nowMs && (!best || startMs < best.startMs)) {
        best = { startMs, endMs, title: slot.title, now: startMs <= nowMs };
      }
    }
  }

  return best;
}

function formatTime(ms, timeZone, zoneName = 'short') {
  return tidy(new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: zoneName,
  }).format(ms));
}

function dayWord(startMs, nowMs, timeZone) {
  const start = partsIn(startMs, timeZone);
  const now = partsIn(nowMs, timeZone);
  const apart = Math.round(
    (Date.UTC(start.year, start.month - 1, start.day) - Date.UTC(now.year, now.month - 1, now.day)) / DAY_MS);

  if (apart === 0) return start.hour >= EVENING_HOUR ? 'Tonight' : 'Today';
  if (apart === 1) return 'Tomorrow';
  // A bare weekday a week or more out would read as this week's.
  if (apart > 6) {
    return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' })
      .format(startMs);
  }
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(startMs);
}

/**
 * Words for the hero line, in the reader's zone.
 *
 * @param {Occurrence} next
 * @param {number} nowMs
 * @param {string} [timeZone] the reader's zone; the browser's own by default
 * @returns {{ label: string, when: string, what: string }}
 */
export function describeNext(next, nowMs, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  if (next.now) {
    const from = tidy(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
      .format(next.startMs));
    return { label: 'On the schedule now', when: `${from} – ${formatTime(next.endMs, timeZone)}`, what: next.title };
  }

  return {
    label: 'Next stream',
    when: `${dayWord(next.startMs, nowMs, timeZone)} · ${formatTime(next.startMs, timeZone)}`,
    what: next.title,
  };
}

/** "21:00" -> "9:00 PM", without a zone: the zone is named once, separately. */
function wallTime(start) {
  const [hour, minute] = start.split(':').map(Number);
  return tidy(new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' })
    .format(Date.UTC(2000, 0, 1, hour, minute)));
}

function listDays(days) {
  return days.length < 2 ? days.join('') : `${days.slice(0, -1).join(', ')} & ${days.at(-1)}`;
}

/**
 * The week in the streamer's zone. What the hero shows before, or without,
 * any script: correct for everyone, if not personal.
 *
 * @param {Schedule} schedule
 * @returns {{ label: string, when: string, what: string } | null}
 */
export function describeWeek({ timezone, slots }) {
  if (slots.length === 0) return null;

  const zone = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'shortGeneric' })
    .formatToParts(Date.now()).find((p) => p.type === 'timeZoneName').value;
  const days = [...new Set(slots.map((s) => SHORT_DAYS[DAYS.indexOf(s.day)]))];
  const starts = new Set(slots.map((s) => s.start));

  if (starts.size === 1) {
    return { label: 'Streams', when: `${wallTime(slots[0].start)} ${zone}`, what: listDays(days) };
  }

  return {
    label: 'Streams',
    when: `Weekly, ${zone}`,
    what: slots.map((s) => `${SHORT_DAYS[DAYS.indexOf(s.day)]} ${wallTime(s.start)}`).join(' · '),
  };
}
