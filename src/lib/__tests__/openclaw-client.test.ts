import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { OpenClawClient } from '../openclaw'
import { createMockWebSocket } from './helpers/mockWebSocket'
import type { MockWebSocketHandle } from './helpers/mockWebSocket'

describe('OpenClawClient', () => {
  let client: OpenClawClient
  let mock: MockWebSocketHandle

  beforeEach(() => {
    const ws = createMockWebSocket()
    mock = ws.mock
    // Pass the factory so tests can optionally call connect() without a real server.
    // Tests that only invoke handleNotification() directly are unaffected.
    client = new OpenClawClient('ws://mock.local', 'test-token', 'token', ws.factory)
  })

  afterEach(() => {
    client.disconnect()
  })

  describe('constructor', () => {
    it('should create a client with the given URL', () => {
      expect(client).toBeDefined()
    })
  })

  describe('connect', () => {
    it('should connect to the WebSocket server', async () => {
      const connectedHandler = jest.fn()
      client.on('connected', connectedHandler)

      await client.connect()

      expect(connectedHandler).toHaveBeenCalled()
    })

    it('should emit connected with hello-ok payload', async () => {
      const connectedHandler = jest.fn()
      client.on('connected', connectedHandler)

      await client.connect()

      expect(connectedHandler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'hello-ok' })
      )
    })
  })

  describe('event handling', () => {
    it('should register and emit events', () => {
      const handler = jest.fn()
      client.on('test', handler)

      // @ts-expect-error - accessing private method for testing
      client.emit('test', 'data')

      expect(handler).toHaveBeenCalledWith('data')
    })

    it('should unregister events', () => {
      const handler = jest.fn()
      client.on('test', handler)
      client.off('test', handler)

      // @ts-expect-error - accessing private method for testing
      client.emit('test', 'data')

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('stream handling', () => {
    it('should stream chat deltas when chat stream is active', () => {
      const chunkHandler = jest.fn()
      client.on('streamChunk', chunkHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('chat', { state: 'delta', delta: 'chat-1' })
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('chat', { state: 'delta', delta: 'chat-1chat-2' })

      expect(chunkHandler).toHaveBeenCalledTimes(2)
      expect(chunkHandler).toHaveBeenNthCalledWith(1, expect.objectContaining({ text: 'chat-1' }))
      expect(chunkHandler).toHaveBeenNthCalledWith(2, expect.objectContaining({ text: 'chat-2' }))
    })

    it('should ignore chat deltas when agent stream claims first', () => {
      const chunkHandler = jest.fn()
      client.on('streamChunk', chunkHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', { stream: 'assistant', data: { delta: 'assistant-1' } })
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('chat', { state: 'delta', delta: 'chat-1' })
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', { stream: 'assistant', data: { delta: 'assistant-2' } })

      expect(chunkHandler).toHaveBeenCalledTimes(2)
      expect(chunkHandler).toHaveBeenNthCalledWith(1, expect.objectContaining({ text: 'assistant-1' }))
      expect(chunkHandler).toHaveBeenNthCalledWith(2, expect.objectContaining({ text: 'assistant-2' }))
    })

    it('should ignore agent deltas when chat stream claims first', () => {
      const chunkHandler = jest.fn()
      client.on('streamChunk', chunkHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('chat', { state: 'delta', delta: 'chat-1' })
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', { stream: 'assistant', data: { delta: 'assistant-1' } })
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('chat', { state: 'delta', delta: 'chat-1chat-2' })

      expect(chunkHandler).toHaveBeenCalledTimes(2)
      expect(chunkHandler).toHaveBeenNthCalledWith(1, expect.objectContaining({ text: 'chat-1' }))
      expect(chunkHandler).toHaveBeenNthCalledWith(2, expect.objectContaining({ text: 'chat-2' }))
    })

    it('should de-duplicate cumulative assistant chunks', () => {
      const chunkHandler = jest.fn()
      client.on('streamChunk', chunkHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', { stream: 'assistant', data: { delta: 'No' } })
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', { stream: 'assistant', data: { delta: 'No, I do not' } })
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', { stream: 'assistant', data: { delta: 'No, I do not' } })
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', { stream: 'assistant', data: { delta: 'No, I do not see it' } })

      expect(chunkHandler).toHaveBeenCalledTimes(3)
      expect(chunkHandler).toHaveBeenNthCalledWith(1, expect.objectContaining({ text: 'No' }))
      expect(chunkHandler).toHaveBeenNthCalledWith(2, expect.objectContaining({ text: ', I do not' }))
      expect(chunkHandler).toHaveBeenNthCalledWith(3, expect.objectContaining({ text: ' see it' }))
    })

    it('should accumulate text across content blocks on rewind', () => {
      const chunkHandler = jest.fn()
      client.on('streamChunk', chunkHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', { runId: 'r1', stream: 'assistant', data: { text: 'Hey! Just came online. Let me' } })
      // Simulate new content block (data.text resets after tool call)
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', { runId: 'r1', stream: 'assistant', data: { text: 'get my bearings real quick.' } })

      expect(chunkHandler).toHaveBeenCalledTimes(2)
      expect(chunkHandler).toHaveBeenNthCalledWith(1, expect.objectContaining({ text: 'Hey! Just came online. Let me' }))
      // New block text is appended with separator instead of replacing
      expect(chunkHandler).toHaveBeenNthCalledWith(2, expect.objectContaining({ text: '\n\nget my bearings real quick.' }))
    })

    it('should end on assistant lifecycle complete and skip duplicate chat final streamEnd', () => {
      const streamEndHandler = jest.fn()
      const messageHandler = jest.fn()
      client.on('streamEnd', streamEndHandler)
      client.on('message', messageHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', { stream: 'assistant', data: { delta: 'assistant-1' } })
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', { stream: 'lifecycle', data: { state: 'complete' } })
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('chat', {
        state: 'final',
        message: { id: 'msg-1', role: 'assistant', content: 'duplicate-final' }
      })

      // Lifecycle end fires streamEnd + resets state. Chat final arrives after reset,
      // sees activeStreamSource is null (not 'agent'), so it processes the message
      // but streamStarted is false so no duplicate streamEnd.
      expect(streamEndHandler).toHaveBeenCalledTimes(1)
      expect(messageHandler).toHaveBeenCalledTimes(1)
    })

    it('should still process chat final message when no stream was active', () => {
      const streamEndHandler = jest.fn()
      const messageHandler = jest.fn()
      client.on('streamEnd', streamEndHandler)
      client.on('message', messageHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('chat', {
        state: 'final',
        message: { id: 'msg-2', role: 'assistant', content: 'chat-only-final' }
      })

      // No stream was started, so streamEnd should not fire
      expect(streamEndHandler).toHaveBeenCalledTimes(0)
      // But the message should still be emitted
      expect(messageHandler).toHaveBeenCalledTimes(1)
      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'msg-2',
          role: 'assistant',
          content: 'chat-only-final'
        })
      )
    })

    it('should emit toolCall events for tool stream', () => {
      const toolCallHandler = jest.fn()
      client.on('toolCall', toolCallHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'tool',
        data: { toolCallId: 'tc-1', name: 'bash', phase: 'start' }
      })

      expect(toolCallHandler).toHaveBeenCalledTimes(1)
      expect(toolCallHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCallId: 'tc-1',
          name: 'bash',
          phase: 'start'
        })
      )
    })

    it('should emit toolCall with result for tool result phase', () => {
      const toolCallHandler = jest.fn()
      client.on('toolCall', toolCallHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'tool',
        data: { toolCallId: 'tc-2', name: 'read_file', phase: 'result', result: 'file contents here' }
      })

      expect(toolCallHandler).toHaveBeenCalledTimes(1)
      expect(toolCallHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCallId: 'tc-2',
          name: 'read_file',
          phase: 'result',
          result: 'file contents here'
        })
      )
    })

    it('should trigger streamStart on tool event if no stream started yet', () => {
      const streamStartHandler = jest.fn()
      client.on('streamStart', streamStartHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'tool',
        data: { toolCallId: 'tc-3', name: 'bash', phase: 'start' }
      })

      expect(streamStartHandler).toHaveBeenCalledTimes(1)
    })

    it('should not interfere with assistant stream source when tool events arrive', () => {
      const chunkHandler = jest.fn()
      const toolCallHandler = jest.fn()
      client.on('streamChunk', chunkHandler)
      client.on('toolCall', toolCallHandler)

      // Agent assistant claims the stream first
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', { stream: 'assistant', data: { delta: 'hello' } })
      // Tool event arrives mid-stream
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', { stream: 'tool', data: { toolCallId: 'tc-4', name: 'bash', phase: 'start' } })
      // More assistant text
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', { stream: 'assistant', data: { delta: 'hello world' } })

      // Tool event should still be emitted
      expect(toolCallHandler).toHaveBeenCalledTimes(1)
      // Assistant stream should not be disrupted
      expect(chunkHandler).toHaveBeenCalledTimes(2)
      expect(chunkHandler).toHaveBeenNthCalledWith(1, expect.objectContaining({ text: 'hello' }))
      expect(chunkHandler).toHaveBeenNthCalledWith(2, expect.objectContaining({ text: ' world' }))
    })

    it('should include sessionKey in streamChunk payloads', () => {
      const chunkHandler = jest.fn()
      client.on('streamChunk', chunkHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'sess-1',
        data: { delta: 'hello' }
      })

      expect(chunkHandler).toHaveBeenCalledTimes(1)
      expect(chunkHandler).toHaveBeenCalledWith({ text: 'hello', sessionKey: 'sess-1' })
    })
  })

  describe('per-session stream isolation', () => {
    it('should emit chunks only for the first session to produce text (activeStreamKey guard)', () => {
      // The activeStreamKey guard ensures that in a multi-agent send cycle only
      // the first session key to produce text emits streamChunk events to prevent
      // duplicate display. Other sessions accumulate text internally but don't emit.
      const chunkHandler = jest.fn()
      client.on('streamChunk', chunkHandler)

      client.setPrimarySessionKey('primary-session')

      // Primary session claims activeStreamKey
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'primary-session',
        data: { delta: 'primary text' }
      })

      // Other session: state tracked internally but chunk suppressed by activeStreamKey guard
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'other-session',
        data: { delta: 'other text' }
      })

      expect(chunkHandler).toHaveBeenCalledTimes(1)
      expect(chunkHandler).toHaveBeenCalledWith(expect.objectContaining({ text: 'primary text', sessionKey: 'primary-session' }))
    })

    it('should detect subagents from non-parent sessions', () => {
      const subagentHandler = jest.fn()
      client.on('subagentDetected', subagentHandler)

      client.setPrimarySessionKey('primary-session')

      // Event from primary session — not a subagent
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'primary-session',
        data: { delta: 'primary' }
      })

      // Event from unknown session — detected as subagent
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'subagent-session',
        data: { delta: 'subagent' }
      })

      expect(subagentHandler).toHaveBeenCalledTimes(1)
      expect(subagentHandler).toHaveBeenCalledWith({ sessionKey: 'subagent-session' })
    })

    it('should allow events without sessionKey to pass through (legacy fallback)', () => {
      const chunkHandler = jest.fn()
      client.on('streamChunk', chunkHandler)

      client.setPrimarySessionKey('primary-session')

      // Event with no sessionKey should still be processed (using default key)
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        data: { delta: 'legacy event' }
      })

      expect(chunkHandler).toHaveBeenCalledTimes(1)
      expect(chunkHandler).toHaveBeenCalledWith(expect.objectContaining({ text: 'legacy event' }))
    })

    it('should process all events when no primary session is set', () => {
      const chunkHandler = jest.fn()
      client.on('streamChunk', chunkHandler)

      // No primary session set — all events should pass through
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'any-session',
        data: { delta: 'some text' }
      })

      expect(chunkHandler).toHaveBeenCalledTimes(1)
    })

    it('should isolate per-session stream state so subagent does not corrupt parent', () => {
      // The parent session claims activeStreamKey first. The subagent session's
      // chunks are suppressed by the guard but its stream state is tracked
      // separately, so the parent's cumulative text remains intact.
      const chunkHandler = jest.fn()
      client.on('streamChunk', chunkHandler)

      client.setPrimarySessionKey('primary-session')

      // Parent session sends text — claims activeStreamKey
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'primary-session',
        runId: 'parent-run',
        data: { delta: 'hello from parent' }
      })

      // Subagent event — tracked internally but suppressed by activeStreamKey guard
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'subagent-session',
        runId: 'subagent-run',
        data: { delta: 'hello from subagent' }
      })

      // Parent continues — cumulative text still intact (subagent didn't corrupt it)
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'primary-session',
        runId: 'parent-run',
        data: { delta: 'hello from parent, continued' }
      })

      // 2 chunks from parent only; subagent is suppressed
      expect(chunkHandler).toHaveBeenCalledTimes(2)
      expect(chunkHandler).toHaveBeenNthCalledWith(1, expect.objectContaining({ text: 'hello from parent', sessionKey: 'primary-session' }))
      expect(chunkHandler).toHaveBeenNthCalledWith(2, expect.objectContaining({ text: ', continued', sessionKey: 'primary-session' }))
    })

    it('should process tool events from all sessions', () => {
      const toolCallHandler = jest.fn()
      client.on('toolCall', toolCallHandler)

      client.setPrimarySessionKey('primary-session')

      // Tool event from subagent — processed (per-session state)
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'tool',
        sessionKey: 'subagent-session',
        data: { toolCallId: 'tc-sub', name: 'bash', phase: 'start' }
      })

      // Tool event from primary session
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'tool',
        sessionKey: 'primary-session',
        data: { toolCallId: 'tc-primary', name: 'bash', phase: 'start' }
      })

      expect(toolCallHandler).toHaveBeenCalledTimes(2)
      expect(toolCallHandler).toHaveBeenNthCalledWith(1, expect.objectContaining({ toolCallId: 'tc-sub' }))
      expect(toolCallHandler).toHaveBeenNthCalledWith(2, expect.objectContaining({ toolCallId: 'tc-primary' }))
    })

    it('should process chat events with activeStreamKey guard (first session claims slot)', () => {
      // Chat events also go through the activeStreamKey guard.
      // The first session to produce text claims the slot; subsequent sessions
      // accumulate state internally but don't emit chunks.
      const chunkHandler = jest.fn()
      client.on('streamChunk', chunkHandler)

      client.setPrimarySessionKey('primary-session')

      // Chat delta from another session arrives first — claims activeStreamKey
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('chat', {
        state: 'delta',
        sessionKey: 'other-session',
        delta: 'other chat'
      })

      // Chat delta from primary session — suppressed (other-session already claimed slot)
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('chat', {
        state: 'delta',
        sessionKey: 'primary-session',
        delta: 'primary chat'
      })

      expect(chunkHandler).toHaveBeenCalledTimes(1)
      expect(chunkHandler).toHaveBeenCalledWith(expect.objectContaining({ text: 'other chat', sessionKey: 'other-session' }))
    })

    it('setPrimarySessionKey pre-seeding enables subagent detection', () => {
      // Both sessions get streamStart (ensureStream fires regardless of activeStreamKey).
      // Only the first session to produce text emits chunks (activeStreamKey guard).
      // Only the non-parent session triggers subagentDetected.
      const chunkHandler = jest.fn()
      const streamStartHandler = jest.fn()
      const subagentHandler = jest.fn()
      client.on('streamChunk', chunkHandler)
      client.on('streamStart', streamStartHandler)
      client.on('subagentDetected', subagentHandler)

      // Pre-seed before any events
      client.setPrimarySessionKey('my-session')

      // Event from another session — detected as subagent, claims activeStreamKey
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'other-session',
        data: { delta: 'other session text' }
      })
      // Event from primary session — streamStart fires, but chunk is suppressed
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'my-session',
        data: { delta: 'my session text' }
      })

      // streamStart fires independently for each session
      expect(streamStartHandler).toHaveBeenCalledTimes(2)
      // Only other-session emits a chunk (it claimed activeStreamKey first)
      expect(chunkHandler).toHaveBeenCalledTimes(1)
      expect(chunkHandler).toHaveBeenCalledWith(expect.objectContaining({ text: 'other session text', sessionKey: 'other-session' }))
      // Only other-session (non-parent) triggers subagent detection
      expect(subagentHandler).toHaveBeenCalledTimes(1)
      expect(subagentHandler).toHaveBeenCalledWith({ sessionKey: 'other-session' })
    })

    it('should support concurrent streams from multiple parent sessions without subagent detection', () => {
      // Both sessions are parent sessions (setPrimarySessionKey called for each).
      // The activeStreamKey guard means only the first session to produce text
      // emits chunks. Neither triggers subagentDetected since both are in the parent set.
      const chunkHandler = jest.fn()
      client.on('streamChunk', chunkHandler)

      // User sends to Session A, then Session B — both registered as parent sessions.
      // Each setPrimarySessionKey() call resets activeStreamKey so subsequent
      // send cycles aren't blocked by the previous session's claim.
      client.setPrimarySessionKey('session-a')
      client.setPrimarySessionKey('session-b') // also resets activeStreamKey

      const subagentHandler = jest.fn()
      client.on('subagentDetected', subagentHandler)

      // session-a event arrives first — claims activeStreamKey
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'session-a',
        data: { text: 'A part 1' }
      })
      // session-b event — suppressed by activeStreamKey guard (session-a claimed it)
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'session-b',
        data: { text: 'B part 1' }
      })
      // session-a continuation — cumulative text, append emitted
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'session-a',
        data: { text: 'A part 1A part 2' }
      })

      expect(chunkHandler).toHaveBeenCalledTimes(2)
      expect(chunkHandler).toHaveBeenNthCalledWith(1, expect.objectContaining({ text: 'A part 1', sessionKey: 'session-a' }))
      expect(chunkHandler).toHaveBeenNthCalledWith(2, expect.objectContaining({ text: 'A part 2', sessionKey: 'session-a' }))
      // No subagent detection for known parent sessions
      expect(subagentHandler).not.toHaveBeenCalled()
    })
  })

  describe('thinking stream handling', () => {
    it('should emit thinkingChunk for thinking stream events with cumulative text', () => {
      const thinkingHandler = jest.fn()
      client.on('thinkingChunk', thinkingHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'thinking',
        data: { text: 'Let me think about this...' }
      })

      expect(thinkingHandler).toHaveBeenCalledTimes(1)
      expect(thinkingHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Let me think about this...',
          cumulative: true
        })
      )
    })

    it('should emit thinkingChunk with delta text when no cumulative text', () => {
      const thinkingHandler = jest.fn()
      client.on('thinkingChunk', thinkingHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'thinking',
        data: { delta: 'thinking delta' }
      })

      expect(thinkingHandler).toHaveBeenCalledTimes(1)
      expect(thinkingHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'thinking delta',
          cumulative: false
        })
      )
    })

    it('should trigger streamStart on first thinking event', () => {
      const streamStartHandler = jest.fn()
      client.on('streamStart', streamStartHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'thinking',
        data: { text: 'Thinking...' }
      })

      expect(streamStartHandler).toHaveBeenCalledTimes(1)
    })

    it('should not emit thinkingChunk for empty thinking data', () => {
      const thinkingHandler = jest.fn()
      client.on('thinkingChunk', thinkingHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'thinking',
        data: {}
      })

      expect(thinkingHandler).not.toHaveBeenCalled()
    })

    it('should accumulate thinking across multiple cumulative events', () => {
      const thinkingHandler = jest.fn()
      client.on('thinkingChunk', thinkingHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'thinking',
        data: { text: 'Step 1' }
      })
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'thinking',
        data: { text: 'Step 1. Step 2' }
      })

      expect(thinkingHandler).toHaveBeenCalledTimes(2)
      expect(thinkingHandler).toHaveBeenNthCalledWith(1, expect.objectContaining({ text: 'Step 1', cumulative: true }))
      expect(thinkingHandler).toHaveBeenNthCalledWith(2, expect.objectContaining({ text: 'Step 1. Step 2', cumulative: true }))
    })
  })

  describe('compaction stream handling', () => {
    it('should emit compaction event with start phase', () => {
      const compactionHandler = jest.fn()
      client.on('compaction', compactionHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'compaction',
        data: { phase: 'start' }
      })

      expect(compactionHandler).toHaveBeenCalledTimes(1)
      expect(compactionHandler).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'start', willRetry: false })
      )
    })

    it('should emit compaction event with end phase and willRetry', () => {
      const compactionHandler = jest.fn()
      client.on('compaction', compactionHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'compaction',
        data: { phase: 'end', willRetry: true }
      })

      expect(compactionHandler).toHaveBeenCalledTimes(1)
      expect(compactionHandler).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'end', willRetry: true })
      )
    })

    it('should not trigger streamStart for compaction events', () => {
      const streamStartHandler = jest.fn()
      client.on('streamStart', streamStartHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'compaction',
        data: { phase: 'start' }
      })

      expect(streamStartHandler).not.toHaveBeenCalled()
    })
  })

  describe('listSessions', () => {
    it('should return sessions after connecting', async () => {
      mock.queueResponse('sessions.list', [
        { key: 'agent:main:session-1', title: 'First Chat', updatedAt: new Date().toISOString() },
        { key: 'agent:main:session-2', title: 'Second Chat', updatedAt: new Date().toISOString() },
      ])

      await client.connect()
      const sessions = await client.listSessions()

      expect(Array.isArray(sessions)).toBe(true)
      expect(sessions.length).toBeGreaterThan(0)
      expect(sessions[0]).toHaveProperty('id')
      expect(sessions[0]).toHaveProperty('title')
      const first = sessions[0]!
      expect(first.id).toBe(first.key)
    })
  })

  describe('listAgents', () => {
    it('should return agents after connecting', async () => {
      mock.queueResponse('agents.list', [
        { id: 'agent-1', name: 'Main Agent', status: 'active' },
        { id: 'agent-2', name: 'Code Agent', status: 'active' },
      ])

      await client.connect()
      const agents = await client.listAgents()

      expect(Array.isArray(agents)).toBe(true)
      expect(agents.length).toBeGreaterThan(0)
      expect(agents[0]).toHaveProperty('id')
      expect(agents[0]).toHaveProperty('name')
      expect(agents[0]).toHaveProperty('status')
    })
  })

  describe('listSkills', () => {
    it('should return skills after connecting', async () => {
      mock.queueResponse('skills.status', [
        { skillKey: 'skill-1', name: 'Web Search', triggers: ['search', 'web'], enabled: true },
      ])

      await client.connect()
      const skills = await client.listSkills()

      expect(Array.isArray(skills)).toBe(true)
      expect(skills.length).toBeGreaterThan(0)
      expect(skills[0]).toHaveProperty('id')
      expect(skills[0]).toHaveProperty('name')
      expect(skills[0]).toHaveProperty('triggers')
    })
  })

  describe('listCronJobs', () => {
    it('should return cron jobs after connecting', async () => {
      mock.queueResponse('cron.list', [
        { id: 'cron-1', name: 'Daily Summary', schedule: '0 9 * * *', status: 'active' },
      ])

      await client.connect()
      const cronJobs = await client.listCronJobs()

      expect(Array.isArray(cronJobs)).toBe(true)
      expect(cronJobs.length).toBeGreaterThan(0)
      expect(cronJobs[0]).toHaveProperty('id')
      expect(cronJobs[0]).toHaveProperty('name')
      expect(cronJobs[0]).toHaveProperty('schedule')
      expect(cronJobs[0]).toHaveProperty('status')
    })
  })

  describe('createSession', () => {
    it('should create a new session', async () => {
      const session = await client.createSession()

      expect(session).toHaveProperty('id')
      expect(session).toHaveProperty('title')
      expect(session.title).toBe('New Chat')
    })

    it('should create a session with an agent', async () => {
      const session = await client.createSession('claude')

      expect(session).toHaveProperty('agentId')
      expect(session.agentId).toBe('claude')
    })
  })

  describe('sendMessage', () => {
    it('should include sessionKey when sessionId is provided', async () => {
      // sendMessage delegates to chatApi which calls _call (private). Spy on
      // the private _call so we intercept the actual RPC without a live server.
      const callSpy = jest
        .spyOn(client as any, '_call')
        .mockResolvedValue({ sessionKey: 'server-session-1' })

      await client.sendMessage({
        sessionId: 'session-123',
        content: 'hello'
      })

      expect(callSpy).toHaveBeenCalledTimes(1)
      const payload = callSpy.mock.calls[0]![1]
      expect(payload).toHaveProperty('sessionKey', 'session-123')
      expect(payload).toHaveProperty('message', 'hello')
    })

    it('should use default sessionKey when sessionId is not provided', async () => {
      const callSpy = jest
        .spyOn(client as any, '_call')
        .mockResolvedValue({ sessionKey: 'server-session-2' })

      await client.sendMessage({
        content: 'new chat'
      })

      expect(callSpy).toHaveBeenCalledTimes(1)
      const payload = callSpy.mock.calls[0]![1]
      // chat.ts always sends a sessionKey, defaulting to 'agent:main:main'
      expect(payload).toHaveProperty('sessionKey', 'agent:main:main')
      expect(payload).toHaveProperty('message', 'new chat')
    })
  })

  describe('disconnect', () => {
    it('should close the WebSocket connection', async () => {
      const disconnectedHandler = jest.fn()
      client.on('disconnected', disconnectedHandler)

      await client.connect()
      client.disconnect()

      expect(mock.readyState).toBe(mock.CLOSED)
    })

    it('should suppress reconnect after explicit disconnect', async () => {
      await client.connect()
      client.disconnect()

      // maxReconnectAttempts is set to 0 — no further connect() calls should happen
      const connectedHandler = jest.fn()
      client.on('connected', connectedHandler)

      // Simulate a server close after our disconnect — should not reconnect
      // (maxReconnectAttempts is already 0)
      expect(connectedHandler).not.toHaveBeenCalled()
    })
  })

  describe('resetSession', () => {
    it('clears ss.finalized so post-reset startup greeting streams through', async () => {
      // Simulate a completed turn: agent assistant text arrives, then chat:final
      // finalizes the session stream (sets ss.finalized = true).
      client.setPrimarySessionKey('agent:main:session-1')
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'agent:main:session-1',
        data: { delta: 'hello world' },
      })
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('chat', {
        state: 'final',
        sessionKey: 'agent:main:session-1',
        message: {
          id: 'msg-1',
          role: 'assistant',
          content: 'hello world',
          timestamp: Date.now(),
        },
      })

      // Verify that the finalized guard is now active: a new assistant chunk
      // must be suppressed before resetSession is called.
      const chunkHandlerBefore = jest.fn()
      client.on('streamChunk', chunkHandlerBefore)
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'agent:main:session-1',
        data: { delta: 'should be suppressed' },
      })
      expect(chunkHandlerBefore).not.toHaveBeenCalled()
      client.off('streamChunk', chunkHandlerBefore)

      // Reset the session — the RPC resolves with null (mock default) and
      // the stream state for the session key is cleared.
      await client.connect()
      await client.resetSession('agent:main:session-1')

      // Now the gateway's post-reset startup greeting should stream through.
      const chunkHandlerAfter = jest.fn()
      client.on('streamChunk', chunkHandlerAfter)
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'agent:main:session-1',
        data: { delta: 'Welcome back!' },
      })
      expect(chunkHandlerAfter).toHaveBeenCalledTimes(1)
      expect(chunkHandlerAfter).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Welcome back!', sessionKey: 'agent:main:session-1' })
      )
    })

    it('resets activeStreamKey so the greeting can claim the stream slot', async () => {
      // Start a turn that claims activeStreamKey, then finalize.
      client.setPrimarySessionKey('agent:main:session-2')
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'agent:main:session-2',
        data: { delta: 'prior turn text' },
      })
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('chat', {
        state: 'final',
        sessionKey: 'agent:main:session-2',
        message: {
          id: 'msg-2',
          role: 'assistant',
          content: 'prior turn text',
          timestamp: Date.now(),
        },
      })

      await client.connect()
      await client.resetSession('agent:main:session-2')

      const chunkHandler = jest.fn()
      const streamStartHandler = jest.fn()
      client.on('streamChunk', chunkHandler)
      client.on('streamStart', streamStartHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'agent:main:session-2',
        data: { delta: 'post-reset greeting' },
      })

      expect(streamStartHandler).toHaveBeenCalledTimes(1)
      expect(chunkHandler).toHaveBeenCalledTimes(1)
      expect(chunkHandler).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'post-reset greeting' })
      )
    })

    it('allows greeting events that arrive DURING the sessions.reset RPC (interleaved)', async () => {
      // Regression for: gateway streams startup greeting before responding to
      // sessions.reset. With the pre-RPC clear, ss.finalized is false when the
      // events arrive so they are not suppressed.
      client.setPrimarySessionKey('agent:main:session-3')

      // Simulate a completed turn (sets ss.finalized = true on session-3)
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'agent:main:session-3',
        data: { delta: 'prior turn' },
      })
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('chat', {
        state: 'final',
        sessionKey: 'agent:main:session-3',
        message: {
          id: 'msg-3',
          role: 'assistant',
          content: 'prior turn',
          timestamp: Date.now(),
        },
      })

      await client.connect()

      // Intercept sessions.reset: capture frame id but defer delivering the
      // response so we can inject gateway events while the RPC is still pending.
      let pendingResetFrameId: string | undefined
      const originalSend = mock.send.bind(mock)
      mock.send = (data: string): void => {
        let frame: any
        try { frame = JSON.parse(data) } catch { return }
        if (frame.method === 'sessions.reset') {
          pendingResetFrameId = frame.id
          // Do NOT deliver the response yet — simulate network latency
          return
        }
        originalSend(data)
      }

      const chunkHandler = jest.fn()
      client.on('streamChunk', chunkHandler)

      // Begin the reset — it will hang until we release the response below.
      const resetPromise = client.resetSession('agent:main:session-3')

      // Gateway streams the startup greeting WHILE the RPC is still in-flight.
      // Before the fix this would hit ss.finalized=true and be silently dropped.
      // After the fix the stream state is already cleared, so it flows through.
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'agent:main:session-3',
        data: { delta: 'interleaved greeting' },
      })

      expect(chunkHandler).toHaveBeenCalledTimes(1)
      expect(chunkHandler).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'interleaved greeting', sessionKey: 'agent:main:session-3' })
      )

      // Release the pending RPC response so resetSession resolves cleanly.
      mock.deliver({ type: 'res', id: pendingResetFrameId, ok: true, payload: null })
      await resetPromise
    })

    it('restores stream state when the sessions.reset RPC fails', async () => {
      // Regression: if the reset RPC is rejected (e.g. gateway error), the
      // optimistic stream-state clear should be rolled back so the prior turn's
      // ss.finalized guard still suppresses stale agent events.
      client.setPrimarySessionKey('agent:main:session-4')

      // Simulate a completed turn (sets ss.finalized = true)
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'agent:main:session-4',
        data: { delta: 'prior turn' },
      })
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('chat', {
        state: 'final',
        sessionKey: 'agent:main:session-4',
        message: {
          id: 'msg-4',
          role: 'assistant',
          content: 'prior turn',
          timestamp: Date.now(),
        },
      })

      await client.connect()

      // Intercept sessions.reset and reply with an error so the RPC throws.
      const originalSend2 = mock.send.bind(mock)
      mock.send = (data: string): void => {
        let frame: any
        try { frame = JSON.parse(data) } catch { return }
        if (frame.method === 'sessions.reset') {
          mock.deliver({
            type: 'res',
            id: frame.id,
            ok: false,
            error: { message: 'gateway reset rejected' },
          })
          return
        }
        originalSend2(data)
      }

      await expect(client.resetSession('agent:main:session-4')).rejects.toThrow('gateway reset rejected')

      // State should be restored: ss.finalized is still true, so a new agent
      // event for the same session key must be suppressed.
      const chunkHandler = jest.fn()
      client.on('streamChunk', chunkHandler)
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'assistant',
        sessionKey: 'agent:main:session-4',
        data: { delta: 'should still be suppressed after failed reset' },
      })
      expect(chunkHandler).not.toHaveBeenCalled()
    })
  })

  describe('document media routing (details.media type=document)', () => {
    it('routes document entries into files[] not images[] on chat:final event', () => {
      const messageHandler = jest.fn()
      client.on('message', messageHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('chat', {
        state: 'final',
        message: { id: 'msg-doc-1', role: 'assistant', content: 'Here is your report.' },
        details: {
          media: [
            { type: 'document', url: '/tmp/report.pdf', mimeType: 'application/pdf', fileName: 'report.pdf' },
          ],
        },
      })

      expect(messageHandler).toHaveBeenCalledTimes(1)
      const emitted = messageHandler.mock.calls[0][0]
      // files[] should contain the document
      expect(emitted.files).toHaveLength(1)
      expect(emitted.files[0]).toMatchObject({ name: 'report.pdf', mimeType: 'application/pdf' })
      // images[] should NOT contain the document
      const imageUrls = (emitted.images ?? []).map((img: { url: string }) => img.url)
      expect(imageUrls.every((u: string) => !u.includes('report.pdf'))).toBe(true)
    })

    it('routes document entries into files[] not images[] on lifecycle event', () => {
      const messageHandler = jest.fn()
      client.on('message', messageHandler)

      // Start then end an agent stream so lifecycle processing fires
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', { stream: 'assistant', data: { delta: 'Generating...' } })
      // @ts-expect-error - accessing private method for testing
      client.handleNotification('agent', {
        stream: 'lifecycle',
        data: { state: 'complete' },
        details: {
          media: [
            { type: 'document', url: '/tmp/output.csv', mimeType: 'text/csv', fileName: 'output.csv' },
          ],
        },
      })

      // May emit multiple messages (the stream text + the lifecycle media message)
      const allCalls = messageHandler.mock.calls.map((c) => c[0])
      const mediaMsg = allCalls.find((m: { files?: unknown[] }) => m.files && m.files.length > 0)
      expect(mediaMsg).toBeDefined()
      expect(mediaMsg.files[0]).toMatchObject({ name: 'output.csv', mimeType: 'text/csv' })
      // The document must NOT appear in images[]
      const allImages = allCalls.flatMap((m: { images?: { url: string }[] }) => m.images ?? [])
      expect(allImages.every((img: { url: string }) => !img.url.includes('output.csv'))).toBe(true)
    })

    it('keeps image media entries in images[], separate from documents on chat:final', () => {
      const messageHandler = jest.fn()
      client.on('message', messageHandler)

      // @ts-expect-error - accessing private method for testing
      client.handleNotification('chat', {
        state: 'final',
        message: { id: 'msg-mixed-1', role: 'assistant', content: 'Here is a screenshot and a report.' },
        details: {
          media: [
            { type: 'image', url: '/tmp/screenshot.png', mimeType: 'image/png' },
            { type: 'document', url: '/tmp/notes.txt', mimeType: 'text/plain', fileName: 'notes.txt' },
          ],
        },
      })

      expect(messageHandler).toHaveBeenCalledTimes(1)
      const emitted = messageHandler.mock.calls[0][0]
      expect(emitted.images).toHaveLength(1)
      expect(emitted.files).toHaveLength(1)
      expect(emitted.files[0].name).toBe('notes.txt')
    })
  })
})
