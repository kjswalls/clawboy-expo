import type { ChatMessage, ChatMessagePart, ChatThinkingBlock, ChatToolCall } from '@/types';
import type { HistoryToolCall } from '@/lib/openclaw/chat';
import { parseMediaFromToolResult } from '@/lib/openclaw/utils';

export const THINKING_ID = 'thinking-stream';

/** Close the last open thinking or tool part by stamping completedAt. */
export function closePendingPart(parts: ChatMessagePart[]): ChatMessagePart[] {
  const last = parts[parts.length - 1];
  if (!last) return parts;
  if ((last.kind === 'thinking' || last.kind === 'tool') && last.completedAt === undefined) {
    return [...parts.slice(0, -1), { ...last, completedAt: Date.now() }];
  }
  return parts;
}

/** Close all uncompleted parts (used at stream end / message finalization). */
export function closeAllParts(parts: ChatMessagePart[]): ChatMessagePart[] {
  const now = Date.now();
  return parts.map((p) => {
    if ((p.kind === 'thinking' || p.kind === 'tool') && p.completedAt === undefined) {
      return { ...p, completedAt: now };
    }
    return p;
  });
}

/** Update or create an open thinking part identified by `partId`. */
export function upsertThinkingPart(
  parts: ChatMessagePart[],
  partId: string,
  startedAt: number,
  text: string,
  cumulative: boolean
): ChatMessagePart[] {
  const lastIdx = parts.length - 1;
  const last = parts[lastIdx];
  if (last?.kind === 'thinking' && last.id === partId) {
    const updated: ChatMessagePart = {
      ...last,
      text: cumulative ? text : last.text + text,
    };
    return [...parts.slice(0, lastIdx), updated];
  }
  return [
    ...closePendingPart(parts),
    { kind: 'thinking', id: partId, text, startedAt },
  ];
}

/** Append text to the last open text part, or create one. */
export function upsertTextPart(parts: ChatMessagePart[], text: string): ChatMessagePart[] {
  const last = parts[parts.length - 1];
  if (last?.kind === 'text') {
    return [...parts.slice(0, -1), { ...last, text: last.text + text }];
  }
  return [...closePendingPart(parts), { kind: 'text', id: `text-${Date.now()}`, text }];
}

/**
 * Ensure a running tool part exists for `toolCallId`. Updates the existing
 * entry in-place when present (preserving order and status), otherwise appends
 * a new running tool part after closing any pending thinking/text part.
 *
 * This prevents duplicate React keys when the gateway emits multiple
 * non-terminal phases (e.g. 'start', then 'update', 'args', 'progress') for
 * the same tool call.
 */
export function upsertRunningToolPart(
  parts: ChatMessagePart[],
  toolCallId: string,
  name: string,
  args: Record<string, unknown> | undefined,
  meta: string | undefined,
  startedAt: number
): ChatMessagePart[] {
  const idx = parts.findIndex((p) => p.kind === 'tool' && p.id === toolCallId);
  if (idx >= 0) {
    const old = parts[idx];
    if (!old || old.kind !== 'tool') return parts;
    const updated: ChatMessagePart = {
      ...old,
      name: name || old.name,
      args: args ?? old.args,
      meta: meta ?? old.meta,
    };
    return [...parts.slice(0, idx), updated, ...parts.slice(idx + 1)];
  }
  return [
    ...closePendingPart(parts),
    {
      kind: 'tool',
      id: toolCallId,
      name,
      status: 'running',
      args,
      startedAt,
    },
  ];
}

/** Update a tool part identified by toolCallId (result phase). */
export function updateToolPart(
  parts: ChatMessagePart[],
  toolCallId: string,
  phase: string,
  result?: string,
  meta?: string
): ChatMessagePart[] {
  const now = Date.now();
  const idx = [...parts].reverse().findIndex(
    (p) => p.kind === 'tool' && p.id === toolCallId
  );
  if (idx < 0) return parts;
  const realIdx = parts.length - 1 - idx;
  const old = parts[realIdx];
  if (!old || old.kind !== 'tool') return parts;
  const updated: ChatMessagePart = {
    ...old,
    status: phase === 'error' ? 'error' : 'completed',
    result: result ?? old.result,
    meta: meta ?? old.meta,
    completedAt: old.completedAt ?? now,
  };
  return [...parts.slice(0, realIdx), updated, ...parts.slice(realIdx + 1)];
}

export function mergeHistoryToolCalls(messages: ChatMessage[], toolCalls: HistoryToolCall[], gatewayUrl?: string): ChatMessage[] {
  const msgs = messages.map((m) => ({
    ...m,
    toolCalls: m.toolCalls ? m.toolCalls.map((t) => ({ ...t })) : undefined,
  }));
  for (const tc of toolCalls) {
    const anchor = tc.afterMessageId;
    if (!anchor) {
      continue;
    }
    const msg = msgs.find((m) => m.id === anchor || m.serverId === anchor);
    if (!msg || msg.role !== 'assistant') {
      continue;
    }

    let displayResult = tc.result;
    if (tc.result && tc.result.includes('MEDIA:')) {
      const extracted = parseMediaFromToolResult(tc.result, gatewayUrl);
      displayResult = extracted.cleanText || undefined;
      const existingUrls = new Set((msg.images ?? []).map((i) => i.url));
      for (const img of extracted.images) {
        if (!existingUrls.has(img.url)) {
          msg.images = [...(msg.images ?? []), img];
          existingUrls.add(img.url);
        }
      }
      if (!msg.audioUrl && extracted.audioUrls.length > 0) {
        msg.audioUrl = extracted.audioUrls[0];
      }
      if (!msg.videoUrl && extracted.videoUrls.length > 0) {
        msg.videoUrl = extracted.videoUrls[0];
      }
    }

    if (!msg.toolCalls) {
      msg.toolCalls = [];
    }
    msg.toolCalls.push({
      id: tc.toolCallId,
      name: tc.name,
      status: 'completed',
      result: displayResult,
      args: tc.args,
    });
  }
  return msgs;
}

export function upsertThinkingBlocks(
  blocks: ChatThinkingBlock[] | undefined,
  text: string,
  cumulative: boolean
): ChatThinkingBlock[] {
  const prev = blocks ?? [];
  const existing = prev.find((b) => b.id === THINKING_ID);
  if (!existing) {
    return [...prev, { id: THINKING_ID, content: text, isExpanded: false }];
  }
  return prev.map((b) =>
    b.id === THINKING_ID
      ? {
          ...b,
          content: cumulative ? text : `${b.content}${text}`,
        }
      : b
  );
}

export function upsertToolCalls(
  list: ChatToolCall[] | undefined,
  payload: {
    toolCallId: string;
    name: string;
    phase: string;
    result?: string;
    args?: Record<string, unknown>;
    meta?: string;
  }
): ChatToolCall[] {
  const arr = list ? [...list] : [];
  const id = payload.toolCallId;
  const idx = arr.findIndex((t) => t.id === id);
  const phase = payload.phase;
  const nextStatus: ChatToolCall['status'] =
    phase === 'result' || phase === 'error' ? 'completed' : 'running';
  const entry: ChatToolCall = {
    id,
    name: payload.name,
    status: phase === 'error' ? 'error' : nextStatus,
    args: phase === 'start' ? payload.args : arr[idx]?.args ?? payload.args,
    result: payload.result ?? arr[idx]?.result,
    meta: payload.meta ?? arr[idx]?.meta,
  };
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], ...entry };
  } else {
    arr.push({ ...entry, status: phase === 'start' ? 'running' : entry.status });
  }
  return arr;
}
