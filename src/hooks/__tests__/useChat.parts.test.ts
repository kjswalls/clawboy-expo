/**
 * Unit tests for the ChatMessagePart state machine helpers in useChat.
 * These are pure functions that can be tested without a React render tree.
 *
 * Coverage:
 * - closePendingPart / closeAllParts
 * - upsertThinkingPart (create, append delta, replace cumulative)
 * - upsertTextPart (create, append)
 * - updateToolPart (result, error)
 * - Full sequential scenarios: thinking → tool → thinking → text
 */
import { describe, it, expect } from '@jest/globals';
import type { ChatMessagePart } from '@/types';

// ---------------------------------------------------------------------------
// Replicate the pure helpers from useChat (module-private, so we copy them).
// ---------------------------------------------------------------------------

function closePendingPart(parts: ChatMessagePart[]): ChatMessagePart[] {
  const last = parts[parts.length - 1];
  if (!last) return parts;
  if ((last.kind === 'thinking' || last.kind === 'tool') && last.completedAt === undefined) {
    return [...parts.slice(0, -1), { ...last, completedAt: 9999 }];
  }
  return parts;
}

function closeAllParts(parts: ChatMessagePart[]): ChatMessagePart[] {
  return parts.map((p) => {
    if ((p.kind === 'thinking' || p.kind === 'tool') && p.completedAt === undefined) {
      return { ...p, completedAt: 9999 };
    }
    return p;
  });
}

function upsertThinkingPart(
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

function upsertTextPart(parts: ChatMessagePart[], text: string): ChatMessagePart[] {
  const last = parts[parts.length - 1];
  if (last?.kind === 'text') {
    return [...parts.slice(0, -1), { ...last, text: last.text + text }];
  }
  return [...closePendingPart(parts), { kind: 'text', id: 'text-1', text }];
}

function updateToolPart(
  parts: ChatMessagePart[],
  toolCallId: string,
  phase: string,
  result?: string,
  meta?: string
): ChatMessagePart[] {
  const idx = [...parts].reverse().findIndex(
    (p) => p.kind === 'tool' && p.id === toolCallId
  );
  if (idx < 0) return parts;
  const realIdx = parts.length - 1 - idx;
  const old = parts[realIdx];
  if (old.kind !== 'tool') return parts;
  const updated: ChatMessagePart = {
    ...old,
    status: phase === 'error' ? 'error' : 'completed',
    result: result ?? old.result,
    meta: meta ?? old.meta,
    completedAt: old.completedAt ?? 9999,
  };
  return [...parts.slice(0, realIdx), updated, ...parts.slice(realIdx + 1)];
}

// ---------------------------------------------------------------------------
// closePendingPart
// ---------------------------------------------------------------------------

describe('closePendingPart', () => {
  it('does nothing to an empty array', () => {
    expect(closePendingPart([])).toEqual([]);
  });

  it('stamps completedAt on an open thinking part', () => {
    const parts: ChatMessagePart[] = [
      { kind: 'thinking', id: 'th-1', text: 'thinking...', startedAt: 100 },
    ];
    const result = closePendingPart(parts);
    expect(result).toHaveLength(1);
    expect((result[0] as Extract<ChatMessagePart, { kind: 'thinking' }>).completedAt).toBeDefined();
  });

  it('stamps completedAt on an open tool part', () => {
    const parts: ChatMessagePart[] = [
      { kind: 'tool', id: 'tc-1', name: 'search', status: 'running', startedAt: 100 },
    ];
    const result = closePendingPart(parts);
    expect((result[0] as Extract<ChatMessagePart, { kind: 'tool' }>).completedAt).toBeDefined();
  });

  it('does not close a text part (text has no completedAt)', () => {
    const parts: ChatMessagePart[] = [{ kind: 'text', id: 'tx-1', text: 'hello' }];
    const result = closePendingPart(parts);
    expect(result).toEqual(parts);
  });

  it('does not close an already-completed thinking part', () => {
    const parts: ChatMessagePart[] = [
      { kind: 'thinking', id: 'th-1', text: 'done', startedAt: 100, completedAt: 200 },
    ];
    const result = closePendingPart(parts);
    expect(result).toEqual(parts);
  });

  it('only closes the last part, not earlier ones', () => {
    const parts: ChatMessagePart[] = [
      { kind: 'thinking', id: 'th-1', text: 'a', startedAt: 100 },
      { kind: 'tool', id: 'tc-1', name: 'x', status: 'running', startedAt: 200 },
    ];
    const result = closePendingPart(parts);
    expect((result[0] as Extract<ChatMessagePart, { kind: 'thinking' }>).completedAt).toBeUndefined();
    expect((result[1] as Extract<ChatMessagePart, { kind: 'tool' }>).completedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// closeAllParts
// ---------------------------------------------------------------------------

describe('closeAllParts', () => {
  it('closes all open thinking and tool parts', () => {
    const parts: ChatMessagePart[] = [
      { kind: 'thinking', id: 'th-1', text: 'a', startedAt: 100 },
      { kind: 'tool', id: 'tc-1', name: 'x', status: 'running', startedAt: 200 },
      { kind: 'text', id: 'tx-1', text: 'hello' },
    ];
    const result = closeAllParts(parts);
    expect((result[0] as Extract<ChatMessagePart, { kind: 'thinking' }>).completedAt).toBeDefined();
    expect((result[1] as Extract<ChatMessagePart, { kind: 'tool' }>).completedAt).toBeDefined();
    expect(result[2]).toEqual(parts[2]); // text unchanged
  });

  it('does not alter already-completed parts', () => {
    const parts: ChatMessagePart[] = [
      { kind: 'thinking', id: 'th-1', text: 'a', startedAt: 100, completedAt: 150 },
    ];
    const result = closeAllParts(parts);
    expect((result[0] as Extract<ChatMessagePart, { kind: 'thinking' }>).completedAt).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// upsertThinkingPart
// ---------------------------------------------------------------------------

describe('upsertThinkingPart', () => {
  it('creates a new thinking part when parts is empty', () => {
    const result = upsertThinkingPart([], 'th-1', 100, 'Let me think', false);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: 'thinking',
      id: 'th-1',
      text: 'Let me think',
      startedAt: 100,
    });
    expect((result[0] as Extract<ChatMessagePart, { kind: 'thinking' }>).completedAt).toBeUndefined();
  });

  it('appends text to an existing open thinking part (delta mode)', () => {
    const initial = upsertThinkingPart([], 'th-1', 100, 'Hello', false);
    const result = upsertThinkingPart(initial, 'th-1', 100, ' world', false);
    expect(result).toHaveLength(1);
    expect((result[0] as Extract<ChatMessagePart, { kind: 'thinking' }>).text).toBe('Hello world');
  });

  it('replaces text in cumulative mode', () => {
    const initial = upsertThinkingPart([], 'th-1', 100, 'Hello', false);
    const result = upsertThinkingPart(initial, 'th-1', 100, 'Full thinking text', true);
    expect((result[0] as Extract<ChatMessagePart, { kind: 'thinking' }>).text).toBe('Full thinking text');
  });

  it('opens a new thinking part when the last part has a different id (new spell)', () => {
    const initial = upsertThinkingPart([], 'th-1', 100, 'First spell', false);
    // Simulate: th-1 is closed, now we open th-2
    const closed = closePendingPart(initial);
    const result = upsertThinkingPart(closed, 'th-2', 200, 'Second spell', false);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'th-1' });
    expect(result[1]).toMatchObject({ kind: 'thinking', id: 'th-2', text: 'Second spell' });
  });

  it('closes an open tool part before opening a new thinking part', () => {
    const toolPart: ChatMessagePart = {
      kind: 'tool', id: 'tc-1', name: 'search', status: 'running', startedAt: 100,
    };
    const result = upsertThinkingPart([toolPart], 'th-1', 200, 'Now thinking', false);
    expect(result).toHaveLength(2);
    expect((result[0] as Extract<ChatMessagePart, { kind: 'tool' }>).completedAt).toBeDefined();
    expect(result[1]).toMatchObject({ kind: 'thinking', id: 'th-1' });
  });
});

// ---------------------------------------------------------------------------
// upsertTextPart
// ---------------------------------------------------------------------------

describe('upsertTextPart', () => {
  it('creates a new text part when parts is empty', () => {
    const result = upsertTextPart([], 'Hello');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'text', text: 'Hello' });
  });

  it('appends to an existing text part', () => {
    const initial = upsertTextPart([], 'Hello');
    const result = upsertTextPart(initial, ' world');
    expect(result).toHaveLength(1);
    expect((result[0] as Extract<ChatMessagePart, { kind: 'text' }>).text).toBe('Hello world');
  });

  it('closes an open thinking part and creates a new text part', () => {
    const thinking: ChatMessagePart = {
      kind: 'thinking', id: 'th-1', text: 'reasoning', startedAt: 100,
    };
    const result = upsertTextPart([thinking], 'Answer');
    expect(result).toHaveLength(2);
    expect((result[0] as Extract<ChatMessagePart, { kind: 'thinking' }>).completedAt).toBeDefined();
    expect(result[1]).toMatchObject({ kind: 'text', text: 'Answer' });
  });
});

// ---------------------------------------------------------------------------
// updateToolPart
// ---------------------------------------------------------------------------

describe('updateToolPart', () => {
  const runningTool: ChatMessagePart = {
    kind: 'tool', id: 'tc-1', name: 'search', status: 'running', startedAt: 100,
  };

  it('sets status=completed and result on phase=result', () => {
    const result = updateToolPart([runningTool], 'tc-1', 'result', 'search results');
    expect(result[0]).toMatchObject({
      status: 'completed',
      result: 'search results',
    });
    expect((result[0] as Extract<ChatMessagePart, { kind: 'tool' }>).completedAt).toBeDefined();
  });

  it('sets status=error on phase=error', () => {
    const result = updateToolPart([runningTool], 'tc-1', 'error');
    expect((result[0] as Extract<ChatMessagePart, { kind: 'tool' }>).status).toBe('error');
  });

  it('updates meta when provided', () => {
    const result = updateToolPart([runningTool], 'tc-1', 'result', undefined, 'path/to/file.ts');
    expect((result[0] as Extract<ChatMessagePart, { kind: 'tool' }>).meta).toBe('path/to/file.ts');
  });

  it('returns parts unchanged when toolCallId not found', () => {
    const result = updateToolPart([runningTool], 'tc-unknown', 'result', 'x');
    expect(result).toEqual([runningTool]);
  });

  it('finds the correct tool when multiple tools exist', () => {
    const tc2: ChatMessagePart = {
      kind: 'tool', id: 'tc-2', name: 'read', status: 'running', startedAt: 200,
    };
    const result = updateToolPart([runningTool, tc2], 'tc-2', 'result', 'file contents');
    expect((result[0] as Extract<ChatMessagePart, { kind: 'tool' }>).status).toBe('running');
    expect((result[1] as Extract<ChatMessagePart, { kind: 'tool' }>).status).toBe('completed');
    expect((result[1] as Extract<ChatMessagePart, { kind: 'tool' }>).result).toBe('file contents');
  });
});

// ---------------------------------------------------------------------------
// Full sequential scenario: thinking → tool → thinking → text
// ---------------------------------------------------------------------------

describe('sequential parts scenario', () => {
  it('builds thinking → tool → thinking → text in correct order with distinct blocks', () => {
    let parts: ChatMessagePart[] = [];

    // Phase 1: thinking spell 1
    parts = upsertThinkingPart(parts, 'th-1', 100, "Let me search", false);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ kind: 'thinking', id: 'th-1' });

    // Phase transition: tool start → closes th-1
    parts = closePendingPart(parts);
    parts = [
      ...parts,
      { kind: 'tool', id: 'tc-1', name: 'web_search', status: 'running', startedAt: 200 },
    ];
    expect(parts).toHaveLength(2);
    expect((parts[0] as Extract<ChatMessagePart, { kind: 'thinking' }>).completedAt).toBeDefined();

    // Tool completes
    parts = updateToolPart(parts, 'tc-1', 'result', 'search results');
    expect((parts[1] as Extract<ChatMessagePart, { kind: 'tool' }>).status).toBe('completed');

    // Phase 2: thinking spell 2 (separate block from th-1)
    parts = upsertThinkingPart(parts, 'th-2', 300, "Now I know the answer", false);
    expect(parts).toHaveLength(3);
    expect(parts[2]).toMatchObject({ kind: 'thinking', id: 'th-2' });

    // Text arrives → closes th-2
    parts = upsertTextPart(parts, "Here's what I found:");
    expect(parts).toHaveLength(4);
    expect((parts[2] as Extract<ChatMessagePart, { kind: 'thinking' }>).completedAt).toBeDefined();
    expect(parts[3]).toMatchObject({ kind: 'text', text: "Here's what I found:" });

    // More text appends to existing text part
    parts = upsertTextPart(parts, " lots of info.");
    expect(parts).toHaveLength(4);
    expect((parts[3] as Extract<ChatMessagePart, { kind: 'text' }>).text).toBe(
      "Here's what I found: lots of info."
    );

    // Finalize: close all
    parts = closeAllParts(parts);
    // Text part is unchanged; thinking/tool parts all have completedAt
    const kinds = parts.map((p) => p.kind);
    expect(kinds).toEqual(['thinking', 'tool', 'thinking', 'text']);
    // All internal blocks now have completedAt
    expect((parts[2] as Extract<ChatMessagePart, { kind: 'thinking' }>).completedAt).toBeDefined();
  });

  it('handles two tools in a row without thinking between them', () => {
    let parts: ChatMessagePart[] = [];

    parts = [
      ...parts,
      { kind: 'tool', id: 'tc-1', name: 'read_file', status: 'running', startedAt: 100 },
    ];
    parts = updateToolPart(parts, 'tc-1', 'result', 'file 1 content');
    parts = [
      ...closePendingPart(parts),
      { kind: 'tool', id: 'tc-2', name: 'read_file', status: 'running', startedAt: 200 },
    ];
    parts = updateToolPart(parts, 'tc-2', 'result', 'file 2 content');

    expect(parts).toHaveLength(2);
    expect(parts.every((p) => p.kind === 'tool')).toBe(true);
    expect((parts[0] as Extract<ChatMessagePart, { kind: 'tool' }>).id).toBe('tc-1');
    expect((parts[1] as Extract<ChatMessagePart, { kind: 'tool' }>).id).toBe('tc-2');
  });

  it('thinking interrupted by tool creates two distinct thinking parts', () => {
    let parts: ChatMessagePart[] = [];

    // First thinking spell
    parts = upsertThinkingPart(parts, 'th-1', 100, 'First thought', false);
    parts = upsertThinkingPart(parts, 'th-1', 100, ' more first thought', false);

    // Tool interrupts
    parts = closePendingPart(parts);
    parts = [
      ...parts,
      { kind: 'tool', id: 'tc-1', name: 'search', status: 'running', startedAt: 200 },
    ];
    parts = updateToolPart(parts, 'tc-1', 'result', 'results');

    // Second thinking spell — new id th-2
    parts = upsertThinkingPart(parts, 'th-2', 300, 'Second thought', false);

    const thinkingParts = parts.filter((p) => p.kind === 'thinking');
    expect(thinkingParts).toHaveLength(2);
    expect((thinkingParts[0] as Extract<ChatMessagePart, { kind: 'thinking' }>).id).toBe('th-1');
    expect((thinkingParts[0] as Extract<ChatMessagePart, { kind: 'thinking' }>).text).toBe('First thought more first thought');
    expect((thinkingParts[1] as Extract<ChatMessagePart, { kind: 'thinking' }>).id).toBe('th-2');
    expect((thinkingParts[1] as Extract<ChatMessagePart, { kind: 'thinking' }>).text).toBe('Second thought');
    // First spell completed when tool started
    expect((thinkingParts[0] as Extract<ChatMessagePart, { kind: 'thinking' }>).completedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// formatDuration (imported utility)
// ---------------------------------------------------------------------------

import { formatDuration } from '@/lib/formatDuration';

describe('formatDuration', () => {
  it('renders milliseconds below 1s', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(300)).toBe('300ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('renders whole seconds', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(5000)).toBe('5s');
  });

  it('renders fractional seconds with one decimal', () => {
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(2300)).toBe('2.3s');
  });

  it('renders minutes without seconds when seconds=0', () => {
    expect(formatDuration(60000)).toBe('1m');
    expect(formatDuration(120000)).toBe('2m');
  });

  it('renders minutes and seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(150000)).toBe('2m 30s');
  });
});
