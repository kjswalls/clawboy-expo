import {
  composeAnnotatedReply,
  sortAnnotationsByDocumentOrder,
  stripInlineMarkdown,
  type Annotation,
  type ComposeOptions,
} from '../annotations';

function makeAnnotation(overrides: Partial<Annotation> & Pick<Annotation, 'anchor' | 'quotedText'>): Annotation {
  return {
    id: Math.random().toString(36).slice(2),
    messageId: 'msg-1',
    comment: '',
    createdAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// stripInlineMarkdown
// ---------------------------------------------------------------------------

describe('stripInlineMarkdown', () => {
  it('removes ATX heading markers', () => {
    expect(stripInlineMarkdown('### My Heading')).toBe('My Heading');
    expect(stripInlineMarkdown('# H1\n## H2')).toBe('H1\nH2');
  });

  it('removes bold markers', () => {
    expect(stripInlineMarkdown('**Bold text**')).toBe('Bold text');
    expect(stripInlineMarkdown('__Also bold__')).toBe('Also bold');
  });

  it('removes italic markers', () => {
    expect(stripInlineMarkdown('*italic*')).toBe('italic');
    expect(stripInlineMarkdown('_also italic_')).toBe('also italic');
  });

  it('removes bold+italic', () => {
    expect(stripInlineMarkdown('***bold italic***')).toBe('bold italic');
  });

  it('removes inline code backticks', () => {
    expect(stripInlineMarkdown('use `npm install` to install')).toBe('use npm install to install');
  });

  it('removes link syntax, keeps text', () => {
    expect(stripInlineMarkdown('[link text](https://example.com)')).toBe('link text');
  });

  it('removes image syntax, keeps alt', () => {
    expect(stripInlineMarkdown('![alt text](https://example.com/img.png)')).toBe('alt text');
  });

  it('removes blockquote markers', () => {
    expect(stripInlineMarkdown('> quoted')).toBe('quoted');
  });

  it('removes list markers', () => {
    expect(stripInlineMarkdown('- item one\n* item two\n+ item three')).toBe('item one\nitem two\nitem three');
    expect(stripInlineMarkdown('1. first\n2. second')).toBe('first\nsecond');
  });

  it('preserves emojis', () => {
    expect(stripInlineMarkdown('🥇 First Words')).toBe('🥇 First Words');
    expect(stripInlineMarkdown('**🏆 Winner**')).toBe('🏆 Winner');
  });

  it('handles mixed markdown and emojis', () => {
    expect(stripInlineMarkdown('### **Bold** _Heading_ 🎉')).toBe('Bold Heading 🎉');
  });

  it('returns plain text unchanged', () => {
    expect(stripInlineMarkdown('Just plain text here')).toBe('Just plain text here');
  });

  it('removes strikethrough', () => {
    expect(stripInlineMarkdown('~~deleted~~')).toBe('deleted');
  });
});

// ---------------------------------------------------------------------------
// sortAnnotationsByDocumentOrder
// ---------------------------------------------------------------------------

describe('sortAnnotationsByDocumentOrder', () => {
  it('sorts block annotations by blockIndex ascending', () => {
    const a2 = makeAnnotation({ anchor: { kind: 'block', blockIndex: 2 }, quotedText: 'B' });
    const a0 = makeAnnotation({ anchor: { kind: 'block', blockIndex: 0 }, quotedText: 'A' });
    const a1 = makeAnnotation({ anchor: { kind: 'block', blockIndex: 1 }, quotedText: 'C' });
    const sorted = sortAnnotationsByDocumentOrder([a2, a0, a1]);
    expect(sorted.map((a) => a.quotedText)).toEqual(['A', 'C', 'B']);
  });

  it('sorts range annotations by start position ascending', () => {
    const r50 = makeAnnotation({ anchor: { kind: 'range', start: 50, end: 60 }, quotedText: 'mid' });
    const r10 = makeAnnotation({ anchor: { kind: 'range', start: 10, end: 20 }, quotedText: 'early' });
    const sorted = sortAnnotationsByDocumentOrder([r50, r10]);
    expect(sorted.map((a) => a.quotedText)).toEqual(['early', 'mid']);
  });

  it('does not mutate input array', () => {
    const input = [
      makeAnnotation({ anchor: { kind: 'block', blockIndex: 2 }, quotedText: 'B' }),
      makeAnnotation({ anchor: { kind: 'block', blockIndex: 0 }, quotedText: 'A' }),
    ];
    const original = [...input];
    sortAnnotationsByDocumentOrder(input);
    expect(input[0].quotedText).toBe(original[0].quotedText);
  });

  it('is stable when positions are equal', () => {
    const a = makeAnnotation({ anchor: { kind: 'block', blockIndex: 1 }, quotedText: 'first' });
    const b = makeAnnotation({ anchor: { kind: 'block', blockIndex: 1 }, quotedText: 'second' });
    const sorted = sortAnnotationsByDocumentOrder([a, b]);
    // Relative order preserved when equal
    expect(sorted[0].quotedText).toBe('first');
  });

  it('with messageOrder: earlier message comes first regardless of block index', () => {
    // msg-A is earlier (index 0), msg-B is later (index 1).
    // Annotation on msg-A is block 5, annotation on msg-B is block 0 —
    // without messageOrder block-0 would sort first (wrong).
    const late = makeAnnotation({
      messageId: 'msg-B',
      anchor: { kind: 'block', blockIndex: 0 },
      quotedText: 'newer message',
    });
    const early = makeAnnotation({
      messageId: 'msg-A',
      anchor: { kind: 'block', blockIndex: 5 },
      quotedText: 'older message',
    });
    const order = new Map([['msg-A', 0], ['msg-B', 1]]);
    const sorted = sortAnnotationsByDocumentOrder([late, early], order);
    expect(sorted.map((a) => a.quotedText)).toEqual(['older message', 'newer message']);
  });

  it('with messageOrder: same message sorted by anchor position', () => {
    const b3 = makeAnnotation({ messageId: 'msg-1', anchor: { kind: 'block', blockIndex: 3 }, quotedText: 'block 3' });
    const b1 = makeAnnotation({ messageId: 'msg-1', anchor: { kind: 'block', blockIndex: 1 }, quotedText: 'block 1' });
    const order = new Map([['msg-1', 0]]);
    const sorted = sortAnnotationsByDocumentOrder([b3, b1], order);
    expect(sorted.map((a) => a.quotedText)).toEqual(['block 1', 'block 3']);
  });

  it('with messageOrder: unknown messageId sorts last', () => {
    const known = makeAnnotation({ messageId: 'msg-1', anchor: { kind: 'block', blockIndex: 0 }, quotedText: 'known' });
    const unknown = makeAnnotation({ messageId: 'ghost', anchor: { kind: 'block', blockIndex: 0 }, quotedText: 'ghost' });
    const order = new Map([['msg-1', 0]]);
    const sorted = sortAnnotationsByDocumentOrder([unknown, known], order);
    expect(sorted[0].quotedText).toBe('known');
    expect(sorted[1].quotedText).toBe('ghost');
  });
});

// ---------------------------------------------------------------------------
// composeAnnotatedReply
// ---------------------------------------------------------------------------

describe('composeAnnotatedReply', () => {
  it('returns empty string when prelude empty and no annotations', () => {
    expect(composeAnnotatedReply('', [])).toBe('');
  });

  it('returns just prelude when no annotations', () => {
    expect(composeAnnotatedReply('Hello', [])).toBe('Hello');
  });

  it('returns just blockquote when prelude empty and one annotation with no comment', () => {
    const a = makeAnnotation({
      anchor: { kind: 'block', blockIndex: 0 },
      quotedText: 'Some text',
      comment: '',
    });
    expect(composeAnnotatedReply('', [a])).toBe('> Some text');
  });

  it('formats prelude + quote + comment', () => {
    const a = makeAnnotation({
      anchor: { kind: 'block', blockIndex: 0 },
      quotedText: 'The quoted part',
      comment: 'My comment here',
    });
    const result = composeAnnotatedReply('Also generally:', [a]);
    expect(result).toBe('Also generally:\n\n> The quoted part\n\nMy comment here');
  });

  it('prefixes every line of multiline quote with >', () => {
    const a = makeAnnotation({
      anchor: { kind: 'block', blockIndex: 0 },
      quotedText: 'Line one\nLine two\nLine three',
      comment: 'Note',
    });
    const result = composeAnnotatedReply('', [a]);
    expect(result).toBe('> Line one\n> Line two\n> Line three\n\nNote');
  });

  it('emits annotations in document order, not creation order', () => {
    const late = makeAnnotation({
      anchor: { kind: 'block', blockIndex: 3 },
      quotedText: 'Later section',
      comment: 'comment B',
    });
    const early = makeAnnotation({
      anchor: { kind: 'block', blockIndex: 0 },
      quotedText: 'Earlier section',
      comment: 'comment A',
    });
    // Created in wrong order
    const result = composeAnnotatedReply('', [late, early]);
    const lines = result.split('\n\n');
    expect(lines[0]).toBe('> Earlier section');
    expect(lines[1]).toBe('comment A');
    expect(lines[2]).toBe('> Later section');
    expect(lines[3]).toBe('comment B');
  });

  it('skips annotations with empty/whitespace quotedText', () => {
    const empty = makeAnnotation({
      anchor: { kind: 'block', blockIndex: 0 },
      quotedText: '   ',
      comment: 'should not appear',
    });
    const valid = makeAnnotation({
      anchor: { kind: 'block', blockIndex: 1 },
      quotedText: 'Real content',
      comment: 'real comment',
    });
    const result = composeAnnotatedReply('', [empty, valid]);
    expect(result).toBe('> Real content\n\nreal comment');
  });

  it('trims prelude whitespace', () => {
    const result = composeAnnotatedReply('  hello  ', []);
    expect(result).toBe('hello');
  });

  it('handles two annotations with no prelude', () => {
    const a = makeAnnotation({ anchor: { kind: 'block', blockIndex: 0 }, quotedText: 'Q1', comment: 'C1' });
    const b = makeAnnotation({ anchor: { kind: 'block', blockIndex: 1 }, quotedText: 'Q2', comment: 'C2' });
    const result = composeAnnotatedReply('', [a, b]);
    expect(result).toBe('> Q1\n\nC1\n\n> Q2\n\nC2');
  });
});

// ---------------------------------------------------------------------------
// composeAnnotatedReply — hybrid format (with messagesById)
// ---------------------------------------------------------------------------

describe('composeAnnotatedReply hybrid format', () => {
  // Helper to build a ComposeOptions map
  function opts(entries: [string, string][]): ComposeOptions {
    return { messagesById: new Map(entries) };
  }

  it('uses heading reference when block has a heading', () => {
    // Message with a heading section
    const content = '## Setup steps\n\nRun npm install in the root directory.';
    const a = makeAnnotation({
      messageId: 'msg-1',
      anchor: { kind: 'block', blockIndex: 0 },
      quotedText: 'Run npm install in the root directory.',
      comment: 'This fails on M1',
    });
    const result = composeAnnotatedReply('', [a], opts([['msg-1', content]]));
    // Should contain the heading reference
    expect(result).toContain('Re: "Setup steps"');
    expect(result).toContain('This fails on M1');
    // Should NOT use blockquote syntax
    expect(result).not.toContain('> Run npm install');
  });

  it('uses snippet reference when block has no heading', () => {
    const content = 'This is a plain paragraph without any heading.';
    const a = makeAnnotation({
      messageId: 'msg-1',
      anchor: { kind: 'block', blockIndex: 0 },
      quotedText: 'plain paragraph without any heading',
      comment: 'OK',
    });
    const result = composeAnnotatedReply('', [a], opts([['msg-1', content]]));
    expect(result).toContain('Re: "plain paragraph');
    expect(result).toContain('OK');
    expect(result).not.toContain('>');
  });

  it('truncates long snippets to 60 chars + ellipsis', () => {
    const longText = 'A'.repeat(80);
    const content = longText;
    const a = makeAnnotation({
      messageId: 'msg-1',
      anchor: { kind: 'block', blockIndex: 0 },
      quotedText: longText,
      comment: 'noted',
    });
    const result = composeAnnotatedReply('', [a], opts([['msg-1', content]]));
    // Snippet inside Re: "..." should be ≤60 chars + ellipsis
    const match = result.match(/Re: "([^"]+)"/);
    expect(match).not.toBeNull();
    const snippet = match![1];
    expect(snippet.length).toBeLessThanOrEqual(60);
    expect(snippet.endsWith('…')).toBe(true);
  });

  it('falls back to blockquote when messageId not in map', () => {
    const a = makeAnnotation({
      messageId: 'missing-id',
      anchor: { kind: 'block', blockIndex: 0 },
      quotedText: 'Some text',
      comment: 'comment',
    });
    // Map does not contain 'missing-id'
    const result = composeAnnotatedReply('', [a], opts([['other-id', 'irrelevant']]));
    expect(result).toContain('> Some text');
    expect(result).toContain('comment');
  });

  it('falls back to blockquote when no opts provided', () => {
    const a = makeAnnotation({
      anchor: { kind: 'block', blockIndex: 0 },
      quotedText: 'some text',
      comment: 'note',
    });
    const result = composeAnnotatedReply('', [a]);
    expect(result).toBe('> some text\n\nnote');
  });

  it('handles prelude + hybrid annotations', () => {
    const content = '## Intro\n\nHello world.';
    const a = makeAnnotation({
      messageId: 'msg-1',
      anchor: { kind: 'block', blockIndex: 0 },
      quotedText: 'Hello world.',
      comment: 'Great',
    });
    const result = composeAnnotatedReply('General feedback:', [a], opts([['msg-1', content]]));
    expect(result.startsWith('General feedback:')).toBe(true);
    expect(result).toContain('Re: "Intro"');
    expect(result).toContain('Great');
  });

  it('emits multiple hybrid annotations in document order', () => {
    const content = '## First\n\nParagraph one.\n\n## Second\n\nParagraph two.';
    const b = makeAnnotation({
      messageId: 'msg-1',
      anchor: { kind: 'block', blockIndex: 1 },
      quotedText: 'Paragraph two.',
      comment: 'comment B',
    });
    const a = makeAnnotation({
      messageId: 'msg-1',
      anchor: { kind: 'block', blockIndex: 0 },
      quotedText: 'Paragraph one.',
      comment: 'comment A',
    });
    // Created in reverse order — should still emit A before B
    const result = composeAnnotatedReply('', [b, a], opts([['msg-1', content]]));
    const idxA = result.indexOf('comment A');
    const idxB = result.indexOf('comment B');
    expect(idxA).toBeLessThan(idxB);
  });

  it('range annotation uses snippet when section has no heading', () => {
    const content = 'The quick brown fox jumps over the lazy dog.';
    const a = makeAnnotation({
      messageId: 'msg-1',
      anchor: { kind: 'range', start: 4, end: 19 },
      quotedText: 'quick brown fox',
      comment: 'nice',
    });
    const result = composeAnnotatedReply('', [a], opts([['msg-1', content]]));
    expect(result).toContain('Re: "quick brown fox"');
    expect(result).toContain('nice');
  });

  it('annotation with no comment emits only the reference header', () => {
    const content = '## Notes\n\nSome notes here.';
    const a = makeAnnotation({
      messageId: 'msg-1',
      anchor: { kind: 'block', blockIndex: 0 },
      quotedText: 'Some notes here.',
      comment: '',
    });
    const result = composeAnnotatedReply('', [a], opts([['msg-1', content]]));
    expect(result).toContain('Re: "Notes"');
    // No trailing newline from empty comment
    expect(result.trim()).toBe(result.trim().split('\n\n')[0].trim());
  });
});
