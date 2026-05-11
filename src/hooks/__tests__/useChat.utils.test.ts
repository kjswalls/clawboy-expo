/**
 * Unit tests for the pure utility functions used in useChat:
 * - Placeholder toolCalls / thinkingBlocks preservation across stream finalization
 * - Tool call race (no placeholder) and post-finalization (last assistant) attachment
 * - Activity transition helpers
 *
 * These tests exercise the logic directly without needing a full React render tree.
 */
import { describe, it, expect } from '@jest/globals';
import type { ChatMessage, ChatThinkingBlock, ChatToolCall } from '@/types';
import { reconcilePartsWithContent } from '@/lib/chatPartsUtils';
import type { ChatMessagePart } from '@/types';

// ---------------------------------------------------------------------------
// Replicate the pure helpers from useChat — they are module-private but we
// can test the same logic here to guard against regressions.
// ---------------------------------------------------------------------------

const THINKING_ID = 'thinking-stream';

function upsertThinkingBlocks(
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
      ? { ...b, content: cumulative ? text : `${b.content}${text}` }
      : b
  );
}

function upsertToolCalls(
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

/** Simulates what onMessage does when it replaces the streaming placeholder. */
function mergeOnMessage(
  prev: ChatMessage[],
  effectiveStreamId: string,
  mapped: ChatMessage
): ChatMessage[] {
  const placeholder = prev.find((m) => m.id === effectiveStreamId);
  const withoutStream = prev.filter((m) => m.id !== effectiveStreamId);

  const thinkingBlocks: ChatThinkingBlock[] | undefined =
    placeholder?.thinkingBlocks && placeholder.thinkingBlocks.length > 0
      ? placeholder.thinkingBlocks
      : mapped.thinking
        ? [{ id: THINKING_ID, content: mapped.thinking, isExpanded: false }]
        : undefined;

  const merged: ChatMessage = {
    ...mapped,
    content: mapped.content || placeholder?.content || '',
    thinkingBlocks,
    toolCalls: placeholder?.toolCalls,
    isStreaming: false,
  };
  return [...withoutStream, merged];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('upsertThinkingBlocks', () => {
  it('creates a new thinking block when none exists', () => {
    const result = upsertThinkingBlocks(undefined, 'hello', false);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: THINKING_ID, content: 'hello' });
  });

  it('appends text in non-cumulative mode', () => {
    const initial = upsertThinkingBlocks(undefined, 'hello', false);
    const result = upsertThinkingBlocks(initial, ' world', false);
    expect(result[0]!.content).toBe('hello world');
  });

  it('replaces text in cumulative mode', () => {
    const initial = upsertThinkingBlocks(undefined, 'hello', false);
    const result = upsertThinkingBlocks(initial, 'replaced', true);
    expect(result[0]!.content).toBe('replaced');
  });
});

describe('upsertToolCalls', () => {
  it('adds a new running tool call on phase=start', () => {
    const result = upsertToolCalls(undefined, {
      toolCallId: 'tc-1',
      name: 'web_search',
      phase: 'start',
      args: { query: 'foo' },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'tc-1', name: 'web_search', status: 'running' });
  });

  it('updates an existing tool call to completed on phase=result', () => {
    const initial = upsertToolCalls(undefined, {
      toolCallId: 'tc-1',
      name: 'web_search',
      phase: 'start',
    });
    const result = upsertToolCalls(initial, {
      toolCallId: 'tc-1',
      name: 'web_search',
      phase: 'result',
      result: 'search results',
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ status: 'completed', result: 'search results' });
  });

  it('adds a second tool call without replacing the first', () => {
    const initial = upsertToolCalls(undefined, {
      toolCallId: 'tc-1',
      name: 'web_search',
      phase: 'start',
    });
    const result = upsertToolCalls(initial, {
      toolCallId: 'tc-2',
      name: 'read_file',
      phase: 'start',
    });
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(['tc-1', 'tc-2']);
  });
});

describe('mergeOnMessage — placeholder preservation', () => {
  const streamId = 'stream-abc';

  const baseMsg: ChatMessage = {
    id: 'final-123',
    role: 'assistant',
    content: 'Final content from server.',
    timestamp: '2024-01-01T00:00:00Z',
  };

  it('preserves toolCalls accumulated on the placeholder', () => {
    const toolCalls: ChatToolCall[] = [
      { id: 'tc-1', name: 'web_search', status: 'completed', result: 'result A' },
    ];
    const placeholder: ChatMessage = {
      id: streamId,
      role: 'assistant',
      content: 'streaming...',
      timestamp: '2024-01-01T00:00:00Z',
      isStreaming: true,
      toolCalls,
    };

    const next = mergeOnMessage([placeholder], streamId, baseMsg);

    expect(next).toHaveLength(1);
    expect(next[0]!.toolCalls).toEqual(toolCalls);
    expect(next[0]!.id).toBe('final-123');
    expect(next[0]!.isStreaming).toBe(false);
  });

  it('preserves thinkingBlocks accumulated on the placeholder', () => {
    const thinkingBlocks: ChatThinkingBlock[] = [
      { id: THINKING_ID, content: 'reasoning text', isExpanded: false },
    ];
    const placeholder: ChatMessage = {
      id: streamId,
      role: 'assistant',
      content: '',
      timestamp: '2024-01-01T00:00:00Z',
      isStreaming: true,
      thinkingBlocks,
    };

    const next = mergeOnMessage([placeholder], streamId, { ...baseMsg, thinking: undefined });

    expect(next[0]!.thinkingBlocks).toEqual(thinkingBlocks);
  });

  it('falls back to mapped.thinking when placeholder has no thinkingBlocks', () => {
    const placeholder: ChatMessage = {
      id: streamId,
      role: 'assistant',
      content: 'text',
      timestamp: '2024-01-01T00:00:00Z',
      isStreaming: true,
    };

    const next = mergeOnMessage(
      [placeholder],
      streamId,
      { ...baseMsg, thinking: 'server thinking text' }
    );

    expect(next[0]!.thinkingBlocks).toEqual([
      { id: THINKING_ID, content: 'server thinking text', isExpanded: false },
    ]);
  });

  it('keeps streamed content when final message has empty content', () => {
    const placeholder: ChatMessage = {
      id: streamId,
      role: 'assistant',
      content: 'streamed text',
      timestamp: '2024-01-01T00:00:00Z',
      isStreaming: true,
    };

    const next = mergeOnMessage([placeholder], streamId, { ...baseMsg, content: '' });

    expect(next[0]!.content).toBe('streamed text');
  });

  it('prefers final server content when not empty', () => {
    const placeholder: ChatMessage = {
      id: streamId,
      role: 'assistant',
      content: 'partial stream',
      timestamp: '2024-01-01T00:00:00Z',
      isStreaming: true,
    };

    const next = mergeOnMessage([placeholder], streamId, baseMsg);

    expect(next[0]!.content).toBe('Final content from server.');
  });
});

describe('onToolCall target resolution', () => {
  /**
   * Simulates the target-resolution logic inside onToolCall's updateSessionMessages.
   * Returns the resolved targetId or null.
   */
  function resolveToolTarget(
    prev: ChatMessage[],
    mid: string | null
  ): string | null {
    return (
      (mid && prev.some((m) => m.id === mid))
        ? mid
        : prev.find((m) => m.role === 'assistant' && m.isStreaming)?.id
          ?? [...prev].reverse().find((m) => m.role === 'assistant')?.id
          ?? null
    );
  }

  it('attaches to active streaming placeholder when mid matches', () => {
    const msgs: ChatMessage[] = [
      { id: 'stream-1', role: 'assistant', content: '', timestamp: '', isStreaming: true },
    ];
    expect(resolveToolTarget(msgs, 'stream-1')).toBe('stream-1');
  });

  it('falls back to any streaming assistant when mid is null (post-finalization early path)', () => {
    const msgs: ChatMessage[] = [
      { id: 'stream-1', role: 'assistant', content: '', timestamp: '', isStreaming: true },
    ];
    expect(resolveToolTarget(msgs, null)).toBe('stream-1');
  });

  it('falls back to last non-streaming assistant for post-finalization late chunks', () => {
    const msgs: ChatMessage[] = [
      { id: 'user-1', role: 'user', content: 'hi', timestamp: '' },
      { id: 'asst-1', role: 'assistant', content: 'response', timestamp: '', isStreaming: false },
    ];
    expect(resolveToolTarget(msgs, null)).toBe('asst-1');
  });

  it('returns null when no assistant messages exist (triggers ensurePlaceholder)', () => {
    const msgs: ChatMessage[] = [
      { id: 'user-1', role: 'user', content: 'hi', timestamp: '' },
    ];
    expect(resolveToolTarget(msgs, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Vision-capability warning logic (from useChat.sendMessage)
// ---------------------------------------------------------------------------

/**
 * Pure extraction of the model image-support check used in sendMessage.
 * Treat missing/empty `input` as "unknown → allow" to avoid false positives
 * on gateway builds that don't populate the field.
 */
function modelSupportsImage(input: string[] | undefined): boolean {
  return !Array.isArray(input) || input.length === 0 || input.includes('image');
}

function hasImageAttachment(gatewayAttachments: Array<{ type?: string }> | undefined): boolean {
  return (gatewayAttachments ?? []).some((a) => a.type === 'image');
}

describe('modelSupportsImage', () => {
  it('returns true when input is undefined (field absent on old gateway builds)', () => {
    expect(modelSupportsImage(undefined)).toBe(true);
  });

  it('returns true when input is an empty array (gateway sent [])', () => {
    expect(modelSupportsImage([])).toBe(true);
  });

  it('returns true when input includes "image"', () => {
    expect(modelSupportsImage(['text', 'image'])).toBe(true);
  });

  it('returns true when input is only "image"', () => {
    expect(modelSupportsImage(['image'])).toBe(true);
  });

  it('returns false when input is ["text"] (text-only model)', () => {
    expect(modelSupportsImage(['text'])).toBe(false);
  });

  it('returns false when input is ["text", "audio"] (no image in list)', () => {
    expect(modelSupportsImage(['text', 'audio'])).toBe(false);
  });
});

describe('hasImageAttachment', () => {
  it('returns false for undefined (no attachments)', () => {
    expect(hasImageAttachment(undefined)).toBe(false);
  });

  it('returns false for an empty array', () => {
    expect(hasImageAttachment([])).toBe(false);
  });

  it('returns true when any attachment has type "image"', () => {
    expect(hasImageAttachment([{ type: 'image' }])).toBe(true);
  });

  it('returns true when mixed attachments include an image', () => {
    expect(hasImageAttachment([{ type: 'file' }, { type: 'image' }, { type: 'audio' }])).toBe(true);
  });

  it('returns false when no attachment has type "image"', () => {
    expect(hasImageAttachment([{ type: 'file' }, { type: 'audio' }])).toBe(false);
  });

  it('returns false when type is undefined on all attachments', () => {
    expect(hasImageAttachment([{ type: undefined }, {}])).toBe(false);
  });
});

describe('vision warning gate (combined)', () => {
  it('does NOT warn when model supports image and attachment is an image', () => {
    const shouldWarn =
      hasImageAttachment([{ type: 'image' }]) && !modelSupportsImage(['text', 'image']);
    expect(shouldWarn).toBe(false);
  });

  it('DOES warn when model is text-only and attachment is an image', () => {
    const shouldWarn =
      hasImageAttachment([{ type: 'image' }]) && !modelSupportsImage(['text']);
    expect(shouldWarn).toBe(true);
  });

  it('does NOT warn when there is no image attachment even if model is text-only', () => {
    const shouldWarn =
      hasImageAttachment([{ type: 'file' }]) && !modelSupportsImage(['text']);
    expect(shouldWarn).toBe(false);
  });

  it('does NOT warn when input is missing (unknown capability) even with image attachment', () => {
    const shouldWarn =
      hasImageAttachment([{ type: 'image' }]) && !modelSupportsImage(undefined);
    expect(shouldWarn).toBe(false);
  });

  it('does NOT warn when input is empty array (unknown capability)', () => {
    const shouldWarn =
      hasImageAttachment([{ type: 'image' }]) && !modelSupportsImage([]);
    expect(shouldWarn).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reconcilePartsWithContent
// ---------------------------------------------------------------------------

function textPart(id: string, text: string): ChatMessagePart {
  return { kind: 'text', id, text };
}

function thinkingPart(id: string, text = 'thinking...'): ChatMessagePart {
  return { kind: 'thinking', id, text, startedAt: 0, completedAt: 1 };
}

describe('reconcilePartsWithContent', () => {
  it('no-op when parts text already equals finalContent', () => {
    const parts: ChatMessagePart[] = [textPart('t1', 'Hello world')];
    const result = reconcilePartsWithContent(parts, 'Hello world');
    expect(result).toBe(parts); // exact same reference — no mutation
  });

  it('no-op when finalContent is empty', () => {
    const parts: ChatMessagePart[] = [textPart('t1', 'Hello')];
    const result = reconcilePartsWithContent(parts, '');
    expect(result).toBe(parts);
  });

  it('corrects last text part when tail is truncated', () => {
    const parts: ChatMessagePart[] = [textPart('t1', 'Hello worl')]; // last word cut
    const result = reconcilePartsWithContent(parts, 'Hello world');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'text', id: 't1', text: 'Hello world' });
  });

  it('appends a new text part when no text part exists but finalContent is non-empty', () => {
    const parts: ChatMessagePart[] = [thinkingPart('th1')];
    const result = reconcilePartsWithContent(parts, 'some answer');
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ kind: 'text', text: 'some answer' });
  });

  it('preserves preceding text parts and corrects only the last', () => {
    // Two text parts (e.g. thinking→text, tool→text pattern).
    // Preceding part has "Paragraph one.\n\n", last part is truncated.
    const preceding = 'Paragraph one.\n\n';
    const tail = 'Paragraph two but cut';
    const correctedTail = 'Paragraph two fully written out.';
    const parts: ChatMessagePart[] = [
      thinkingPart('th1'),
      textPart('t1', preceding),
      thinkingPart('th2'),
      textPart('t2', tail),
    ];
    const result = reconcilePartsWithContent(parts, preceding + correctedTail);
    expect(result[1]).toMatchObject({ kind: 'text', text: preceding }); // unchanged
    expect(result[3]).toMatchObject({ kind: 'text', text: correctedTail }); // fixed
  });

  it('falls back to full finalContent in last part when preceding text is not a prefix', () => {
    // Preceding text diverged (shouldn't happen in practice, but guard it).
    const parts: ChatMessagePart[] = [
      textPart('t1', 'different prefix '),
      textPart('t2', 'tail'),
    ];
    const result = reconcilePartsWithContent(parts, 'canonical answer');
    // preceding 'different prefix ' is not a prefix of 'canonical answer'
    // → fallback: last part gets the full finalContent
    expect(result[1]).toMatchObject({ kind: 'text', text: 'canonical answer' });
    // first text part is untouched
    expect(result[0]).toMatchObject({ kind: 'text', text: 'different prefix ' });
  });

  it('preserves non-text parts unchanged', () => {
    const parts: ChatMessagePart[] = [
      thinkingPart('th1'),
      textPart('t1', 'text truncated'),
      thinkingPart('th2'),
    ];
    const result = reconcilePartsWithContent(parts, 'text truncated more');
    expect(result[0]).toMatchObject({ kind: 'thinking', id: 'th1' });
    expect(result[1]).toMatchObject({ kind: 'text', text: 'text truncated more' });
    expect(result[2]).toMatchObject({ kind: 'thinking', id: 'th2' });
  });

  it('returns same reference when multi-part text joins equal to finalContent', () => {
    const parts: ChatMessagePart[] = [
      textPart('t1', 'Hello '),
      textPart('t2', 'world'),
    ];
    const result = reconcilePartsWithContent(parts, 'Hello world');
    expect(result).toBe(parts);
  });
});
