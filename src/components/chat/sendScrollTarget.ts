import type { ChatUiMessage } from '@/types/chat-ui';

/**
 * Result of `computeSendScrollTarget` — describes the single one-shot anchor
 * scroll that fires whenever a fresh user message is appended at the tail
 * (ChatGPT-style anchor model). The caller compares `userId` against the
 * value it stored last render to decide whether the scroll already fired.
 */
export interface SendScrollTarget {
  /** Index of the new tail user message in `messages`. -1 when no scroll. */
  index: number;
  /** Id of the tail user message that triggered the scroll. */
  userId: string | null;
}

/**
 * Pure rule that determines whether `messages` describes a "fresh user
 * message at the tail" — the trigger for the send-anchor scroll.
 *
 * Returns `{ index: -1, userId: null }` when:
 *  - the list is empty
 *  - the last item is not a user message (e.g. assistant turn streaming,
 *    info marker, internal event, spacer)
 *
 * Otherwise returns the index of the tail user message and its id. The
 * caller scrolls when the returned `userId` differs from the id captured
 * during the previous render.
 *
 * Note: a "new tail user message" includes both first sends and
 * back-to-back sends mid-stream. The previous-id comparison done by the
 * caller is the only thing that gates whether the scroll actually fires.
 */
export function computeSendScrollTarget(messages: ChatUiMessage[]): SendScrollTarget {
  if (messages.length === 0) return { index: -1, userId: null };
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') return { index: -1, userId: null };
  if (last.kind === 'info' || last.kind === 'internalEvent' || last.kind === 'spacer') {
    return { index: -1, userId: null };
  }
  return { index: messages.length - 1, userId: last.id };
}
