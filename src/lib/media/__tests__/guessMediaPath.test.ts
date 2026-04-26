import { describe, it, expect } from '@jest/globals';
import {
  normalizeFilenameForGatewayGuess,
  guessMediaPath,
  isBareMediaFilename,
} from '../guessMediaPath';

describe('normalizeFilenameForGatewayGuess', () => {
  it('replaces em-dash with triple hyphen', () => {
    expect(normalizeFilenameForGatewayGuess('cute\u2014dragon.mp4')).toBe('cute---dragon.mp4');
  });

  it('replaces en-dash with triple hyphen', () => {
    expect(normalizeFilenameForGatewayGuess('cute\u2013dragon.mp4')).toBe('cute---dragon.mp4');
  });

  it('leaves ASCII hyphens unchanged', () => {
    expect(normalizeFilenameForGatewayGuess('guma-wave---uuid.png')).toBe('guma-wave---uuid.png');
  });

  it('handles multiple em-dashes', () => {
    expect(normalizeFilenameForGatewayGuess('a\u2014b\u2014c.jpg')).toBe('a---b---c.jpg');
  });
});

describe('guessMediaPath', () => {
  it('returns an image path for a .png filename', () => {
    const result = guessMediaPath('photo.png');
    expect(result).not.toBeNull();
    expect(result?.kind).toBe('image');
    expect(result?.sourcePath).toBe('~/.openclaw/media/tool-image-generation/photo.png');
  });

  it('returns a video path for a .mp4 filename', () => {
    const result = guessMediaPath('clip.mp4');
    expect(result).not.toBeNull();
    expect(result?.kind).toBe('video');
    expect(result?.sourcePath).toBe('~/.openclaw/media/tool-video-generation/clip.mp4');
  });

  it('returns an audio path for a .mp3 filename', () => {
    const result = guessMediaPath('track.mp3');
    expect(result).not.toBeNull();
    expect(result?.kind).toBe('audio');
    expect(result?.sourcePath).toBe('~/.openclaw/media/tool-audio-generation/track.mp3');
  });

  it('normalizes em-dash in the guessed path', () => {
    const result = guessMediaPath('guma\u2014wave---4a9fcbdd.mp4');
    expect(result).not.toBeNull();
    expect(result?.sourcePath).toBe(
      '~/.openclaw/media/tool-video-generation/guma---wave---4a9fcbdd.mp4',
    );
  });

  it('returns null for an unknown extension', () => {
    expect(guessMediaPath('document.pdf')).toBeNull();
    expect(guessMediaPath('readme.txt')).toBeNull();
    expect(guessMediaPath('script.py')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(guessMediaPath('')).toBeNull();
  });

  it('handles all image extensions', () => {
    for (const ext of ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic']) {
      const r = guessMediaPath(`file.${ext}`);
      expect(r?.kind).toBe('image');
    }
  });

  it('handles all video extensions', () => {
    for (const ext of ['mp4', 'mov', 'mkv', 'webm', 'm4v']) {
      const r = guessMediaPath(`file.${ext}`);
      expect(r?.kind).toBe('video');
    }
  });

  it('handles all audio extensions', () => {
    for (const ext of ['mp3', 'wav', 'm4a', 'opus', 'ogg']) {
      const r = guessMediaPath(`file.${ext}`);
      expect(r?.kind).toBe('audio');
    }
  });
});

describe('isBareMediaFilename', () => {
  it('returns true for a plain image filename', () => {
    expect(isBareMediaFilename('photo.jpg')).toBe(true);
    expect(isBareMediaFilename('guma-wave---uuid.mp4')).toBe(true);
  });

  it('returns false for a sentence mentioning a filename', () => {
    expect(isBareMediaFilename('Here is photo.jpg for you')).toBe(false);
  });

  it('returns false for a filename with newlines', () => {
    expect(isBareMediaFilename('photo.jpg\nsome text')).toBe(false);
  });

  it('returns false for an unknown extension', () => {
    expect(isBareMediaFilename('report.pdf')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isBareMediaFilename('')).toBe(false);
    expect(isBareMediaFilename('   ')).toBe(false);
  });

  it('returns false for a very long string (>200 chars)', () => {
    const long = 'a'.repeat(200) + '.jpg';
    expect(isBareMediaFilename(long)).toBe(false);
  });

  it('handles leading/trailing whitespace', () => {
    expect(isBareMediaFilename('  photo.png  ')).toBe(true);
  });
});
