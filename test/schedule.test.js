import { describe, expect, it } from 'vitest';
import { describeNext, describeWeek, nextStream, zonedToUtc } from '../src/scripts/lib/schedule.js';

const slot = (day, extra = {}) =>
  ({ day, start: '21:00', minutes: 180, title: 'Minecraft Truly Bedrock', from: '2024-01-01', except: [], ...extra });

/** The real schedule, as parsed from the feed on 2026-10-11. */
const schedule = {
  timezone: 'America/Chicago',
  slots: [
    slot('SU'),
    slot('MO', { title: 'Alaydriem :: Minecraft, Minecraft Truly Bedrock' }),
    slot('TU', { minutes: 240 }),
    slot('TH'),
    slot('FR', { title: "Alaydriem & Adequate's Friday Hangout!" }),
  ],
};

const at = (iso) => Date.parse(iso);

describe('zonedToUtc', () => {
  it('converts a Chicago wall time in daylight time', () => {
    expect(zonedToUtc({ year: 2026, month: 10, day: 25, hour: 21, minute: 0 }, 'America/Chicago'))
      .toBe(at('2026-10-26T02:00:00Z'));
  });

  it('converts a Chicago wall time in standard time, after the change', () => {
    expect(zonedToUtc({ year: 2026, month: 11, day: 1, hour: 21, minute: 0 }, 'America/Chicago'))
      .toBe(at('2026-11-02T03:00:00Z'));
  });
});

describe('nextStream', () => {
  it('finds tonight’s slot', () => {
    const next = nextStream(schedule, at('2026-10-11T19:00:00Z'));

    expect(next).toEqual({
      startMs: at('2026-10-12T02:00:00Z'),
      endMs: at('2026-10-12T05:00:00Z'),
      title: 'Minecraft Truly Bedrock',
      now: false,
    });
  });

  it('reports a slot that is running now', () => {
    const next = nextStream(schedule, at('2026-10-12T03:00:00Z'));

    expect(next.startMs).toBe(at('2026-10-12T02:00:00Z'));
    expect(next.now).toBe(true);
  });

  it('wraps past the end of the week', () => {
    // Saturday 1 AM in Chicago, after Friday's slot ended at midnight.
    const next = nextStream(schedule, at('2026-10-17T06:00:00Z'));

    expect(next.startMs).toBe(at('2026-10-19T02:00:00Z'));
  });

  it('follows the change out of daylight time', () => {
    const next = nextStream(schedule, at('2026-11-01T18:00:00Z'));

    expect(next.startMs).toBe(at('2026-11-02T03:00:00Z'));
  });

  it('skips a cancelled date', () => {
    const only = { ...schedule, slots: [slot('TU', { except: ['2026-10-13'] })] };

    expect(nextStream(only, at('2026-10-11T19:00:00Z')).startMs).toBe(at('2026-10-21T02:00:00Z'));
  });

  it('does not show a slot before its first date', () => {
    const only = { ...schedule, slots: [slot('TU', { from: '2026-11-03' })] };

    expect(nextStream(only, at('2026-10-11T19:00:00Z')).startMs).toBe(at('2026-11-04T03:00:00Z'));
  });

  it('returns null when there is nothing scheduled', () => {
    expect(nextStream({ ...schedule, slots: [] }, at('2026-10-11T19:00:00Z'))).toBeNull();
  });

  it('returns null when every slot is cancelled for weeks ahead', () => {
    const except = Array.from({ length: 8 }, (_, i) =>
      new Date(at('2026-10-13T12:00:00Z') + i * 7 * 86400000).toISOString().slice(0, 10));
    const only = { ...schedule, slots: [slot('TU', { except })] };

    expect(nextStream(only, at('2026-10-11T19:00:00Z'))).toBeNull();
  });
});

describe('describeNext', () => {
  const next = nextStream(schedule, at('2026-10-11T19:00:00Z'));

  it('says tonight, in the viewer’s own zone', () => {
    expect(describeNext(next, at('2026-10-11T19:00:00Z'), 'America/New_York')).toEqual({
      label: 'Next stream',
      when: 'Tonight · 10:00 PM EDT',
      what: 'Minecraft Truly Bedrock',
    });
  });

  it('says today for a daytime start, where the date has already turned', () => {
    expect(describeNext(next, at('2026-10-11T19:00:00Z'), 'Asia/Tokyo').when)
      .toBe('Today · 11:00 AM GMT+9');
  });

  it('says tomorrow', () => {
    const sat = nextStream(schedule, at('2026-10-17T06:00:00Z'));

    expect(describeNext(sat, at('2026-10-17T06:00:00Z'), 'America/Chicago').when)
      .toBe('Tomorrow · 9:00 PM CDT');
  });

  it('names the weekday further out', () => {
    const only = { ...schedule, slots: [slot('TU')] };
    const wed = at('2026-10-14T18:00:00Z');

    expect(describeNext(nextStream(only, wed), wed, 'America/Chicago').when)
      .toBe('Tuesday · 9:00 PM CDT');
  });

  it('gives a date, not a bare weekday, a week or more out', () => {
    const only = { ...schedule, slots: [slot('TU', { from: '2026-11-03' })] };
    const now = at('2026-10-11T19:00:00Z');

    expect(describeNext(nextStream(only, now), now, 'America/Chicago').when)
      .toBe('Tue, Nov 3 · 9:00 PM CST');
  });

  it('says when a slot is running now', () => {
    const now = at('2026-10-12T03:00:00Z');

    expect(describeNext(nextStream(schedule, now), now, 'America/Chicago')).toEqual({
      label: 'On the schedule now',
      when: '9:00 PM – 12:00 AM CDT',
      what: 'Minecraft Truly Bedrock',
    });
  });
});

describe('describeWeek', () => {
  it('summarises a week that starts at one time', () => {
    expect(describeWeek(schedule)).toEqual({
      label: 'Streams',
      when: '9:00 PM CT',
      what: 'Sun, Mon, Tue, Thu & Fri',
    });
  });

  it('lists each day with its time when the times differ', () => {
    const mixed = { ...schedule, slots: [slot('SU'), slot('TU', { start: '19:30' })] };

    expect(describeWeek(mixed)).toEqual({
      label: 'Streams',
      when: 'Weekly, CT',
      what: 'Sun 9:00 PM · Tue 7:30 PM',
    });
  });

  it('returns null for an empty week', () => {
    expect(describeWeek({ ...schedule, slots: [] })).toBeNull();
  });
});
