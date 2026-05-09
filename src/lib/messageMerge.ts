/**
 * Identity-preserving message merge for chat history reconciliation.
 *
 * When `chat.history` returns a fresh array from the server, all objects are
 * new references. Without this util, the WeakMap in `app/index.tsx` that caches
 * `ChatMessage → ChatUiMessage` adaptations misses on every message, causing
 * React.memo on MessageBubble to re-render and re-measure every bubble — the
 * primary cause of scroll shake on cold-start and session history loads.
 */
import type { ChatMessage } from '@/types';
import type { ClawboyOptionsPrompt } from '@/lib/openclaw/interactive';

// ---------------------------------------------------------------------------
// Structural equality helpers — only check fields that affect rendering.
// ---------------------------------------------------------------------------

function scalarsEqual(a: ChatMessage, b: ChatMessage): boolean {
  return (
    a.content === b.content &&
    a.timestamp === b.timestamp &&
    // Treat false and undefined as equivalent (both mean "not streaming").
    !!a.isStreaming === !!b.isStreaming &&
    !!a.interrupted === !!b.interrupted &&
    a.kind === b.kind &&
    a.audioUrl === b.audioUrl &&
    a.videoUrl === b.videoUrl &&
    a.guessedMedia === b.guessedMedia
  );
}

function imageUrlsEqual(a: ChatMessage['images'], b: ChatMessage['images']): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    const au = typeof ai === 'string' ? ai : ai.url;
    const bu = typeof bi === 'string' ? bi : bi.url;
    if (au !== bu) return false;
  }
  return true;
}

function filesEqual(a: ChatMessage['files'], b: ChatMessage['files']): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.url !== b[i]!.url) return false;
  }
  return true;
}

function toolCallsEqual(a: ChatMessage['toolCalls'], b: ChatMessage['toolCalls']): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    if (ai.id !== bi.id || ai.status !== bi.status || ai.result !== bi.result) return false;
  }
  return true;
}

function thinkingBlocksEqual(
  a: ChatMessage['thinkingBlocks'],
  b: ChatMessage['thinkingBlocks'],
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.id !== b[i]!.id || a[i]!.content !== b[i]!.content) return false;
  }
  return true;
}

function interactiveEqual(
  a: ClawboyOptionsPrompt | undefined,
  b: ClawboyOptionsPrompt | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.prompt !== b.prompt) return false;
  if (a.allowFreeText !== b.allowFreeText) return false;
  if (a.freeTextPlaceholder !== b.freeTextPlaceholder) return false;
  if (a.choices.length !== b.choices.length) return false;
  for (let i = 0; i < a.choices.length; i++) {
    const ac = a.choices[i]!;
    const bc = b.choices[i]!;
    if (ac.label !== bc.label || ac.value !== bc.value || ac.hint !== bc.hint) return false;
  }
  return true;
}

function partsEqual(a: ChatMessage['parts'], b: ChatMessage['parts']): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ap = a[i]!;
    const bp = b[i]!;
    if (ap.id !== bp.id || ap.kind !== bp.kind) return false;
    if (ap.kind === 'text' && bp.kind === 'text' && ap.text !== bp.text) return false;
    if (ap.kind === 'thinking' && bp.kind === 'thinking' && ap.text !== bp.text) return false;
  }
  return true;
}

/**
 * True when every rendered field of two messages is structurally equal, making
 * it safe to return the existing `prev` reference without triggering a re-render.
 */
export function chatMessagesEqual(a: ChatMessage, b: ChatMessage): boolean {
  return (
    a.role === b.role &&
    scalarsEqual(a, b) &&
    imageUrlsEqual(a.images, b.images) &&
    filesEqual(a.files, b.files) &&
    toolCallsEqual(a.toolCalls, b.toolCalls) &&
    thinkingBlocksEqual(a.thinkingBlocks, b.thinkingBlocks) &&
    partsEqual(a.parts, b.parts) &&
    interactiveEqual(a.interactive, b.interactive)
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Merges `next` (e.g. a fresh array from `chat.history`) into `prev` (the
 * current in-memory cache) by returning the existing `prev` reference for any
 * message that has the same id AND is structurally equal.
 *
 * This keeps the WeakMap in `app/index.tsx` valid, so unchanged messages keep
 * their `ChatUiMessage` reference and React.memo on MessageBubble short-circuits
 * — no Markdown re-parse, no remeasure, no scroll shake.
 *
 * Also resolves "same content, different id" collisions: when a message in
 * `next` carries an id that matches a `serverId` stored on a `prev` entry (a
 * `stream-<uuid>` placeholder finalized by F2), the placeholder reference is
 * returned with the canonical server id preserved in `serverId`. This keeps the
 * FlatList cell mounted across subsequent chat.history reconciliations.
 */
export function mergeMessagesPreservingIdentity(
  prev: ChatMessage[],
  next: ChatMessage[],
): ChatMessage[] {
  if (prev.length === 0) return next;

  const prevById = new Map<string, ChatMessage>();
  const prevByServerId = new Map<string, ChatMessage>();
  for (const m of prev) {
    prevById.set(m.id, m);
    if (m.serverId) prevByServerId.set(m.serverId, m);
  }

  return next.map((nextMsg) => {
    // Direct id match — most common path.
    const byId = prevById.get(nextMsg.id);
    if (byId) {
      return chatMessagesEqual(byId, nextMsg) ? byId : nextMsg;
    }

    // Server returned the canonical id of a finalized stream placeholder.
    // Return the placeholder ref (preserving FlatList cell) but normalise
    // `serverId` so future merges and mergeHistoryToolCalls can still resolve it.
    const byServerId = prevByServerId.get(nextMsg.id);
    if (byServerId) {
      const normalised: ChatMessage = { ...nextMsg, id: byServerId.id, serverId: nextMsg.id };
      return chatMessagesEqual(byServerId, normalised) ? byServerId : normalised;
    }

    return nextMsg;
  });
}
