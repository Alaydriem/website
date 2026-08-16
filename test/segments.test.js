import { describe, expect, it } from 'vitest';
import { nextTab, selectTab } from '../src/scripts/lib/segments.js';

const TABS = ['watch', 'builds', 'tools', 'posts'];

describe('selectTab', () => {
  it('honours a requested tab that exists', () => {
    expect(selectTab(TABS, 'tools', 'watch')).toBe('tools');
  });

  it('falls back when the request is unknown', () => {
    expect(selectTab(TABS, 'nonsense', 'watch')).toBe('watch');
  });

  it('falls back when nothing is requested', () => {
    expect(selectTab(TABS, '', 'watch')).toBe('watch');
    expect(selectTab(TABS, null, 'watch')).toBe('watch');
    expect(selectTab(TABS, undefined, 'watch')).toBe('watch');
  });

  it('strips a leading hash, because it is fed location.hash', () => {
    expect(selectTab(TABS, '#builds', 'watch')).toBe('builds');
  });
});

describe('nextTab', () => {
  it('moves right and left', () => {
    expect(nextTab(TABS, 'watch', 'ArrowRight')).toBe('builds');
    expect(nextTab(TABS, 'builds', 'ArrowLeft')).toBe('watch');
  });

  it('treats up and down like left and right', () => {
    expect(nextTab(TABS, 'watch', 'ArrowDown')).toBe('builds');
    expect(nextTab(TABS, 'builds', 'ArrowUp')).toBe('watch');
  });

  it('wraps at both ends', () => {
    expect(nextTab(TABS, 'posts', 'ArrowRight')).toBe('watch');
    expect(nextTab(TABS, 'watch', 'ArrowLeft')).toBe('posts');
  });

  it('jumps to the ends', () => {
    expect(nextTab(TABS, 'tools', 'Home')).toBe('watch');
    expect(nextTab(TABS, 'tools', 'End')).toBe('posts');
  });

  it('returns the current tab for any other key', () => {
    expect(nextTab(TABS, 'tools', 'a')).toBe('tools');
    expect(nextTab(TABS, 'tools', 'Enter')).toBe('tools');
  });

  it('returns the current tab when it is not in the list', () => {
    expect(nextTab(TABS, 'ghost', 'ArrowRight')).toBe('ghost');
  });

  // Phase 2 ships two panels, not four. The logic must not assume a length.
  it('works with a two-tab set', () => {
    const two = ['watch', 'tools'];
    expect(nextTab(two, 'watch', 'ArrowRight')).toBe('tools');
    expect(nextTab(two, 'tools', 'ArrowRight')).toBe('watch');
  });
});
