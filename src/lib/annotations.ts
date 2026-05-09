/**
 * Annotation types and helpers for the multi-point annotation reply feature.
 *
 * An annotation attaches a user comment to a specific span of an assistant
 * message. Anchors are either a whole markdown block (by index from
 * splitMessageIntoBlocks) or an arbitrary character range within the raw
 * content string.
 *
 * Multiple annotations are composed into a single reply in document order.
 * When `ComposeOptions.messagesById` is provided the output uses a compact
 * hybrid reference format instead of verbatim blockquotes:
 *
 *   Re: "Section heading" — "first 60 chars of quoted text…":
 *   user comment
 *
 * This keeps the gateway message short while preserving enough context for
 * the model to locate the passage.
 */

import { splitMessageIntoBlocks } from './messageBlocks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnnotationAnchor =
  | { kind: 'block'; blockIndex: number }
  | { kind: 'range'; start: number; end: number };

export interface Annotation {
  id: string;
  messageId: string;
  anchor: AnnotationAnchor;
  /** Exact text span from the message that the user is commenting on. */
  quotedText: string;
  /** User's comment on the quoted span. May be empty while drafting. */
  comment: string;
  createdAt: number;
}

export interface ComposeOptions {
  /**
   * Map of messageId → original assistant message content. When provided,
   * composeAnnotatedReply resolves section headings from the message blocks
   * and emits a token-light hybrid reference header instead of a full
   * blockquote. Falls back to truncated snippet when a block cannot be found.
   */
  messagesById: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Document-order sort
// ---------------------------------------------------------------------------

/** Compare two anchors by document position (block index or range start). */
function anchorPosition(anchor: AnnotationAnchor): number {
  if (anchor.kind === 'block') {
    // Block index * large stride so block annotations stay before any range
    // annotation that happens to have a start inside that block.
    return anchor.blockIndex * 1_000_000;
  }
  return anchor.start;
}

/**
 * Sort annotations in chat document order.
 *
 * When `messageOrder` is provided the primary sort key is the position of each
 * annotation's `messageId` in that map (lower index = earlier in chat). The
 * anchor position is used as the secondary key to order multiple annotations
 * within the same message.
 *
 * Without `messageOrder` (legacy / single-message) the sort is by anchor
 * position only, preserving previous behaviour.
 */
export function sortAnnotationsByDocumentOrder(
  annotations: Annotation[],
  messageOrder?: Map<string, number>,
): Annotation[] {
  return [...annotations].sort((a, b) => {
    if (messageOrder) {
      const msgA = messageOrder.get(a.messageId) ?? Infinity;
      const msgB = messageOrder.get(b.messageId) ?? Infinity;
      if (msgA !== msgB) return msgA - msgB;
    }
    return anchorPosition(a.anchor) - anchorPosition(b.anchor);
  });
}

// ---------------------------------------------------------------------------
// Hybrid reference header helpers
// ---------------------------------------------------------------------------

const SNIPPET_MAX = 60;

/**
 * Strip common inline-markdown syntax from text, preserving plain text and
 * emojis. Used to clean up quoted snippets for the compact "Re:" header so
 * heading marks, bold, italic etc. don't leak into the preview UI.
 */
export function stripInlineMarkdown(text: string): string {
  return text
    // Remove images before links so ![alt](url) → alt
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Remove links [text](url) → text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Remove ATX heading markers at line start
    .replace(/^#{1,6}\s+/gm, '')
    // Remove blockquote markers at line start
    .replace(/^>\s*/gm, '')
    // Remove list markers at line start
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    // Remove bold+italic *** / ___
    .replace(/\*{3}([^*]+)\*{3}/g, '$1')
    .replace(/_{3}([^_]+)_{3}/g, '$1')
    // Remove bold ** / __
    .replace(/\*{2}([^*]+)\*{2}/g, '$1')
    .replace(/_{2}([^_]+)_{2}/g, '$1')
    // Remove italic * / _  (single, non-greedy, not crossing word boundary aggressively)
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    // Remove inline code backticks
    .replace(/`([^`]+)`/g, '$1')
    // Remove strikethrough ~~
    .replace(/~~([^~]+)~~/g, '$1');
}

function makeSnippet(text: string): string {
  const stripped = stripInlineMarkdown(text);
  const flat = stripped.replace(/\s+/g, ' ').trim();
  if (flat.length <= SNIPPET_MAX) return flat;
  return `${flat.slice(0, SNIPPET_MAX - 1)}…`;
}

/**
 * Build a compact "Re: …" reference header for one annotation.
 *
 * Priority:
 *  1. heading + snippet  → Re: "Heading" — "snippet…":
 *  2. heading only       → Re: "Heading":
 *  3. snippet only       → Re: "snippet…":
 */
export function buildReferenceHeader(annotation: Annotation, messagesById: Map<string, string>): string | null {
  const content = messagesById.get(annotation.messageId);
  if (!content) return null;

  const blocks = splitMessageIntoBlocks(content);

  let rawHeadingText: string | undefined;

  if (annotation.anchor.kind === 'block') {
    rawHeadingText = blocks[annotation.anchor.blockIndex]?.headingText;
  } else {
    // Range: find the block that contains the range start.
    const block = blocks.find(
      (b) =>
        annotation.anchor.kind === 'range' &&
        annotation.anchor.start >= b.sourceStart &&
        annotation.anchor.start < b.sourceEnd,
    );
    rawHeadingText = block?.headingText;
  }

  const headingText = rawHeadingText ? stripInlineMarkdown(rawHeadingText).replace(/\s+/g, ' ').trim() : undefined;
  const snippet = annotation.quotedText.trim() ? makeSnippet(annotation.quotedText) : null;

  if (headingText && snippet) {
    return `Re: "${headingText}" — "${snippet}":`;
  }
  if (headingText) {
    return `Re: "${headingText}":`;
  }
  if (snippet) {
    return `Re: "${snippet}":`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reply composition
// ---------------------------------------------------------------------------

/**
 * Compose a single gateway message from an optional free-text prelude plus
 * one or more annotations.
 *
 * Without `opts.messagesById` (legacy / fallback):
 *
 *   [prelude]
 *
 *   > quoted span 1
 *
 *   comment 1
 *
 * With `opts.messagesById` (hybrid compact format):
 *
 *   [prelude]
 *
 *   Re: "Section heading" — "first 60 chars…":
 *   comment 1
 *
 *   Re: "another snippet…":
 *   comment 2
 *
 * Annotations are emitted in document order regardless of creation order.
 */
export function composeAnnotatedReply(
  prelude: string,
  annotations: Annotation[],
  opts?: ComposeOptions,
): string {
  const ordered = sortAnnotationsByDocumentOrder(annotations);
  const parts: string[] = [];

  const trimmedPrelude = prelude.trim();
  if (trimmedPrelude) parts.push(trimmedPrelude);

  for (const a of ordered) {
    if (!a.quotedText.trim()) continue;

    if (opts?.messagesById) {
      const header = buildReferenceHeader(a, opts.messagesById);
      const trimmedComment = a.comment.trim();
      if (header) {
        // Compact format: reference header + comment on next line (or alone).
        parts.push(trimmedComment ? `${header}\n${trimmedComment}` : header);
        continue;
      }
      // Block/range lookup failed — fall through to legacy blockquote.
    }

    // Legacy: verbatim blockquote
    const quoted = a.quotedText
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    parts.push(quoted);
    const trimmedComment = a.comment.trim();
    if (trimmedComment) parts.push(trimmedComment);
  }

  return parts.join('\n\n');
}
