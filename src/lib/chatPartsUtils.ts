/**
 * Pure utility for chat message parts reconciliation.
 *
 * Kept in a standalone module (no heavy dependency chain) so it can be
 * imported from both useChat and unit tests without pulling in Supabase / React.
 */
import type { ChatMessagePart } from '@/types';

/**
 * Reconcile the text content of streamed parts against the canonical
 * finalContent string from chat:final.
 *
 * Streamed chunks can diverge from the gateway's canonical message text when:
 *   - The gateway post-processes (reformats, appends footnotes) after streaming.
 *   - A tail chunk is dropped between streamEnd's RAF flush and chat:final arrival.
 *   - Server-side reformatting that the chunk accumulator never saw.
 *
 * Strategy: join all text-part texts and compare to finalContent.
 * If equal, return the same array reference (no-op). If different, fix only
 * the last text part so that concat(textParts) === finalContent, preserving
 * thinking/tool interleaving and React key stability.
 */
export function reconcilePartsWithContent(
  parts: ChatMessagePart[],
  finalContent: string,
): ChatMessagePart[] {
  if (!finalContent) return parts;

  const textPartIndices: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]?.kind === 'text') textPartIndices.push(i);
  }

  const joined = textPartIndices
    .map((i) => (parts[i] as { kind: 'text'; text: string }).text)
    .join('');

  if (joined === finalContent) return parts;

  if (textPartIndices.length === 0) {
    // No text part at all — append one with the full canonical body.
    return [...parts, { kind: 'text', id: `text-final-${Date.now()}`, text: finalContent }];
  }

  const lastTextIdx = textPartIndices[textPartIndices.length - 1]!;
  const precedingText = textPartIndices
    .slice(0, -1)
    .map((i) => (parts[i] as { kind: 'text'; text: string }).text)
    .join('');

  // When preceding text is a prefix of finalContent, carry the residual in the
  // last part. Otherwise the preceding text changed too — use finalContent whole.
  const correctedTail = finalContent.startsWith(precedingText)
    ? finalContent.slice(precedingText.length)
    : finalContent;

  return parts.map((p, i) =>
    i === lastTextIdx && p.kind === 'text' ? { ...p, text: correctedTail } : p,
  );
}
