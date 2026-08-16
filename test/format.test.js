import { describe, expect, it } from 'vitest';
import { formatAge, formatViews, watchUrl } from '../src/lib/format.js';

describe('formatViews', () => {
  it('shows counts below a thousand in full', () => {
    expect(formatViews(0)).toBe('0 views');
    expect(formatViews(203)).toBe('203 views');
    expect(formatViews(999)).toBe('999 views');
  });

  it('abbreviates thousands and millions to one decimal', () => {
    expect(formatViews(2600)).toBe('2.6K views');
    expect(formatViews(65800)).toBe('65.8K views');
    expect(formatViews(1_200_000)).toBe('1.2M views');
  });

  // The Hugo template used %d on a value the JSON decoder had made a float, and
  // Go printed "%!d(float64=203)" as page copy without failing the build.
  it('handles a float without emitting a format error', () => {
    expect(formatViews(203.0)).toBe('203 views');
    expect(formatViews(203.4)).toBe('203 views');
  });

  it('returns nothing for a value that is not a usable number', () => {
    expect(formatViews('lots')).toBe('');
    expect(formatViews(-1)).toBe('');
    expect(formatViews(Infinity)).toBe('');
  });
});

describe('formatAge', () => {
  const now = Date.parse('2026-08-15T00:00:00Z');
  const ago = (days) => new Date(now - days * 86_400_000).toISOString();

  it('describes each bracket', () => {
    expect(formatAge(ago(0), now)).toBe('today');
    expect(formatAge(ago(3), now)).toBe('3d ago');
    expect(formatAge(ago(14), now)).toBe('2w ago');
    expect(formatAge(ago(90), now)).toBe('3mo ago');
    expect(formatAge(ago(800), now)).toBe('2y ago');
  });

  it('does not report a negative age when a clock disagrees', () => {
    expect(formatAge(ago(-5), now)).toBe('today');
  });

  it('returns nothing for an unparseable date', () => {
    expect(formatAge('not a date', now)).toBe('');
  });
});

describe('watchUrl', () => {
  // Hugo lowercased URL segments while YouTube ids are case-sensitive. Every
  // redirect stub depends on this preserving case exactly.
  it('preserves id casing', () => {
    expect(watchUrl('_-W6slwRQt0')).toBe('https://www.youtube.com/watch?v=_-W6slwRQt0');
  });
});
