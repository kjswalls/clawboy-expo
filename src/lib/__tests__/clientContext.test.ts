import {
  AGENTS_MD_END,
  AGENTS_MD_START,
  buildAgentsMdSection,
  buildClientContextDirective,
  CLAWBOY_CONVENTION_TEXT,
  CONVENTION_VERSION,
  PRIMER_TOKEN_ESTIMATE,
  stripAgentsMdSection,
  stripClientContextDirective,
} from '../openclaw/clientContext';

// ---------------------------------------------------------------------------
// buildAgentsMdSection
// ---------------------------------------------------------------------------

describe('buildAgentsMdSection', () => {
  it('emits content bookended by managed markers', () => {
    const out = buildAgentsMdSection();
    expect(out.startsWith(AGENTS_MD_START)).toBe(true);
    expect(out.trimEnd().endsWith(AGENTS_MD_END)).toBe(true);
  });

  it('embeds the convention text body', () => {
    const out = buildAgentsMdSection();
    expect(out).toContain('ClawBoy iOS Client');
    expect(out).toContain('clawboy:options');
  });

  it('encodes the version into the start marker', () => {
    const out = buildAgentsMdSection();
    expect(out).toContain(`v${CONVENTION_VERSION}`);
  });
});

// ---------------------------------------------------------------------------
// stripAgentsMdSection
// ---------------------------------------------------------------------------

describe('stripAgentsMdSection', () => {
  it('returns empty string unchanged', () => {
    expect(stripAgentsMdSection('')).toBe('');
  });

  it('returns text without managed markers unchanged', () => {
    const text = '# My Agent\n\nThis is my own AGENTS.md content.\n';
    expect(stripAgentsMdSection(text)).toBe(text);
  });

  it('removes a managed block placed alone in a file', () => {
    const block = buildAgentsMdSection();
    expect(stripAgentsMdSection(block).replace(/\s/g, '')).toBe('');
  });

  it('removes a managed block while preserving surrounding user content', () => {
    const userBefore = '# My Custom Header\n\nUser line 1.\n';
    const userAfter = '\n\nUser line 2.\n';
    const combined = `${userBefore}${buildAgentsMdSection()}${userAfter}`;
    const stripped = stripAgentsMdSection(combined);
    expect(stripped.includes('clawboy:managed-')).toBe(false);
    expect(stripped).toContain('User line 1.');
    expect(stripped).toContain('User line 2.');
    expect(stripped).toContain('# My Custom Header');
  });

  it('removes multiple managed blocks (idempotent over duplicates)', () => {
    const dup = `${buildAgentsMdSection()}\n\n${buildAgentsMdSection()}\n`;
    const stripped = stripAgentsMdSection(dup);
    expect(stripped.includes('clawboy:managed-')).toBe(false);
  });

  it('is idempotent — running twice equals running once', () => {
    const text = `pre\n${buildAgentsMdSection()}\npost`;
    const a = stripAgentsMdSection(text);
    const b = stripAgentsMdSection(a);
    expect(b).toBe(a);
  });
});

// ---------------------------------------------------------------------------
// buildClientContextDirective
// ---------------------------------------------------------------------------

describe('buildClientContextDirective', () => {
  it('emits a single HTML comment', () => {
    const out = buildClientContextDirective();
    expect(out.startsWith('<!--')).toBe(true);
    expect(out.endsWith('-->')).toBe(true);
  });

  it('contains the convention text body', () => {
    const out = buildClientContextDirective();
    expect(out).toContain('ClawBoy iOS Client');
    expect(out).toContain('clawboy:options');
  });

  it('does not start with the agents.md marker (separate format)', () => {
    const out = buildClientContextDirective();
    expect(out.startsWith(AGENTS_MD_START)).toBe(false);
  });

  it('includes the versioned client-context tag', () => {
    const out = buildClientContextDirective();
    expect(out).toContain(`clawboy:client-context v${CONVENTION_VERSION}`);
  });
});

// ---------------------------------------------------------------------------
// stripClientContextDirective
// ---------------------------------------------------------------------------

describe('stripClientContextDirective', () => {
  it('returns text unchanged when no primer is present', () => {
    const text = 'Hello, world!';
    expect(stripClientContextDirective(text)).toBe(text);
  });

  it('strips a primer directive from the start of the message', () => {
    const primer = buildClientContextDirective();
    const userText = 'What is the weather like?';
    const composed = `${primer}\n\n${userText}`;
    expect(stripClientContextDirective(composed)).toBe(userText);
  });

  it('strips multiple primer directives if both somehow ended up present', () => {
    const composed = `${buildClientContextDirective()}\n\n${buildClientContextDirective()}\n\nHello`;
    expect(stripClientContextDirective(composed)).toBe('Hello');
  });

  it('is idempotent — running twice equals running once', () => {
    const composed = `${buildClientContextDirective()}\n\nHello`;
    const a = stripClientContextDirective(composed);
    const b = stripClientContextDirective(a);
    expect(b).toBe(a);
  });

  it('matches case-insensitively', () => {
    const upperPrimer =
      '<!-- CLAWBOY:CLIENT-CONTEXT v1\n' +
      'something\n' +
      '-->';
    const composed = `${upperPrimer}\n\nUser text`;
    expect(stripClientContextDirective(composed)).toBe('User text');
  });

  it('does not match unrelated HTML comments', () => {
    const text = '<!-- regular comment -->\nHello';
    expect(stripClientContextDirective(text)).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// roundtrip tests
// ---------------------------------------------------------------------------

describe('roundtrip', () => {
  it('agents.md install→uninstall preserves user content byte-for-byte', () => {
    const userContent = '# My header\n\nLine A\nLine B\n';
    // Simulate install: append managed section.
    const installed = `${userContent}\n${buildAgentsMdSection()}\n`;
    // Simulate uninstall: strip + tidy.
    const uninstalled = stripAgentsMdSection(installed)
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+$/, '\n');
    expect(uninstalled).toBe(userContent);
  });

  it('CLAWBOY_CONVENTION_TEXT uses placeholder syntax for the example directive', () => {
    // The convention text uses {OPEN}/{CLOSE} placeholders instead of literal
    // HTML comment chars, so models cannot copy the example verbatim and emit
    // an invalid bangless `<--` form.
    expect(CLAWBOY_CONVENTION_TEXT).toContain('{OPEN} clawboy:options');
    expect(CLAWBOY_CONVENTION_TEXT).toContain('{CLOSE}');
    expect(CLAWBOY_CONVENTION_TEXT).toContain('Substitute');
    // Must NOT contain the old bangless form that triggered the bug.
    expect(CLAWBOY_CONVENTION_TEXT).not.toContain('<-- clawboy:options');
    // Must NOT contain a contiguous --> sequence (would prematurely close the
    // per-session primer comment that wraps this text).
    expect(CLAWBOY_CONVENTION_TEXT).not.toContain('-->');
  });
});

// ---------------------------------------------------------------------------
// PRIMER_TOKEN_ESTIMATE
// ---------------------------------------------------------------------------

describe('PRIMER_TOKEN_ESTIMATE', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(PRIMER_TOKEN_ESTIMATE)).toBe(true);
    expect(PRIMER_TOKEN_ESTIMATE).toBeGreaterThan(0);
  });

  it('is a reasonable approximation of the primer length', () => {
    const primer = buildClientContextDirective();
    const heuristic = Math.round(primer.length / 4);
    expect(PRIMER_TOKEN_ESTIMATE).toBe(heuristic);
  });
});
