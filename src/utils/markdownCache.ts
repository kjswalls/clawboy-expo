/**
 * Module-level LRU cache for parsed markdown ASTs.
 *
 * Why this exists:
 * `@ronradtke/react-native-markdown-display` runs the full markdown-it parse
 * + cleanup pipeline INSIDE its render path on every component mount. When a
 * FlatList recycles cells (user scrolls past windowSize and back), bubbles
 * unmount and remount, paying the parse cost again. For long histories with
 * many tool-heavy / code-heavy assistant messages this is the dominant
 * cell-mount cost and the primary source of scroll jank.
 *
 * How it works:
 * The library's exported `parser(source, renderer, markdownit)` short-circuits
 * when `source` is an array — it skips parsing and immediately calls
 * `renderer(source)`. We exploit this by:
 *
 *   1. Calling `parser(content, identity, markdownit)` once per unique content
 *      string. The identity renderer just returns the AST untouched, so we
 *      capture the post-cleanup AST array.
 *   2. Caching the AST array at module scope keyed on the content string.
 *   3. Passing the cached AST as `children` to <Markdown> on subsequent
 *      mounts. The library sees an array, skips parsing, and goes straight
 *      to rendering React elements.
 *
 * This is purely an optimization — same input → same output. Streaming text
 * (where content changes per frame) bypasses the cache via the `cacheable`
 * gate in the consumer. Non-streaming history bubbles, and the stable-prefix
 * portion of a streaming bubble (which only changes at paragraph boundaries),
 * use the cache.
 *
 * The keyset is bounded with a simple LRU eviction so a long session with
 * many distinct messages doesn't grow without bound.
 */

import * as MarkdownLib from '@ronradtke/react-native-markdown-display';
import type MarkdownIt from 'markdown-it';

type AstNode = unknown;

const MAX_ENTRIES = 64;
const cache = new Map<string, AstNode[]>();

const identityRenderer = <T>(ast: T): T => ast;

type ParserFn = (
  source: string,
  renderer: (nodes: AstNode[]) => AstNode[],
  markdownit: MarkdownIt,
) => unknown;

const libParser: ParserFn | undefined =
  typeof (MarkdownLib as { parser?: unknown }).parser === 'function'
    ? ((MarkdownLib as { parser: ParserFn }).parser)
    : undefined;

/**
 * Returns the cached AST array for `content`, or builds and caches it.
 * Returns null when caching is unavailable (e.g. in jest tests where the
 * library is mocked) so callers can fall back to passing the raw string.
 */
export function getCachedMarkdownAst(
  content: string,
  markdownit: MarkdownIt,
): AstNode[] | null {
  if (!libParser) return null;

  const existing = cache.get(content);
  if (existing) {
    cache.delete(content);
    cache.set(content, existing);
    return existing;
  }

  let ast: unknown;
  try {
    ast = libParser(content, identityRenderer, markdownit);
  } catch {
    return null;
  }
  if (!Array.isArray(ast)) return null;

  cache.set(content, ast);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return ast;
}

/** Test-only utility: clears the AST cache between specs. */
export function __resetMarkdownAstCacheForTests(): void {
  cache.clear();
}
