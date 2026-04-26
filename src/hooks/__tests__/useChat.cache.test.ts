/**
 * Logic-only tests for the session cache utilities in useChat.
 *
 * `evictOldestSessionCaches` and `mergeHistoryToolCalls` are module-private
 * so we replicate their logic here. These tests guard against regressions in
 * cache eviction ordering and tool call anchoring without a React render tree.
 */
import { describe, it, expect } from '@jest/globals'
import type { ChatMessage, ChatToolCall } from '@/types'
import type { HistoryToolCall } from '@/lib/openclaw/chat'

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
    const msg = msgs.find((m) => m.id === anchor)
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
      { toolCallId: 'tc-1', afterMessageId: 'msg-1', name: 'bash', args: {}, result: 'r1' },
      { toolCallId: 'tc-2', afterMessageId: 'msg-1', name: 'read_file', args: {}, result: 'r2' },
    ]
    const result = mergeHistoryToolCalls(messages, toolCalls)
    expect(result[0]!.toolCalls).toHaveLength(2)
  })

  it('skips tool calls without an afterMessageId', () => {
    const messages = [makeAssistantMsg('msg-1')]
    const toolCalls: HistoryToolCall[] = [
      { toolCallId: 'tc-1', afterMessageId: undefined, name: 'bash', args: {}, result: 'r' },
    ]
    const result = mergeHistoryToolCalls(messages, toolCalls)
    expect(result[0]!.toolCalls).toBeUndefined()
  })

  it('skips tool calls whose anchor is a user message', () => {
    const messages = [makeUserMsg('msg-1'), makeAssistantMsg('msg-2')]
    const toolCalls: HistoryToolCall[] = [
      { toolCallId: 'tc-1', afterMessageId: 'msg-1', name: 'bash', args: {}, result: 'r' },
    ]
    const result = mergeHistoryToolCalls(messages, toolCalls)
    expect(result[0]!.toolCalls).toBeUndefined()
    expect(result[1]!.toolCalls).toBeUndefined()
  })

  it('does not mutate the original messages array', () => {
    const original = makeAssistantMsg('msg-1')
    const messages = [original]
    const toolCalls: HistoryToolCall[] = [
      { toolCallId: 'tc-1', afterMessageId: 'msg-1', name: 'bash', args: {}, result: 'r' },
    ]
    mergeHistoryToolCalls(messages, toolCalls)
    expect(original.toolCalls).toBeUndefined()
  })

  it('handles anchor messages that are not in the array', () => {
    const messages = [makeAssistantMsg('msg-1')]
    const toolCalls: HistoryToolCall[] = [
      { toolCallId: 'tc-1', afterMessageId: 'non-existent', name: 'bash', args: {}, result: 'r' },
    ]
    const result = mergeHistoryToolCalls(messages, toolCalls)
    expect(result[0]!.toolCalls).toBeUndefined()
  })
})
