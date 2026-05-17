/**
 * Logic-only tests for the streamId-based stream-interrupt routing in useChat.
 *
 * The actual handlers in useChat.ts are closure-scoped over refs, so we
 * replicate the decision logic here. Tests guard the four guarantees of the
 * stream-id refactor:
 *
 *  1. streamInterrupted with an unknown streamId is a no-op (does not flip any
 *     bubble, does not clear global streaming state).
 *  2. streamInterrupted with a bound streamId flips exactly the matching
 *     message — never any other streaming assistant bubble in the session.
 *  3. streamInterrupted does NOT clear global `isStreaming` / activity when
 *     the interrupted stream is not the active one (e.g. side-channel sub-
 *     agent interrupt while the main stream is alive).
 *  4. streamEnd clears the streamId → mid binding so the map cannot grow.
 */
import { describe, it, expect } from '@jest/globals'
import type { ChatMessage } from '@/types'

// ---------------------------------------------------------------------------
// Replicated logic (mirrors src/hooks/useChat.ts onStreamInterrupted/onStreamEnd)
// ---------------------------------------------------------------------------

interface InterruptState {
  streamIdToMid: Map<string, string>
  activeStreamMid: string | null
  isStreaming: boolean
}

interface InterruptResult {
  messages: ChatMessage[]
  state: InterruptState
  flipped: string[]
}

function closeAllParts(parts: NonNullable<ChatMessage['parts']>): NonNullable<ChatMessage['parts']> {
  return parts.map((p) => {
    if ((p.kind === 'thinking' || p.kind === 'tool') && p.completedAt === undefined) {
      return { ...p, completedAt: 9999 }
    }
    return p
  })
}

function onStreamInterrupted(
  messages: ChatMessage[],
  state: InterruptState,
  payload: { streamId?: string },
): InterruptResult {
  const flipped: string[] = []
  const targetMid = payload.streamId ? state.streamIdToMid.get(payload.streamId) : null
  if (!targetMid) {
    return { messages, state, flipped }
  }

  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
  const nextMessages = messages.map((m) => {
    if (m.id !== targetMid) return m
    flipped.push(m.id)
    return {
      ...m,
      isStreaming: false,
      interrupted: true,
      retryFromMessageId: lastUserMsg?.id,
      parts: m.parts ? closeAllParts(m.parts) : m.parts,
    }
  })

  const nextStreamIdToMid = new Map(state.streamIdToMid)
  if (payload.streamId) nextStreamIdToMid.delete(payload.streamId)

  const isActive = state.activeStreamMid === targetMid
  const nextState: InterruptState = {
    streamIdToMid: nextStreamIdToMid,
    activeStreamMid: isActive ? null : state.activeStreamMid,
    isStreaming: isActive ? false : state.isStreaming,
  }

  return { messages: nextMessages, state: nextState, flipped }
}

function onStreamEnd(state: InterruptState, payload: { streamId?: string }): InterruptState {
  if (!payload.streamId) return state
  const nextMap = new Map(state.streamIdToMid)
  nextMap.delete(payload.streamId)
  return { ...state, streamIdToMid: nextMap }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const t = (extra: Partial<ChatMessage>): ChatMessage => ({
  id: 'm',
  role: 'assistant',
  content: '',
  timestamp: new Date(0).toISOString(),
  ...extra,
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('onStreamInterrupted (streamId routing)', () => {
  it('is a no-op when streamId is unknown (no binding)', () => {
    const messages: ChatMessage[] = [
      t({ id: 'u-1', role: 'user', content: 'hi' }),
      t({ id: 'a-tool', role: 'assistant', isStreaming: true, parts: [{ kind: 'tool', id: 't1', name: 'x', status: 'pending', startedAt: 1 }] }),
      t({ id: 'a-main', role: 'assistant', isStreaming: true, content: 'mid-stream text' }),
    ]
    const state: InterruptState = {
      streamIdToMid: new Map(),
      activeStreamMid: 'a-main',
      isStreaming: true,
    }
    const res = onStreamInterrupted(messages, state, { streamId: 'phantom' })
    expect(res.flipped).toEqual([])
    expect(res.messages).toBe(messages)
    expect(res.state.isStreaming).toBe(true)
    expect(res.state.activeStreamMid).toBe('a-main')
  })

  it('is a no-op when payload omits streamId entirely', () => {
    const messages: ChatMessage[] = [
      t({ id: 'a-main', role: 'assistant', isStreaming: true }),
    ]
    const state: InterruptState = {
      streamIdToMid: new Map([['sid-1', 'a-main']]),
      activeStreamMid: 'a-main',
      isStreaming: true,
    }
    const res = onStreamInterrupted(messages, state, {})
    expect(res.flipped).toEqual([])
    expect(res.state.isStreaming).toBe(true)
  })

  it('flips exactly the bound message, leaves other streaming assistant bubbles alone', () => {
    // Repro: side-channel sub-agent ends while the *main* stream is still
    // producing content. Pre-refactor this clobbered the prior tool-call bubble
    // via the m.role === 'assistant' && m.isStreaming fallback.
    const messages: ChatMessage[] = [
      t({ id: 'u-1', role: 'user', content: 'hi' }),
      t({ id: 'a-tool', role: 'assistant', isStreaming: true, parts: [{ kind: 'tool', id: 't1', name: 'x', status: 'pending', startedAt: 1 }] }),
      t({ id: 'a-main', role: 'assistant', isStreaming: true, content: 'mid-stream' }),
    ]
    const state: InterruptState = {
      // Only the side stream is bound — the tool/main bubbles' mids are never
      // exposed via the map.
      streamIdToMid: new Map([['side-sid', 'a-side']]),
      activeStreamMid: 'a-main',
      isStreaming: true,
    }
    const res = onStreamInterrupted(messages, state, { streamId: 'side-sid' })
    // No matching message in the list → nothing flipped, but binding cleared.
    expect(res.flipped).toEqual([])
    const toolBubble = res.messages.find((m) => m.id === 'a-tool')!
    const mainBubble = res.messages.find((m) => m.id === 'a-main')!
    expect(toolBubble.isStreaming).toBe(true)
    expect(toolBubble.interrupted).toBeUndefined()
    expect(mainBubble.isStreaming).toBe(true)
    expect(mainBubble.interrupted).toBeUndefined()
    expect(res.state.streamIdToMid.has('side-sid')).toBe(false)
  })

  it('flips the bound placeholder when its streamId arrives (stuck-Thinking rescue)', () => {
    // The empty-agent-end path: chatAwaitingResponse bound streamId → placeholder,
    // server lifecycle ended with no content, synthetic streamInterrupted lands
    // on the bound mid.
    const messages: ChatMessage[] = [
      t({ id: 'u-1', role: 'user', content: 'hi' }),
      t({ id: 'a-ph', role: 'assistant', isStreaming: true, parts: [] }),
    ]
    const state: InterruptState = {
      streamIdToMid: new Map([['turn-1', 'a-ph']]),
      activeStreamMid: 'a-ph',
      isStreaming: true,
    }
    const res = onStreamInterrupted(messages, state, { streamId: 'turn-1' })
    expect(res.flipped).toEqual(['a-ph'])
    const ph = res.messages.find((m) => m.id === 'a-ph')!
    expect(ph.isStreaming).toBe(false)
    expect(ph.interrupted).toBe(true)
    expect(ph.retryFromMessageId).toBe('u-1')
    // Active stream's mid matched the target → global state cleared.
    expect(res.state.isStreaming).toBe(false)
    expect(res.state.activeStreamMid).toBe(null)
    expect(res.state.streamIdToMid.has('turn-1')).toBe(false)
  })

  it('does not clear global isStreaming when a non-active stream is interrupted', () => {
    const messages: ChatMessage[] = [
      t({ id: 'a-main', role: 'assistant', isStreaming: true }),
      t({ id: 'a-side', role: 'assistant', isStreaming: true }),
    ]
    const state: InterruptState = {
      streamIdToMid: new Map([
        ['main-sid', 'a-main'],
        ['side-sid', 'a-side'],
      ]),
      activeStreamMid: 'a-main',
      isStreaming: true,
    }
    const res = onStreamInterrupted(messages, state, { streamId: 'side-sid' })
    expect(res.flipped).toEqual(['a-side'])
    // Main bubble untouched.
    expect(res.messages.find((m) => m.id === 'a-main')!.isStreaming).toBe(true)
    // Global activity remains because the interrupted stream wasn't active.
    expect(res.state.isStreaming).toBe(true)
    expect(res.state.activeStreamMid).toBe('a-main')
    // Side binding cleared, main retained.
    expect(res.state.streamIdToMid.has('side-sid')).toBe(false)
    expect(res.state.streamIdToMid.get('main-sid')).toBe('a-main')
  })

  it('closes pending parts on the flipped bubble', () => {
    const messages: ChatMessage[] = [
      t({ id: 'u-1', role: 'user', content: 'hi' }),
      t({
        id: 'a-ph',
        role: 'assistant',
        isStreaming: true,
        parts: [
          { kind: 'thinking', id: 'th-1', text: 'pondering', startedAt: 1 },
          { kind: 'tool', id: 'tc-1', name: 'web', status: 'pending', startedAt: 1 },
        ],
      }),
    ]
    const state: InterruptState = {
      streamIdToMid: new Map([['turn-1', 'a-ph']]),
      activeStreamMid: 'a-ph',
      isStreaming: true,
    }
    const res = onStreamInterrupted(messages, state, { streamId: 'turn-1' })
    const ph = res.messages.find((m) => m.id === 'a-ph')!
    for (const p of ph.parts ?? []) {
      if (p.kind === 'thinking' || p.kind === 'tool') {
        expect(p.completedAt).toBeDefined()
      }
    }
  })
})

describe('onStreamEnd (streamId binding cleanup)', () => {
  it('clears the binding for the ended streamId', () => {
    const state: InterruptState = {
      streamIdToMid: new Map([
        ['sid-a', 'mid-a'],
        ['sid-b', 'mid-b'],
      ]),
      activeStreamMid: 'mid-a',
      isStreaming: true,
    }
    const next = onStreamEnd(state, { streamId: 'sid-a' })
    expect(next.streamIdToMid.has('sid-a')).toBe(false)
    expect(next.streamIdToMid.get('sid-b')).toBe('mid-b')
  })

  it('is a no-op when payload omits streamId', () => {
    const state: InterruptState = {
      streamIdToMid: new Map([['sid-a', 'mid-a']]),
      activeStreamMid: 'mid-a',
      isStreaming: true,
    }
    const next = onStreamEnd(state, {})
    expect(next.streamIdToMid.get('sid-a')).toBe('mid-a')
  })
})
