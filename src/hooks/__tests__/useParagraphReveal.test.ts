import { describe, it, expect } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';

import { splitParagraphs, useParagraphReveal } from '../useParagraphReveal';

describe('splitParagraphs', () => {
  it('returns empty array for empty input', () => {
    expect(splitParagraphs('')).toEqual([]);
  });

  it('returns single paragraph when no blank line', () => {
    expect(splitParagraphs('Hello world.')).toEqual(['Hello world.']);
  });

  it('splits on blank lines', () => {
    expect(splitParagraphs('a\n\nb\n\nc')).toEqual(['a', 'b', 'c']);
  });

  it('collapses runs of multiple blank lines', () => {
    expect(splitParagraphs('a\n\n\n\nb')).toEqual(['a', 'b']);
  });

  it('drops trailing empty paragraph when text ends with blank line', () => {
    // No consumer needs an empty trailing fade target.
    expect(splitParagraphs('a\n\n')).toEqual(['a']);
  });

  it('treats an unclosed code fence as a single trailing paragraph', () => {
    const text = 'intro\n\n```ts\nlet x =\n\n1;\n';
    expect(splitParagraphs(text)).toEqual(['intro', '```ts\nlet x =\n\n1;\n']);
  });

  it('keeps closed fenced blocks intact across blank lines', () => {
    const text = 'intro\n\n```ts\nlet x = 1;\n\nlet y = 2;\n```\n\nafter';
    expect(splitParagraphs(text)).toEqual([
      'intro',
      '```ts\nlet x = 1;\n\nlet y = 2;\n```',
      'after',
    ]);
  });

  it('does split on blank lines between closed fences', () => {
    const text = '```ts\na;\n```\n\n```ts\nb;\n```';
    expect(splitParagraphs(text)).toEqual(['```ts\na;\n```', '```ts\nb;\n```']);
  });

  it('handles tilde fences', () => {
    const text = 'intro\n\n~~~ts\na\n\nb\n~~~\n\nafter';
    expect(splitParagraphs(text)).toEqual([
      'intro',
      '~~~ts\na\n\nb\n~~~',
      'after',
    ]);
  });

  it('still splits non-code paragraphs', () => {
    const text = 'p1\n\np2\n\n```\ncode\n```\n\np3';
    expect(splitParagraphs(text)).toEqual(['p1', 'p2', '```\ncode\n```', 'p3']);
  });
});

describe('useParagraphReveal', () => {
  it('marks all paragraphs settled when not streaming', () => {
    const { result } = renderHook(() => useParagraphReveal('a\n\nb\n\nc', false));
    expect(result.current).toEqual([
      { index: 0, text: 'a', settled: true },
      { index: 1, text: 'b', settled: true },
      { index: 2, text: 'c', settled: true },
    ]);
  });

  it('marks only the last paragraph unsettled while streaming', () => {
    const { result } = renderHook(() => useParagraphReveal('a\n\nb\n\nc', true));
    expect(result.current).toEqual([
      { index: 0, text: 'a', settled: true },
      { index: 1, text: 'b', settled: true },
      { index: 2, text: 'c', settled: false },
    ]);
  });

  it('returns empty array for empty input', () => {
    const { result } = renderHook(() => useParagraphReveal('', true));
    expect(result.current).toEqual([]);
  });

  it('treats unclosed fence as one active paragraph while streaming', () => {
    const text = 'hello\n\n```ts\nlet x =';
    const { result } = renderHook(() => useParagraphReveal(text, true));
    expect(result.current).toEqual([
      { index: 0, text: 'hello', settled: true },
      { index: 1, text: '```ts\nlet x =', settled: false },
    ]);
  });
});
