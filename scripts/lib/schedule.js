/**
 * Reads the Twitch stream schedule, an iCalendar feed, into data/schedule.json.
 *
 * Twitch publishes every schedule segment as one weekly repeating event, so the
 * output is the rules rather than a list of dates. The page works out the next
 * date itself: the refresh job only deploys when this file changes, so a
 * pre-computed "next stream" would go stale between deploys.
 *
 * Only what Twitch emits is supported — weekly rules with a time zone. Anything
 * else is reported and skipped rather than guessed at. No iCalendar library:
 * this subset is a few dozen lines, and the full format is not.
 */

const DAY_ORDER = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** @param {string} url */
export function toHttps(url) {
  return url.replace(/^webcal:\/\//i, 'https://');
}

/** RFC 5545 3.1: a line starting with a space or tab continues the one before. */
function unfold(text) {
  return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
}

/** RFC 5545 3.3.11 text escapes. */
function unescapeText(value) {
  return value.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

/**
 * "DTSTART;TZID=/America/Chicago:20261011T210000"
 *   -> { name: 'DTSTART', params: { TZID: '/America/Chicago' }, value: '20261011T210000' }
 */
function parseLine(line) {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(';');
  const params = Object.fromEntries(rawParams.map((p) => p.split('=')));
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

/** "20261011T210000" -> { date: '2026-10-11', time: '21:00', minutes: 1260 } */
function parseLocal(value) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(value ?? '');
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}`, minutes: Number(h) * 60 + Number(mi) };
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=..." -> { FREQ: 'WEEKLY', BYDAY: 'MO,WE', ... } */
function parseRule(value) {
  return Object.fromEntries(value.split(';').map((part) => part.split('=')));
}

/** UNTIL is either a date or a UTC date-time. */
function untilMs(until) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(until);
  if (!m) return null;
  const [, y, mo, d, h = '23', mi = '59', s = '59'] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

function events(lines) {
  const out = [];
  let current = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = [];
    else if (line === 'END:VEVENT') {
      if (current) out.push(current);
      current = null;
    } else if (current) {
      const parsed = parseLine(line);
      if (parsed) current.push(parsed);
    }
  }
  return out;
}

/**
 * @typedef {{ day: string, start: string, minutes: number, title: string, from: string, except: string[] }} Slot
 * @typedef {{ timezone: string, slots: Slot[] }} Schedule
 *
 * @param {string} text the .ics body
 * @param {Date} now drops rules whose UNTIL has passed
 * @returns {{ schedule: Schedule, skipped: string[] }}
 */
export function parseSchedule(text, now) {
  const skipped = [];
  const slots = [];
  let timezone = '';

  for (const props of events(unfold(text))) {
    const get = (name) => props.find((p) => p.name === name);
    const title = unescapeText(get('SUMMARY')?.value ?? '').trim();
    const dtstart = get('DTSTART');
    const start = parseLocal(dtstart?.value);
    const end = parseLocal(get('DTEND')?.value);
    const rule = get('RRULE') ? parseRule(get('RRULE').value) : null;
    const tz = (dtstart?.params.TZID ?? '').replace(/^\//, '');

    if (!start || !end || !tz || rule?.FREQ !== 'WEEKLY' || !rule.BYDAY) {
      skipped.push(title || '(untitled)');
      continue;
    }

    const ends = rule.UNTIL ? untilMs(rule.UNTIL) : null;
    if (ends !== null && ends < now.getTime()) continue;

    timezone ||= tz;
    const minutes = daysBetween(start.date, end.date) * 1440 + end.minutes - start.minutes;
    const except = props
      .filter((p) => p.name === 'EXDATE')
      .flatMap((p) => p.value.split(','))
      .map((value) => parseLocal(value)?.date)
      .filter(Boolean);

    for (const day of rule.BYDAY.split(',')) {
      slots.push({ day, start: start.time, minutes, title, from: start.date, except });
    }
  }

  slots.sort((a, b) =>
    DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.start.localeCompare(b.start));

  return { schedule: { timezone, slots }, skipped };
}
