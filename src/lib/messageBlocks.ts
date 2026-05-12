/**
 * Splits an assistant message's raw markdown content into logical sections
 * suitable for annotation anchoring.
 *
 * Dispatch logic:
 *   - If the message has ANY heading_open tokens → heading-primary split:
 *       One section per heading; everything between heading N and heading N+1
 *       belongs to the same section regardless of fences, hrs, or blank gaps.
 *       Content before the first heading (if any) becomes section 0.
 *   - Otherwise (no headings) → rule-based split (original behaviour):
 *       Sections split on hr, double-blank-line gaps, and fence→prose transitions.
 *
 * Each `MessageBlock` carries:
 *   - `index`          — zero-based section index (Annotation anchor blockIndex)
 *   - `type`           — semantic type for the section
 *   - `sourceStart`    — char offset where the section begins in `content`
 *   - `sourceEnd`      — char offset where the section ends (exclusive)
 *   - `raw`            — exact substring for quoting
 *   - `preview`        — truncated plain-text preview (≤120 chars)
 *   - `headingText`    — heading text (no #s) when section starts with heading
 *   - `componentTypes` — distinct child block types contained in the section
 */

import { chatMarkdownIt } from '@/utils/markdownTheme';

export type MessageBlockType =
  | 'heading'  // section opens with a heading token
  | 'prose'    // paragraphs / lists / blockquotes only
  | 'code'     // ends with a fenced code block (with or without leading prose)
  | 'mixed';   // anything else

export interface MessageBlock {
  index: number;
  type: MessageBlockType;
  sourceStart: number;
  sourceEnd: number;
  /** Exact substring of the original content string (preserves inner whitespace). */
  raw: string;
  /** Short plain-text preview (≤120 chars, single line). */
  preview: string;
  /** Heading text stripped of # markers, set when section starts with a heading. */
  headingText?: string;
  /** Distinct child block types contained in this section (e.g. ['paragraph', 'fence']). */
  componentTypes: string[];
}

// ---------------------------------------------------------------------------
// Internal representation while building sections
// ---------------------------------------------------------------------------

interface TokenSlice {
  openType: string;   // token.type of the opener (e.g. 'paragraph_open', 'fence')
  lineStart: number;
  lineEnd: number;
  /** For headings: extracted text content. */
  headingText?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PREVIEW_MAX = 120;

// Block openers that, when preceded by a fence in the same section, force a new section.
const PROSE_OPENERS = new Set([
  'paragraph_open',
  'bullet_list_open',
  'ordered_list_open',
  'blockquote_open',
]);

const SELF_CLOSING = new Set(['fence', 'hr', 'html_block', 'code_block']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripMarkdownSyntax(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ''))
    .replace(/!\[.*?\]\(.*?\)/g, '[image]')
    .replace(/\[(.+?)\]\(.*?\)/g, '$1')
    .replace(/^[>\-*+] /gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function makePreview(raw: string): string {
  const stripped = stripMarkdownSyntax(raw);
  if (stripped.length <= PREVIEW_MAX) return stripped;
  return `${stripped.slice(0, PREVIEW_MAX - 1)}…`;
}

function inferSectionType(slices: TokenSlice[]): MessageBlockType {
  if (slices.length === 0) return 'mixed';
  const first = slices[0];
  if (first === undefined) return 'mixed';
  if (first.openType === 'heading_open') return 'heading';
  const hasFence = slices.some((s) => s.openType === 'fence' || s.openType === 'code_block');
  if (hasFence) return 'code';
  const hasProseOnly = slices.every(
    (s) =>
      s.openType === 'paragraph_open' ||
      s.openType === 'bullet_list_open' ||
      s.openType === 'ordered_list_open' ||
      s.openType === 'blockquote_open' ||
      s.openType === 'heading_open' ||
      s.openType === 'html_block',
  );
  if (hasProseOnly) return 'prose';
  return 'mixed';
}

function componentTypesFrom(slices: TokenSlice[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of slices) {
    const label = mapOpenTypeToLabel(s.openType);
    if (!seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out;
}

function mapOpenTypeToLabel(openType: string): string {
  switch (openType) {
    case 'paragraph_open':     return 'paragraph';
    case 'heading_open':       return 'heading';
    case 'fence':
    case 'code_block':         return 'fence';
    case 'bullet_list_open':
    case 'ordered_list_open':  return 'list';
    case 'blockquote_open':    return 'blockquote';
    case 'hr':                 return 'hr';
    case 'html_block':         return 'html';
    default:                   return openType;
  }
}

/**
 * Convert markdown-it line numbers [lineStart, lineEnd) to character offsets.
 * lineEnd is exclusive (first line AFTER the block).
 */
function lineRangeToCharRange(
  content: string,
  lineStart: number,
  lineEnd: number,
): [number, number] {
  const lines = content.split('\n');
  let charStart = 0;
  for (let i = 0; i < lineStart; i++) {
    charStart += (lines[i]?.length ?? 0) + 1;
  }
  let charEnd = charStart;
  for (let i = lineStart; i < Math.min(lineEnd, lines.length); i++) {
    charEnd += (lines[i]?.length ?? 0) + 1;
  }
  charEnd = Math.min(charEnd, content.length);
  return [charStart, charEnd];
}

/** Extract inline text from inline tokens following a heading_open. */
function extractHeadingText(tokens: ReturnType<typeof chatMarkdownIt.parse>, afterIdx: number): string {
  const inline = tokens[afterIdx + 1];
  if (inline?.type !== 'inline' || !inline.children) return '';
  return inline.children
    .filter((c) => c.type === 'text' || c.type === 'softbreak' || c.type === 'code_inline')
    .map((c) => (c.type === 'softbreak' ? ' ' : c.content))
    .join('');
}

// ---------------------------------------------------------------------------
// Section accumulator
// ---------------------------------------------------------------------------

interface Section {
  slices: TokenSlice[];
  lineStart: number;
  lineEnd: number;
}

function flushSection(
  content: string,
  section: Section,
  blockIndex: number,
): MessageBlock | null {
  if (section.slices.length === 0) return null;

  const [sourceStart, sourceEnd] = lineRangeToCharRange(
    content,
    section.lineStart,
    section.lineEnd,
  );
  const raw = content.slice(sourceStart, sourceEnd).replace(/\n+$/, '');
  if (!raw.trim()) return null;

  const type = inferSectionType(section.slices);
  const componentTypes = componentTypesFrom(section.slices);

  const headingSlice = section.slices[0]?.openType === 'heading_open' ? section.slices[0] : undefined;
  const headingText = headingSlice?.headingText || undefined;

  return {
    index: blockIndex,
    type,
    sourceStart,
    sourceEnd: Math.min(sourceEnd, content.length),
    raw,
    preview: makePreview(raw),
    headingText,
    componentTypes,
  };
}

// ---------------------------------------------------------------------------
// Heading-primary splitter (used when message has at least one heading)
// ---------------------------------------------------------------------------

/**
 * Split by heading boundaries only. Every heading_open starts a new section.
 * Content before the first heading (if any) forms section 0.
 * Fences, hrs, and blank-line gaps do NOT split within a heading section.
 */
function splitByHeadingsPrimary(
  content: string,
  tokens: ReturnType<typeof chatMarkdownIt.parse>,
): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let current: Section = { slices: [], lineStart: 0, lineEnd: 0 };
  let prevLineEnd = 0;
  let blockIndex = 0;

  function flush(): void {
    const block = flushSection(content, current, blockIndex);
    if (block) {
      blocks.push(block);
      blockIndex++;
    }
    current = { slices: [], lineStart: 0, lineEnd: 0 };
    prevLineEnd = 0;
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    const isOpen = token.type.endsWith('_open') || SELF_CLOSING.has(token.type);
    if (!isOpen) continue;

    // Skip hr — don't split on it in heading-primary mode
    if (token.type === 'hr') continue;

    // Resolve line range for this token
    let lineStart: number;
    let lineEnd: number;

    if (SELF_CLOSING.has(token.type)) {
      if (token.map) {
        [lineStart, lineEnd] = token.map;
      } else {
        lineStart = prevLineEnd;
        lineEnd = prevLineEnd + 1;
      }
    } else {
      lineStart = token.map ? token.map[0] : prevLineEnd;
      lineEnd = lineStart + 1;
      const baseTag = token.type.replace(/_open$/, '');
      const closeType = `${baseTag}_close`;
      let depth = 1;
      for (let j = i + 1; j < tokens.length; j++) {
        const t = tokens[j];
        if (!t) continue;
        if (t.type === token.type) depth++;
        else if (t.type === closeType) {
          depth--;
          if (depth === 0) {
            lineEnd = t.map ? t.map[1] : lineEnd;
            break;
          }
        }
      }
    }

    // Heading always starts a new section
    if (token.type === 'heading_open') {
      flush();
      const headingText = extractHeadingText(tokens, i);
      current = {
        slices: [{ openType: 'heading_open', lineStart, lineEnd, headingText }],
        lineStart,
        lineEnd,
      };
      prevLineEnd = lineEnd;
      continue;
    }

    // Append to current section (no other split conditions in heading-primary mode)
    if (current.slices.length === 0) {
      current.lineStart = lineStart;
    }
    current.lineEnd = lineEnd;
    current.slices.push({ openType: token.type, lineStart, lineEnd });
    prevLineEnd = lineEnd;
  }

  flush();
  return blocks;
}

// ---------------------------------------------------------------------------
// Rule-based splitter (used when message has no headings — original behaviour)
// ---------------------------------------------------------------------------

/**
 * Original rule-based section splitter. Sections split on:
 *   1. heading_open — always starts new section.
 *   2. hr — flush current section, skip the hr.
 *   3. Blank-line gap ≥ 2 between previous token's lineEnd and current token's lineStart.
 *   4. Previous section token was fence/code_block AND current is prose-like.
 */
function splitByRules(
  content: string,
  tokens: ReturnType<typeof chatMarkdownIt.parse>,
): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let current: Section = { slices: [], lineStart: 0, lineEnd: 0 };
  let prevLineEnd = 0;
  let blockIndex = 0;

  function flush(): void {
    const block = flushSection(content, current, blockIndex);
    if (block) {
      blocks.push(block);
      blockIndex++;
    }
    current = { slices: [], lineStart: 0, lineEnd: 0 };
    prevLineEnd = 0;
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    const isOpen = token.type.endsWith('_open') || SELF_CLOSING.has(token.type);
    if (!isOpen) continue;

    // Resolve line range for this token
    let lineStart: number;
    let lineEnd: number;

    if (SELF_CLOSING.has(token.type)) {
      if (token.map) {
        [lineStart, lineEnd] = token.map;
      } else {
        lineStart = prevLineEnd;
        lineEnd = prevLineEnd + 1;
      }
    } else {
      lineStart = token.map ? token.map[0] : prevLineEnd;
      lineEnd = lineStart + 1;
      const baseTag = token.type.replace(/_open$/, '');
      const closeType = `${baseTag}_close`;
      let depth = 1;
      for (let j = i + 1; j < tokens.length; j++) {
        const t = tokens[j];
        if (!t) continue;
        if (t.type === token.type) depth++;
        else if (t.type === closeType) {
          depth--;
          if (depth === 0) {
            lineEnd = t.map ? t.map[1] : lineEnd;
            break;
          }
        }
      }
    }

    // --- hr: always split, skip ---
    if (token.type === 'hr') {
      flush();
      prevLineEnd = lineEnd;
      continue;
    }

    // --- heading: always starts new section ---
    if (token.type === 'heading_open') {
      flush();
      const headingText = extractHeadingText(tokens, i);
      current = {
        slices: [{ openType: 'heading_open', lineStart, lineEnd, headingText }],
        lineStart,
        lineEnd,
      };
      prevLineEnd = lineEnd;
      continue;
    }

    // --- other tokens: check split conditions ---
    const isEmpty = current.slices.length === 0;

    if (!isEmpty) {
      const blankLineGap = lineStart - prevLineEnd;
      const prevWasFence = ['fence', 'code_block'].includes(
        current.slices[current.slices.length - 1]?.openType ?? '',
      );
      const curIsProse = PROSE_OPENERS.has(token.type);

      const shouldSplit =
        blankLineGap >= 2 ||
        (prevWasFence && curIsProse);

      if (shouldSplit) {
        flush();
      }
    }

    // Append to current section
    if (current.slices.length === 0) {
      current.lineStart = lineStart;
    }
    current.lineEnd = lineEnd;
    current.slices.push({ openType: token.type, lineStart, lineEnd });
    prevLineEnd = lineEnd;
  }

  flush();
  return blocks;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Split `content` into logical sections for annotation picking.
 *
 * If the message contains any markdown headings, heading-primary mode is used:
 * each heading starts a new section and absorbs everything until the next
 * heading, regardless of fences, hrs, or blank-line gaps.
 *
 * If the message has no headings, the original rule-based splitter is used.
 *
 * Returns empty array for empty/whitespace-only content.
 */
export function splitMessageIntoBlocks(content: string): MessageBlock[] {
  if (!content.trim()) return [];

  const tokens = chatMarkdownIt.parse(content, {});

  const hasHeadings = tokens.some((t) => t.type === 'heading_open');
  if (hasHeadings) {
    return splitByHeadingsPrimary(content, tokens);
  }

  return splitByRules(content, tokens);
}
