import { describe, expect, it } from 'vitest';
import { arrangePlaylists, slugify } from '../src/lib/playlists.js';

const p = (title, id, count = 1) => ({
  id,
  title,
  description: '',
  itemCount: count,
  thumbnail: '',
  videoIds: Array.from({ length: count }, (_, i) => `v${i}`),
});

describe('slugify', () => {
  it('makes a readable URL segment', () => {
    expect(slugify('Truly Bedrock Season 6')).toBe('truly-bedrock-season-6');
    expect(slugify('Lore & Legend')).toBe('lore-legend');
    expect(slugify('Minecraft: Dungeons & Dragons')).toBe('minecraft-dungeons-dragons');
  });

  it('collapses and trims punctuation rather than leaving it in the URL', () => {
    expect(slugify('  ...Shorts!!!  ')).toBe('shorts');
    expect(slugify('A -- B')).toBe('a-b');
  });

  it('bounds the length', () => {
    expect(slugify('x'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe('arrangePlaylists', () => {
  const all = [
    p('Shorts', 'PLshorts', 116),
    p('Minecraft Farms!', 'PLfarms', 42),
    p('Lore & Legend', 'PLlore', 13),
    p('Bedrock Voice Chat', 'PLbvc', 5),
  ];

  it('leads with the configured order, by title', () => {
    const result = arrangePlaylists(all, { order: ['Bedrock Voice Chat', 'Lore & Legend'] });
    expect(result.map((x) => x.title))
      .toEqual(['Bedrock Voice Chat', 'Lore & Legend', 'Shorts', 'Minecraft Farms!']);
  });

  it('accepts playlist ids as well as titles, so a rename does not silently reorder', () => {
    const result = arrangePlaylists(all, { order: ['PLbvc'] });
    expect(result[0].title).toBe('Bedrock Voice Chat');
  });

  // A new playlist should appear without needing configuration, just not at
  // the top — that position has to be earned.
  it('puts unconfigured playlists after, largest first', () => {
    const result = arrangePlaylists(all, { order: ['Bedrock Voice Chat'] });
    expect(result.slice(1).map((x) => x.title))
      .toEqual(['Shorts', 'Minecraft Farms!', 'Lore & Legend']);
  });

  it('hides what it is told to, by title or id', () => {
    expect(arrangePlaylists(all, { hidden: ['Shorts'] }).map((x) => x.title))
      .not.toContain('Shorts');
    expect(arrangePlaylists(all, { hidden: ['PLshorts'] }).map((x) => x.title))
      .not.toContain('Shorts');
  });

  it('works with no configuration at all', () => {
    expect(arrangePlaylists(all).map((x) => x.title))
      .toEqual(['Shorts', 'Minecraft Farms!', 'Lore & Legend', 'Bedrock Voice Chat']);
  });

  it('assigns a slug to each', () => {
    const result = arrangePlaylists(all);
    expect(result.find((x) => x.title === 'Lore & Legend').slug).toBe('lore-legend');
  });

  // Two playlists sharing a title would otherwise collide on one URL and one
  // would silently overwrite the other at build time.
  it('keeps slugs unique when titles collide', () => {
    const dupes = [p('Farms', 'PLaaaaaa', 2), p('Farms', 'PLbbbbbb', 1)];
    const slugs = arrangePlaylists(dupes).map((x) => x.slug);

    expect(new Set(slugs).size).toBe(2);
    expect(slugs[0]).toBe('farms');
  });

  it('falls back to the id when a title slugs to nothing', () => {
    expect(arrangePlaylists([p('!!!', 'PLxyz', 1)])[0].slug).toBe('plxyz');
  });

  // Build output must not depend on the order the API happened to answer in.
  it('breaks size ties deterministically', () => {
    const tied = [p('Beta', 'PL2', 3), p('Alpha', 'PL1', 3)];
    expect(arrangePlaylists(tied).map((x) => x.title)).toEqual(['Alpha', 'Beta']);
  });
});
