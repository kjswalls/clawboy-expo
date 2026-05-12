import { describe, it, expect } from '@jest/globals';
import {
  stripAnsi,
  parseMediaTokens,
  classifyMediaUrls,
  generateUUID,
  extractToolResultText,
} from '../utils';

describe('stripAnsi', () => {
  it('strips CSI color sequences', () => {
    expect(stripAnsi('\x1b[31mred text\x1b[0m')).toBe('red text');
  });

  it('strips OSC sequences terminated by BEL', () => {
    expect(stripAnsi('\x1b]0;window title\x07normal text')).toBe('normal text');
  });

  it('passes through plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('');
  });

  it('strips multiple CSI sequences in one string', () => {
    expect(stripAnsi('\x1b[1m\x1b[32mbold green\x1b[0m')).toBe('bold green');
  });
});

describe('extractToolResultText', () => {
  it('returns string input as-is', () => {
    expect(extractToolResultText('hello')).toBe('hello');
  });

  it('extracts text from { content: [{type: text, text: ...}] }', () => {
    const result = extractToolResultText({
      content: [{ type: 'text', text: 'hello' }],
    });
    expect(result).toBe('hello');
  });

  it('uses { text: ... } fallback', () => {
    expect(extractToolResultText({ text: 'fallback' })).toBe('fallback');
  });

  it('returns undefined for null', () => {
    expect(extractToolResultText(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(extractToolResultText(undefined)).toBeUndefined();
  });

  it('concatenates multiple text content blocks', () => {
    const result = extractToolResultText({
      content: [
        { type: 'text', text: 'part1 ' },
        { type: 'text', text: 'part2' },
      ],
    });
    expect(result).toBe('part1 \npart2');
  });
});

describe('generateUUID', () => {
  it('returns a string matching UUID v4 format', () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('returns unique values on successive calls', () => {
    const uuids = new Set(Array.from({ length: 20 }, () => generateUUID()));
    expect(uuids.size).toBe(20);
  });
});

describe('parseMediaTokens', () => {
  it('extracts image URL from MEDIA: line', () => {
    const text = 'Look at this:\nMEDIA: https://example.com/image.png\nDone.';
    const { images, audioUrls, videoUrls, cleanText } = parseMediaTokens(text);
    expect(images).toHaveLength(1);
    expect(images[0]!.url).toContain('image.png');
    expect(audioUrls).toHaveLength(0);
    expect(videoUrls).toHaveLength(0);
    expect(cleanText).not.toContain('MEDIA:');
  });

  it('extracts audio URL from MEDIA: line', () => {
    const text = 'MEDIA: https://example.com/audio.mp3';
    const { audioUrls } = parseMediaTokens(text);
    expect(audioUrls).toHaveLength(1);
    expect(audioUrls[0]).toContain('audio.mp3');
  });

  it('extracts video URL from MEDIA: line', () => {
    const text = 'MEDIA: https://example.com/clip.mp4';
    const { videoUrls } = parseMediaTokens(text);
    expect(videoUrls).toHaveLength(1);
    expect(videoUrls[0]).toContain('clip.mp4');
  });

  it('extracts multiple MEDIA tokens', () => {
    const text = [
      'MEDIA: https://example.com/a.png',
      'MEDIA: https://example.com/b.mp3',
    ].join('\n');
    const { images, audioUrls } = parseMediaTokens(text);
    expect(images).toHaveLength(1);
    expect(audioUrls).toHaveLength(1);
  });

  it('returns empty arrays when no MEDIA tokens present', () => {
    const text = 'Just regular text without any media.';
    const { images, audioUrls, videoUrls, cleanText } = parseMediaTokens(text);
    expect(images).toHaveLength(0);
    expect(audioUrls).toHaveLength(0);
    expect(videoUrls).toHaveLength(0);
    expect(cleanText).toBe(text);
  });
});

describe('classifyMediaUrls', () => {
  it('classifies image extension URLs into images[]', () => {
    const { images, audioUrls, videoUrls } = classifyMediaUrls([
      'https://example.com/photo.jpg',
      'https://example.com/shot.png',
    ]);
    expect(images).toHaveLength(2);
    expect(audioUrls).toHaveLength(0);
    expect(videoUrls).toHaveLength(0);
  });

  it('classifies audio extension URLs into audioUrls[]', () => {
    const { audioUrls } = classifyMediaUrls([
      'https://example.com/sound.mp3',
      'https://example.com/voice.opus',
    ]);
    expect(audioUrls).toHaveLength(2);
  });

  it('classifies video extension URLs into videoUrls[]', () => {
    const { videoUrls } = classifyMediaUrls([
      'https://example.com/clip.mp4',
      'https://example.com/movie.mov',
    ]);
    expect(videoUrls).toHaveLength(2);
  });

  it('handles empty array', () => {
    const { images, audioUrls, videoUrls } = classifyMediaUrls([]);
    expect(images).toHaveLength(0);
    expect(audioUrls).toHaveLength(0);
    expect(videoUrls).toHaveLength(0);
  });
});
