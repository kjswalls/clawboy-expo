import type { AgentFile } from '@/lib/openclaw/types';
import { extractBareHref, findAgentFileMatch, isInternalLink } from '../links';

const makeFile = (name: string, path?: string): AgentFile => ({
  name,
  path: path ?? name,
  missing: false,
});

describe('isInternalLink', () => {
  it('returns false for http URLs', () => {
    expect(isInternalLink('http://example.com')).toBe(false);
  });

  it('returns false for https URLs', () => {
    expect(isInternalLink('https://example.com/path')).toBe(false);
  });

  it('returns false for mailto:', () => {
    expect(isInternalLink('mailto:user@example.com')).toBe(false);
  });

  it('returns false for tel:', () => {
    expect(isInternalLink('tel:+15005550000')).toBe(false);
  });

  it('returns false for ws://', () => {
    expect(isInternalLink('ws://gateway.local')).toBe(false);
  });

  it('returns false for wss://', () => {
    expect(isInternalLink('wss://gateway.local')).toBe(false);
  });

  it('returns false for custom app scheme', () => {
    expect(isInternalLink('clawboy://auth-callback')).toBe(false);
  });

  it('returns true for file:// (gateway filesystem path)', () => {
    expect(isInternalLink('file:///home/ubuntu/.openclaw/workspace/MEMORY.md')).toBe(true);
  });

  it('returns true for FILE:// (case-insensitive)', () => {
    expect(isInternalLink('FILE:///home/ubuntu/foo.md')).toBe(true);
  });

  it('returns true for bare filename', () => {
    expect(isInternalLink('Memory.MD')).toBe(true);
  });

  it('returns true for relative path', () => {
    expect(isInternalLink('./docs/infrastructure.md')).toBe(true);
  });

  it('returns true for absolute server path', () => {
    expect(isInternalLink('/tmp/notes.txt')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isInternalLink('')).toBe(false);
  });

  // Defensive backstop: linkify-it with fuzzyLink may still produce
  // http://memory.md for bare filenames if the config drifts.
  it('returns true for http://name.md (linkify-promoted bare filename)', () => {
    expect(isInternalLink('http://memory.md')).toBe(true);
  });

  it('returns true for https://script.sh (linkify-promoted bare filename)', () => {
    expect(isInternalLink('https://script.sh')).toBe(true);
  });

  it('returns true for http://NOTES.TXT (case-insensitive extension)', () => {
    expect(isInternalLink('http://NOTES.TXT')).toBe(true);
  });

  it('returns false for https://example.com/foo.md (real URL with file-ext path)', () => {
    expect(isInternalLink('https://example.com/foo.md')).toBe(false);
  });

  it('returns false for http://example.com (real domain, no file ext)', () => {
    expect(isInternalLink('http://example.com')).toBe(false);
  });
});

describe('findAgentFileMatch', () => {
  const files: AgentFile[] = [
    makeFile('Memory.md', 'Memory.md'),
    makeFile('IDENTITY.md', 'IDENTITY.md'),
    makeFile('infrastructure.md', 'docs/infrastructure.md'),
    makeFile('notes.txt', 'notes.txt'),
  ];

  it('matches exact basename (same case)', () => {
    expect(findAgentFileMatch('Memory.md', files)?.name).toBe('Memory.md');
  });

  it('matches case-insensitively (Memory.MD vs Memory.md)', () => {
    expect(findAgentFileMatch('Memory.MD', files)?.name).toBe('Memory.md');
  });

  it('matches with ./ prefix stripped', () => {
    expect(findAgentFileMatch('./Memory.md', files)?.name).toBe('Memory.md');
  });

  it('matches with leading / stripped', () => {
    expect(findAgentFileMatch('/Memory.md', files)?.name).toBe('Memory.md');
  });

  it('matches fragment stripped', () => {
    expect(findAgentFileMatch('Memory.md#section', files)?.name).toBe('Memory.md');
  });

  it('matches query stripped', () => {
    expect(findAgentFileMatch('Memory.md?ts=123', files)?.name).toBe('Memory.md');
  });

  it('matches by full workspace-relative path', () => {
    expect(findAgentFileMatch('docs/infrastructure.md', files)?.name).toBe('infrastructure.md');
  });

  it('matches basename that ends path with /', () => {
    expect(findAgentFileMatch('infrastructure.md', files)?.name).toBe('infrastructure.md');
  });

  it('returns null when no match', () => {
    expect(findAgentFileMatch('unknown.md', files)).toBeNull();
  });

  it('returns null for empty href', () => {
    expect(findAgentFileMatch('', files)).toBeNull();
  });

  it('returns null for empty files list', () => {
    expect(findAgentFileMatch('Memory.md', [])).toBeNull();
  });

  it('does not match external URLs', () => {
    expect(findAgentFileMatch('https://example.com', files)).toBeNull();
  });

  // http(s)://name.ext defensive backstop
  it('matches Memory.md via http://memory.md (linkify-promoted)', () => {
    expect(findAgentFileMatch('http://memory.md', files)?.name).toBe('Memory.md');
  });

  it('matches Memory.md via http://Memory.MD (case-insensitive)', () => {
    expect(findAgentFileMatch('http://Memory.MD', files)?.name).toBe('Memory.md');
  });

  it('returns null for https://example.com/foo.md (real URL with file-ext path component)', () => {
    expect(findAgentFileMatch('https://example.com/foo.md', files)).toBeNull();
  });
});

describe('findAgentFileMatch — file:// gateway paths', () => {
  const memoryFile = makeFile('MEMORY.md', 'MEMORY.md');
  const infraFile = makeFile('infrastructure.md', 'memory/detail/infrastructure.md');
  const files = [memoryFile, infraFile, makeFile('notes.txt', 'notes.txt')];

  it('matches MEMORY.md by basename from a deep file:// path', () => {
    const href = 'file:///home/ubuntu/.openclaw/workspace/MEMORY.md';
    expect(findAgentFileMatch(href, files)?.name).toBe('MEMORY.md');
  });

  it('matches infrastructure.md by ends-with-path from a deep file:// path', () => {
    const href = 'file:///home/ubuntu/.openclaw/workspace/memory/detail/infrastructure.md';
    expect(findAgentFileMatch(href, files)?.name).toBe('infrastructure.md');
  });

  it('matches case-insensitively via file:// (MEMORY.MD → MEMORY.md)', () => {
    const href = 'file:///home/ubuntu/.openclaw/workspace/MEMORY.MD';
    expect(findAgentFileMatch(href, files)?.name).toBe('MEMORY.md');
  });

  it('returns null for a file:// path that has no matching agent file', () => {
    const href = 'file:///etc/passwd';
    expect(findAgentFileMatch(href, files)).toBeNull();
  });

  it('returns null when files list is empty and href is file://', () => {
    const href = 'file:///home/ubuntu/.openclaw/workspace/MEMORY.md';
    expect(findAgentFileMatch(href, [])).toBeNull();
  });

  it('strips file:// before matching (same result as bare basename)', () => {
    const href = 'file:///home/ubuntu/.openclaw/workspace/notes.txt';
    expect(findAgentFileMatch(href, files)?.name).toBe('notes.txt');
  });
});

describe('extractBareHref', () => {
  it('returns bare filename as-is', () => {
    expect(extractBareHref('memory.md')).toBe('memory.md');
  });

  it('strips leading ./', () => {
    expect(extractBareHref('./memory.md')).toBe('memory.md');
  });

  it('strips leading /', () => {
    expect(extractBareHref('/memory.md')).toBe('memory.md');
  });

  it('strips file:// prefix from deep path', () => {
    expect(extractBareHref('file:///home/ubuntu/.openclaw/workspace/MEMORY.md')).toBe(
      'home/ubuntu/.openclaw/workspace/MEMORY.md',
    );
  });

  it('strips http://name.ext to just the filename', () => {
    expect(extractBareHref('http://memory.md')).toBe('memory.md');
  });

  it('strips https://name.ext to just the filename', () => {
    expect(extractBareHref('https://SCRIPT.SH')).toBe('script.sh');
  });

  it('strips fragment', () => {
    expect(extractBareHref('memory.md#section')).toBe('memory.md');
  });

  it('strips query', () => {
    expect(extractBareHref('memory.md?ts=123')).toBe('memory.md');
  });

  it('returns null for empty string', () => {
    expect(extractBareHref('')).toBeNull();
  });
});
