import { describe, expect, it } from 'vitest';
import { streamEmbed } from '../src/scripts/lib/embed.js';

const live = (url) => ({ live: true, url, platform: 'twitch', title: '' });
const HOST = 'www.alaydriem.com';

describe('streamEmbed, Twitch', () => {
  it('builds a player URL with the page hostname as parent', () => {
    expect(streamEmbed(live('https://twitch.tv/alaydriem'), HOST)).toBe(
      'https://player.twitch.tv/?channel=alaydriem'
      + '&parent=www.alaydriem.com&autoplay=true&muted=true',
    );
  });

  it('accepts the www form and a trailing slash', () => {
    expect(streamEmbed(live('https://www.twitch.tv/alaydriem/'), HOST))
      .toContain('channel=alaydriem');
  });

  // parent must match wherever the page is actually served, or Twitch refuses
  // to play. Hard-coding production would break local development.
  it('uses whatever hostname it is given', () => {
    expect(streamEmbed(live('https://twitch.tv/alaydriem'), 'localhost'))
      .toContain('parent=localhost');
  });

  it('suppresses autoplay when motion is not wanted', () => {
    expect(streamEmbed(live('https://twitch.tv/alaydriem'), HOST, { motion: false }))
      .toContain('autoplay=false');
  });
});

describe('streamEmbed, YouTube', () => {
  it('handles a watch URL', () => {
    expect(streamEmbed(live('https://www.youtube.com/watch?v=VON56xnHfnQ'), HOST))
      .toBe('https://www.youtube-nocookie.com/embed/VON56xnHfnQ?autoplay=1&mute=1&rel=0');
  });

  it('handles a short URL', () => {
    expect(streamEmbed(live('https://youtu.be/VON56xnHfnQ'), HOST))
      .toContain('/embed/VON56xnHfnQ');
  });

  it('handles a /live/ URL', () => {
    expect(streamEmbed(live('https://www.youtube.com/live/VON56xnHfnQ'), HOST))
      .toContain('/embed/VON56xnHfnQ');
  });
});

describe('streamEmbed refuses anything it cannot verify', () => {
  // The payload is authenticated, but a leaked push token must not become a
  // way to frame arbitrary content on the site.
  it('rejects a host that is not Twitch or YouTube', () => {
    expect(streamEmbed(live('https://evil.example/stream'), HOST)).toBeNull();
    // Lookalike hosts must not pass on a substring match.
    expect(streamEmbed(live('https://twitch.tv.evil.example/a'), HOST)).toBeNull();
    expect(streamEmbed(live('https://nottwitch.tv/alaydriem'), HOST)).toBeNull();
  });

  it('rejects a channel name outside the allowlist', () => {
    expect(streamEmbed(live('https://twitch.tv/a"onload=alert(1)'), HOST)).toBeNull();
    expect(streamEmbed(live('https://twitch.tv/a/../../../b'), HOST)).toBeNull();
    expect(streamEmbed(live('https://twitch.tv/'), HOST)).toBeNull();
  });

  // The URL parser normalises traversal before the allowlist sees it, so
  // "../../etc" arrives as the path "/etc" and yields an ordinary channel
  // name. Worth pinning down: it looks alarming and is not.
  it('normalises path traversal into a harmless channel name', () => {
    expect(streamEmbed(live('https://twitch.tv/../../etc'), HOST))
      .toBe('https://player.twitch.tv/?channel=etc'
        + '&parent=www.alaydriem.com&autoplay=true&muted=true');
  });

  it('rejects a query injected through the channel segment', () => {
    // Would otherwise append parameters to the player URL.
    expect(streamEmbed(live('https://twitch.tv/a&parent=evil.example'), HOST)).toBeNull();
  });

  it('rejects a bad hostname for the parent parameter', () => {
    expect(streamEmbed(live('https://twitch.tv/alaydriem'), 'host&x=1')).toBeNull();
    expect(streamEmbed(live('https://twitch.tv/alaydriem'), '')).toBeNull();
    expect(streamEmbed(live('https://twitch.tv/alaydriem'), null)).toBeNull();
  });

  it('returns null when not live, or when the state is unusable', () => {
    expect(streamEmbed({ live: false, url: 'https://twitch.tv/alaydriem' }, HOST)).toBeNull();
    expect(streamEmbed(null, HOST)).toBeNull();
    expect(streamEmbed(live('not a url'), HOST)).toBeNull();
    expect(streamEmbed({ live: true }, HOST)).toBeNull();
  });
});
