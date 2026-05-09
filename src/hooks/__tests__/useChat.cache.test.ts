/**
 * Logic-only tests for the session cache utilities in useChat.
 *
 * `evictOldestSessionCaches` and `mergeHistoryToolCalls` are module-private
 * so we replicate their logic here. These tests guard against regressions in
 * cache eviction ordering and tool call anchoring without a React render tree.
 *
 * `mergeMessagesPreservingIdentity` and `chatMessagesEqual` are exported from
 * src/lib/messageMerge and tested here.
 */
import { describe, it, expect } from '@jest/globals'
import type { ChatMessage, ChatToolCall } from '@/types'
import type { HistoryToolCall } from '@/lib/openclaw/chat'
import { mergeMessagesPreservingIdentity, chatMessagesEqual } from '@/lib/messageMerge'

// ---------------------------------------------------------------------------
// Replicated helpers (match implementation in useChat.ts exactly)
// ---------------------------------------------------------------------------

const SESSION_CACHE_MAX = 50

function evictOldestSessionCaches(map: Map<string, ChatMessage[]>): void {
  while (map.size > SESSION_CACHE_MAX) {
    const first = map.keys().next().value
    if (first === undefined) break
    map.delete(first)
  }
}

function mergeHistoryToolCalls(messages: ChatMessage[], toolCalls: HistoryToolCall[]): ChatMessage[] {
  const msgs = messages.map((m) => ({
    ...m,
    toolCalls: m.toolCalls ? m.toolCalls.map((t) => ({ ...t })) : undefined,
  }))
  for (const tc of toolCalls) {
    const anchor = tc.afterMessageId
    if (!anchor) continue
    // Match by id OR serverId — mirrors the updated implementation in useChat.ts
    const msg = msgs.find((m) => m.id === anchor || m.serverId === anchor)
    if (!msg || msg.role !== 'assistant') continue
    if (!msg.toolCalls) msg.toolCalls = []
    msg.toolCalls.push({
      id: tc.toolCallId,
      name: tc.name,
      status: 'completed',
      result: tc.result,
      args: tc.args,
    })
  }
  return msgs
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('evictOldestSessionCaches', () => {
  it('does not evict when size is at the cap', () => {
    const map = new Map<string, ChatMessage[]>()
    for (let i = 0; i < SESSION_CACHE_MAX; i++) {
      map.set(`session-${i}`, [])
    }
    evictOldestSessionCaches(map)
    expect(map.size).toBe(SESSION_CACHE_MAX)
  })

  it('evicts the oldest entry when size exceeds cap by one', () => {
    const map = new Map<string, ChatMessage[]>()
    for (let i = 0; i < SESSION_CACHE_MAX + 1; i++) {
      map.set(`session-${i}`, [])
    }
    evictOldestSessionCaches(map)
    expect(map.size).toBe(SESSION_CACHE_MAX)
    expect(map.has('session-0')).toBe(false)
    expect(map.has(`session-${SESSION_CACHE_MAX}`)).toBe(true)
  })

  it('evicts multiple entries when size far exceeds cap', () => {
    const map = new Map<string, ChatMessage[]>()
    for (let i = 0; i < SESSION_CACHE_MAX + 5; i++) {
      map.set(`session-${i}`, [])
    }
    evictOldestSessionCaches(map)
    expect(map.size).toBe(SESSION_CACHE_MAX)
    // First 5 entries evicted
    for (let i = 0; i < 5; i++) {
      expect(map.has(`session-${i}`)).toBe(false)
    }
  })

  it('evicts the insertion-order oldest, not alphabetical', () => {
    const map = new Map<string, ChatMessage[]>()
    // Insert 'z' first — it should be evicted when we exceed the cap
    map.set('z-first', [])
    for (let i = 0; i < SESSION_CACHE_MAX; i++) {
      map.set(`session-${i}`, [])
    }
    evictOldestSessionCaches(map)
    expect(map.size).toBe(SESSION_CACHE_MAX)
    expect(map.has('z-first')).toBe(false)
    expect(map.has('session-0')).toBe(true)
  })
})

describe('mergeHistoryToolCalls', () => {
  const makeAssistantMsg = (id: string, toolCalls?: ChatToolCall[]): ChatMessage => ({
    id,
    role: 'assistant',
    content: `Content for ${id}`,
    timestamp: new Date().toISOString(),
    toolCalls,
  })

  const makeUserMsg = (id: string): ChatMessage => ({
    id,
    role: 'user',
    content: `User message ${id}`,
    timestamp: new Date().toISOString(),
  })

  it('returns the messages array unchanged when there are no tool calls', () => {
    const messages = [makeAssistantMsg('msg-1'), makeUserMsg('msg-2')]
    const result = mergeHistoryToolCalls(messages, [])
    expect(result).toHaveLength(2)
    expect(result[0]!.toolCalls).toBeUndefined()
  })

  it('anchors a tool call to the correct assistant message', () => {
    const messages = [makeAssistantMsg('msg-1'), makeUserMsg('msg-2'), makeAssistantMsg('msg-3')]
    const toolCalls: HistoryToolCall[] = [{
      toolCallId: 'tc-1',
      afterMessageId: 'msg-1',
      name: 'bash',
      phase: 'result',
      args: { command: 'ls' },
      result: 'file.txt',
    }]
    const result = mergeHistoryToolCalls(messages, toolCalls)
    const msg1 = result.find((m) => m.id === 'msg-1')!
    expect(msg1.toolCalls).toHaveLength(1)
    expect(msg1.toolCalls![0]!.name).toBe('bash')
    expect(msg1.toolCalls![0]!.status).toBe('completed')
    expect(msg1.toolCalls![0]!.result).toBe('file.txt')
  })

  it('appends multiple tool calls to the same anchor message', () => {
    const messages = [makeAssistantMsg('msg-1')]
    const toolCalls: HistoryToolCall[] = [
      { toolCallId: 'tc-1', afterMessageId: 'msg-1', name: 'bash', phase: 'result', args: {}, result: 'r1' },
      { toolCallId: 'tc-2', afterMessageId: 'msg-1', name: 'read_file', phase: 'result', args: {}, result: 'r2' },
    ]
    const result = mergeHistoryToolCalls(messages, toolCalls)
    expect(result[0]!.toolCalls).toHaveLength(2)
  })

  it('skips tool calls without an afterMessageId', () => {
    const messages = [makeAssistantMsg('msg-1')]
    const toolCalls: HistoryToolCall[] = [
      { toolCallId: 'tc-1', afterMessageId: undefined, name: 'bash', phase: 'result', args: {}, result: 'r' },
    ]
    const result = mergeHistoryToolCalls(messages, toolCalls)
    expect(result[0]!.toolCalls).toBeUndefined()
  })

  it('skips tool calls whose anchor is a user message', () => {
    const messages = [makeUserMsg('msg-1'), makeAssistantMsg('msg-2')]
    const toolCalls: HistoryToolCall[] = [
      { toolCallId: 'tc-1', afterMessageId: 'msg-1', name: 'bash', phase: 'result', args: {}, result: 'r' },
    ]
    const result = mergeHistoryToolCalls(messages, toolCalls)
    expect(result[0]!.toolCalls).toBeUndefined()
    expect(result[1]!.toolCalls).toBeUndefined()
  })

  it('does not mutate the original messages array', () => {
    const original = makeAssistantMsg('msg-1')
    const messages = [original]
    const toolCalls: HistoryToolCall[] = [
      { toolCallId: 'tc-1', afterMessageId: 'msg-1', name: 'bash', phase: 'result', args: {}, result: 'r' },
    ]
    mergeHistoryToolCalls(messages, toolCalls)
    expect(original.toolCalls).toBeUndefined()
  })

  it('handles anchor messages that are not in the array', () => {
    const messages = [makeAssistantMsg('msg-1')]
    const toolCalls: HistoryToolCall[] = [
      { toolCallId: 'tc-1', afterMessageId: 'non-existent', name: 'bash', phase: 'result', args: {}, result: 'r' },
    ]
    const result = mergeHistoryToolCalls(messages, toolCalls)
    expect(result[0]!.toolCalls).toBeUndefined()
  })

  it('anchors a tool call via serverId when the placeholder id differs from the canonical id', () => {
    const placeholder = makeAssistantMsg('stream-abc')
    placeholder.serverId = 'server-msg-1'
    const messages = [placeholder]
    const toolCalls: HistoryToolCall[] = [
      { toolCallId: 'tc-1', afterMessageId: 'server-msg-1', name: 'bash', phase: 'result', args: {}, result: 'output' },
    ]
    const result = mergeHistoryToolCalls(messages, toolCalls)
    expect(result[0]!.toolCalls).toHaveLength(1)
    expect(result[0]!.toolCalls![0]!.name).toBe('bash')
  })
})

// ---------------------------------------------------------------------------
// mergeMessagesPreservingIdentity
// ---------------------------------------------------------------------------

describe('mergeMessagesPreservingIdentity', () => {
  const makeMsg = (id: string, content = 'hello'): ChatMessage => ({
    id,
    role: 'assistant',
    content,
    timestamp: '2024-01-01T00:00:00.000Z',
  })

  it('returns next unchanged when prev is empty', () => {
    const next = [makeMsg('a'), makeMsg('b')]
    const result = mergeMessagesPreservingIdentity([], next)
    expect(result).toBe(next)
  })

  it('returns the prev reference for an identical message', () => {
    const prev = [makeMsg('a', 'hello')]
    const next = [makeMsg('a', 'hello')]
    const result = mergeMessagesPreservingIdentity(prev, next)
    expect(result[0]).toBe(prev[0])
  })

  it('returns the next reference when content differs', () => {
    const prev = [makeMsg('a', 'old')]
    const next = [makeMsg('a', 'new')]
    const result = mergeMessagesPreservingIdentity(prev, next)
    expect(result[0]).toBe(next[0])
  })

  it('reuses refs for unchanged tail messages when new ones are prepended', () => {
    const tail1 = makeMsg('tail-1', 'hi')
    const tail2 = makeMsg('tail-2', 'bye')
    const prev = [tail1, tail2]
    // Server returns two older messages plus the same two tail messages.
    const next = [makeMsg('old-1', 'older'), makeMsg('old-2', 'oldest'), makeMsg('tail-1', 'hi'), makeMsg('tail-2', 'bye')]
    const result = mergeMessagesPreservingIdentity(prev, next)
    expect(result).toHaveLength(4)
    // Tail messages should have the same object reference as before.
    expect(result[2]).toBe(tail1)
    expect(result[3]).toBe(tail2)
    // New prepended messages come through as-is.
    expect(result[0]).toBe(next[0])
  })

  it('resolves a stream placeholder via serverId (F2 scenario)', () => {
    // After onMessage finalization the placeholder has id=stream-uuid, serverId=canonical
    const placeholder: ChatMessage = { ...makeMsg('stream-abc', 'response text'), serverId: 'server-123', isStreaming: false }
    const prev = [makeMsg('user-1', 'question'), placeholder]
    // chat.history returns the canonical server id
    const fromServer = makeMsg('server-123', 'response text')
    const next = [makeMsg('user-1', 'question'), fromServer]
    const result = mergeMessagesPreservingIdentity(prev, next)
    // The placeholder reference should be preserved (keeps FlatList cell stable)
    expect(result[1]).toBe(placeholder)
    // And its id stays as the placeholder id
    expect(result[1]!.id).toBe('stream-abc')
  })

  it('returns an updated (non-prev) ref when the server-canonical message differs from the placeholder', () => {
    const placeholder: ChatMessage = { ...makeMsg('stream-abc', 'old text'), serverId: 'server-123', isStreaming: false }
    const prev = [placeholder]
    const fromServer = makeMsg('server-123', 'updated text')
    const next = [fromServer]
    const result = mergeMessagesPreservingIdentity(prev, next)
    expect(result[0]).not.toBe(placeholder)
    expect(result[0]!.content).toBe('updated text')
    // Still preserves the stable id and serverId
    expect(result[0]!.id).toBe('stream-abc')
    expect(result[0]!.serverId).toBe('server-123')
  })
})

// ---------------------------------------------------------------------------
// chatMessagesEqual
// ---------------------------------------------------------------------------

describe('chatMessagesEqual', () => {
  const base: ChatMessage = {
    id: 'x',
    role: 'assistant',
    content: 'hello',
    timestamp: '2024-01-01T00:00:00.000Z',
  }

  it('returns true for identical objects', () => {
    expect(chatMessagesEqual(base, { ...base })).toBe(true)
  })

  it('returns false when content differs', () => {
    expect(chatMessagesEqual(base, { ...base, content: 'different' })).toBe(false)
  })

  it('returns false when isStreaming differs', () => {
    expect(chatMessagesEqual(base, { ...base, isStreaming: true })).toBe(false)
  })

  it('returns false when toolCalls length differs', () => {
    const withTool: ChatMessage = {
      ...base,
      toolCalls: [{ id: 'tc1', name: 'bash', status: 'completed', result: 'ok' }],
    }
    expect(chatMessagesEqual(base, withTool)).toBe(false)
  })

  it('returns true when toolCalls have the same id/status/result', () => {
    const tc: ChatToolCall = { id: 'tc1', name: 'bash', status: 'completed', result: 'ok' }
    const a: ChatMessage = { ...base, toolCalls: [tc] }
    const b: ChatMessage = { ...base, toolCalls: [{ ...tc }] }
    expect(chatMessagesEqual(a, b)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Late streamChunk after chat:final — second-bubble prevention
//
// Replicates the logic added to onStreamChunk in useChat.ts:
// when streamMessageIdRef is null (chat:final already cleared it), a late
// chunk should attach to the most-recently-finalized assistant message instead
// of creating a new `stream-*` placeholder — preventing a second bubble.
// ---------------------------------------------------------------------------

describe('late streamChunk after chat:final — second-bubble prevention', () => {
  /**
   * Replicate the new "recentlyFinalized" detection from onStreamChunk.
   * Returns the existing message id to append to, or null when a new
   * placeholder is appropriate (true early-race case).
   */
  function resolveTargetForLateChunk(
    msgs: ChatMessage[],
    nowMs: number,
  ): string | null {
    const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant')
    const recentlyFinalized =
      lastAssistant &&
      !lastAssistant.isStreaming &&
      nowMs - new Date(lastAssistant.timestamp).getTime() < 2000
    if (recentlyFinalized) return lastAssistant.id
    return null // signal: create a new placeholder
  }

  const makeFinalized = (id: string, secsAgo: number): ChatMessage => ({
    id,
    role: 'assistant' as const,
    content: 'Hey Kirby! Let\'s test the inline buttons.',
    timestamp: new Date(Date.now() - secsAgo * 1000).toISOString(),
    isStreaming: false,
  })

  it('returns existing id for a message finalized < 2 s ago', () => {
    const msgs: ChatMessage[] = [makeFinalized('stream-abc', 0.2)]
    const target = resolveTargetForLateChunk(msgs, Date.now())
    expect(target).toBe('stream-abc')
  })

  it('returns null (create placeholder) for a message finalized > 2 s ago', () => {
    const msgs: ChatMessage[] = [makeFinalized('stream-abc', 3)]
    const target = resolveTargetForLateChunk(msgs, Date.now())
    expect(target).toBeNull()
  })

  it('returns null when cache is empty (true early-race)', () => {
    const target = resolveTargetForLateChunk([], Date.now())
    expect(target).toBeNull()
  })

  it('returns null when last assistant message is still streaming', () => {
    const streaming: ChatMessage = {
      id: 'stream-xyz',
      role: 'assistant',
      content: 'partial',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    }
    const target = resolveTargetForLateChunk([streaming], Date.now())
    expect(target).toBeNull()
  })

  it('ignores user messages when searching for the last assistant', () => {
    const msgs: ChatMessage[] = [
      makeFinalized('asst-1', 0.5),
      {
        id: 'user-2',
        role: 'user',
        content: 'Let\'s do both',
        timestamp: new Date().toISOString(),
      },
    ]
    // Last message is a user message; last *assistant* message was 0.5 s ago.
    const target = resolveTargetForLateChunk(msgs, Date.now())
    expect(target).toBe('asst-1')
  })
})

// ---------------------------------------------------------------------------
// loadHistory empty-response guard (Fix 1 — defensive demo cold-start fix)
// ---------------------------------------------------------------------------
//
// The guard lives inside useChat.ts:loadHistory. We replicate the decision
// logic here so regressions in the condition itself are caught without
// needing a full React hook render tree.

/**
 * Mirrors the Fix-1 guard in useChat.ts:loadHistory.
 * Returns true when the replace should be skipped (no-op).
 */
function shouldSkipEmptyHistoryReplace(
  rawCount: number,
  prevMsgCount: number,
): boolean {
  return rawCount === 0 && prevMsgCount > 0
}

describe('loadHistory empty-response guard', () => {
  it('skips replace when server returns empty and cache is non-empty', () => {
    expect(shouldSkipEmptyHistoryReplace(0, 3)).toBe(true)
  })

  it('does NOT skip when server returns msgs and cache is non-empty', () => {
    expect(shouldSkipEmptyHistoryReplace(2, 3)).toBe(false)
  })

  it('does NOT skip when server returns empty and cache is also empty', () => {
    // Legitimately empty session — first visit, nothing to protect.
    expect(shouldSkipEmptyHistoryReplace(0, 0)).toBe(false)
  })

  it('does NOT skip when server returns msgs and cache is empty', () => {
    expect(shouldSkipEmptyHistoryReplace(5, 0)).toBe(false)
  })

  it('preserves non-empty cache after seeding then empty loadHistory', () => {
    // Simulate: seedCache puts 2 msgs in prevMsgs, then loadHistory returns [].
    const prevMsgs: ChatMessage[] = [
      { id: 'm1', role: 'user', content: 'hello', timestamp: new Date().toISOString() },
      { id: 'm2', role: 'assistant', content: 'world', timestamp: new Date().toISOString() },
    ]
    const raw: ChatMessage[] = []
    const skip = shouldSkipEmptyHistoryReplace(raw.length, prevMsgs.length)
    expect(skip).toBe(true)
    // Simulate the actual cache update — because we skip, prevMsgs is unchanged.
    const resultCache = skip ? prevMsgs : raw
    expect(resultCache).toHaveLength(2)
    expect(resultCache[0]!.id).toBe('m1')
  })
})
