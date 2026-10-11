import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSchedule, toHttps } from '../scripts/lib/schedule.js';

const NOW = new Date('2026-10-11T19:00:00Z');
const feed = readFileSync(new URL('./fixtures/schedule.ics', import.meta.url), 'utf8');

/** Wraps VEVENT bodies in a calendar, CRLF line endings as Twitch sends them. */
const calendar = (...events) => [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  ...events.flatMap((lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT']),
  'END:VCALENDAR',
].join('\r\n');

const weekly = (day, start = '20261011T210000', end = '20261012T000000', extra = []) => [
  `DTSTART;TZID=/America/Chicago:${start}`,
  `DTEND;TZID=/America/Chicago:${end}`,
  'SUMMARY:Minecraft Truly Bedrock',
  `RRULE:FREQ=WEEKLY;BYDAY=${day}`,
  ...extra,
];

describe('parseSchedule', () => {
  it('reads the real Twitch feed into weekly slots, Sunday first', () => {
    const { schedule, skipped } = parseSchedule(feed, NOW);

    expect(skipped).toEqual([]);
    expect(schedule.timezone).toBe('America/Chicago');
    expect(schedule.slots.map((s) => s.day)).toEqual(['SU', 'MO', 'TU', 'TH', 'FR']);
    expect(schedule.slots.every((s) => s.start === '21:00')).toBe(true);
  });

  it('measures the slot length in minutes, across midnight', () => {
    const { schedule } = parseSchedule(feed, NOW);
    const tuesday = schedule.slots.find((s) => s.day === 'TU');

    expect(tuesday.minutes).toBe(240);
    expect(tuesday.title).toBe('Minecraft Truly Bedrock');
  });

  it('keeps the first date, so a slot that has not started yet is not shown early', () => {
    const { schedule } = parseSchedule(calendar(weekly('TU', '20261103T190000', '20261103T220000')), NOW);

    expect(schedule.slots[0]).toMatchObject({ day: 'TU', start: '19:00', minutes: 180, from: '2026-11-03' });
  });

  it('gives a slot one entry per day when a rule names several', () => {
    const { schedule } = parseSchedule(calendar(weekly('MO,WE')), NOW);

    expect(schedule.slots.map((s) => s.day)).toEqual(['MO', 'WE']);
  });

  it('carries cancelled dates as local dates', () => {
    const { schedule } = parseSchedule(calendar(weekly('TU', undefined, undefined, [
      'EXDATE;TZID=/America/Chicago:20261013T210000,20261020T210000',
    ])), NOW);

    expect(schedule.slots[0].except).toEqual(['2026-10-13', '2026-10-20']);
  });

  it('drops a rule that has already ended', () => {
    const { schedule, skipped } = parseSchedule(calendar(
      weekly('MO', undefined, undefined, []).map((line) =>
        (line.startsWith('RRULE') ? `${line};UNTIL=20250101T000000Z` : line)),
    ), NOW);

    expect(schedule.slots).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it('skips, and reports, anything that is not a weekly rule', () => {
    const { schedule, skipped } = parseSchedule(calendar(
      ['DTSTART;TZID=/America/Chicago:20261020T210000', 'DTEND;TZID=/America/Chicago:20261020T230000', 'SUMMARY:One off'],
      weekly('FR').map((line) => (line.startsWith('RRULE') ? 'RRULE:FREQ=DAILY' : line)),
    ), NOW);

    expect(schedule.slots).toEqual([]);
    expect(skipped).toHaveLength(2);
  });

  it('unfolds long lines and unescapes text', () => {
    const { schedule } = parseSchedule(calendar([
      'DTSTART;TZID=/America/Chicago:20261011T210000',
      'DTEND;TZID=/America/Chicago:20261012T000000',
      'SUMMARY:Alaydriem\\, Adequate & a very long title that Twitch folds onto',
      '  a second line',
      'RRULE:FREQ=WEEKLY;BYDAY=FR',
    ]), NOW);

    expect(schedule.slots[0].title)
      .toBe('Alaydriem, Adequate & a very long title that Twitch folds onto a second line');
  });
});

describe('toHttps', () => {
  it('turns the webcal link into something fetch can read', () => {
    expect(toHttps('webcal://api.twitch.tv/helix/schedule/icalendar?broadcaster_id=1'))
      .toBe('https://api.twitch.tv/helix/schedule/icalendar?broadcaster_id=1');
  });
});
