import { describe, expect, it } from 'vitest';
import { requireEnv } from '../scripts/lib/env.js';

describe('requireEnv', () => {
  it('returns the value when it is set', () => {
    expect(requireEnv('YOUTUBE_API_KEY', { YOUTUBE_API_KEY: 'abc' })).toBe('abc');
  });

  it('throws a named error when the variable is absent', () => {
    expect(() => requireEnv('YOUTUBE_API_KEY', {})).toThrow(
      'Missing required environment variable: YOUTUBE_API_KEY',
    );
  });

  it('treats an empty string as absent', () => {
    expect(() => requireEnv('YOUTUBE_API_KEY', { YOUTUBE_API_KEY: '' })).toThrow(
      'Missing required environment variable: YOUTUBE_API_KEY',
    );
  });

  it('treats whitespace as absent', () => {
    expect(() => requireEnv('YOUTUBE_API_KEY', { YOUTUBE_API_KEY: '   ' })).toThrow(
      'Missing required environment variable: YOUTUBE_API_KEY',
    );
  });
});
