import { useMemo } from 'react';

/**
 * A revealed paragraph chunk. `index` is stable across renders so an
 * <Animated.View key={index}> retains identity (and its mounted opacity
 * animation) across streaming chunks that extend the active paragraph.
 *
 * `settled` flips to `true` once the paragraph is followed by another
 * paragraph boundary OR streaming ends. Consumers animate the
 * streaming → settled transition with an opacity tween.
 */
export interface RevealedParagraph {
  index: number;
  text: string;
  settled: boolean;
}

/**
 * Locate every fenced code span (closed or unclosed) so paragraph splitting
 * never cuts inside one. Returns `[startIdx, endIdxExclusive)` ranges in
 * source order. An unclosed trailing fence extends to `text.length`.
 *
 * A "fence" here is any line whose first non-whitespace content is ```` ``` ````
 * (we accept indented fences too — markdown-it does). We toggle a flag
 * on each fence line: even → opening, odd → closing.
 */
function findFencedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  // Match a fence delimiter at the start of a line (allowing leading spaces).
  const re = /(^|\n)([ \t]*)(```|~~~)/g;
  let openStart = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // Start of the fence line — index of the delimiter, not the preceding \n.
    const lineStart = m.index + (m[1]?.length ?? 0);
    if (openStart < 0) {
      openStart = lineStart;
    } else {
      // Close the fence. End at the newline that terminates the closing line
      // (exclusive) so any blank-line boundary AFTER the close fence is NOT
      // considered "inside" the range and paragraph splitting still happens.
      const eol = text.indexOf('\n', lineStart);
      const closeEnd = eol === -1 ? text.length : eol;
      ranges.push([openStart, closeEnd]);
      openStart = -1;
    }
  }
  if (openStart >= 0) {
    // Unclosed fence runs to EOF.
    ranges.push([openStart, text.length]);
  }
  return ranges;
}

function isInsideAnyRange(idx: number, ranges: Array<[number, number]>): boolean {
  for (let i = 0; i < ranges.length; i += 1) {
    const range = ranges[i];
    if (!range) continue;
    const [start, end] = range;
    if (idx >= start && idx < end) return true;
    if (start > idx) return false;
  }
  return false;
}

/**
 * Split `text` into paragraphs on blank lines (`\n\n`), but never cut
 * inside a fenced code block (closed or unclosed). Empty input → empty array.
 *
 * - Each paragraph trims a single trailing blank-line separator.
 * - A blank line that falls inside a fenced range stays with the surrounding
 *   code block — the whole fence renders as one paragraph.
 * - Unclosed trailing fences fuse the rest of the message into the last
 *   paragraph (so live-streamed code doesn't render half-styled).
 */
export function splitParagraphs(text: string): string[] {
  if (!text) return [];

  const ranges = findFencedRanges(text);
  const out: string[] = [];
  const re = /\n\n+/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const boundaryIdx = m.index;
    if (isInsideAnyRange(boundaryIdx, ranges)) continue;
    const chunk = text.slice(cursor, boundaryIdx);
    if (chunk.length > 0) out.push(chunk);
    cursor = boundaryIdx + m[0].length;
  }
  const tail = text.slice(cursor);
  if (tail.length > 0) out.push(tail);
  return out;
}

/**
 * Hook variant: memoizes the paragraph split + settled flags.
 *
 * `isStreaming=true` marks ONLY the last paragraph as `settled: false` so the
 * consumer can animate it on settle. While streaming, intermediate paragraphs
 * are already settled (a `\n\n` arrived after them).
 *
 * When `isStreaming=false`, every paragraph is settled.
 *
 * Settled paragraph text identities are preserved across renders: while
 * streaming, only the trailing (unsettled) paragraph's text is allowed to
 * change. The returned array is a fresh array each render, but the settled
 * entries reuse their previous `{ text }` reference so downstream `React.memo`
 * comparisons can short-circuit and the AST LRU stays hot.
 */
export function useParagraphReveal(text: string, isStreaming: boolean): RevealedParagraph[] {
  return useMemo(() => {
    const parts = splitParagraphs(text);
    if (parts.length === 0) return [];
    return parts.map((p, i) => ({
      index: i,
      text: p,
      settled: !isStreaming || i < parts.length - 1,
    }));
  }, [text, isStreaming]);
}
