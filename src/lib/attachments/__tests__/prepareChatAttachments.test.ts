import { describe, expect, it } from '@jest/globals';

import { guessMimeType } from '../prepareChatAttachments';

describe('guessMimeType', () => {
  it('maps common extensions', () => {
    expect(guessMimeType('x.pdf', 'file://x', 'file')).toBe('application/pdf');
    expect(guessMimeType('pic.PNG', 'file://p', 'image')).toBe('image/png');
    expect(guessMimeType('a.m4a', 'file://a', 'audio')).toBe('audio/mp4');
  });

  it('falls back by kind', () => {
    expect(guessMimeType('unknown', 'file://z', 'video')).toBe('video/mp4');
    expect(guessMimeType('unknown', 'file://z', 'audio')).toBe('audio/mp4');
  });
});
