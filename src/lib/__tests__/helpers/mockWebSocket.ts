/**
 * MockWebSocket — lightweight WebSocketLike test double that replays the
 * OpenClaw gateway handshake and canned RPC responses without a real server.
 *
 * Handshake sequence (matches actual gateway protocol):
 *   1. Client calls connect() → factory called → MockWebSocket returned
 *   2. Client sets handlers (onopen, onerror, onclose, then onmessage last)
 *   3. Setting onmessage triggers the scheduled handshake
 *   4. MockWebSocket fires onopen → then delivers connect.challenge event
 *   5. Client calls performHandshake() → send() called with connect request
 *   6. MockWebSocket responds synchronously with hello-ok
 *   7. connect() promise resolves
 *
 * Key design: the handshake is scheduled from the `onmessage` setter (not
 * the constructor) because the client always assigns onmessage last inside
 * connect(). This avoids races where constructor microtasks fire before any
 * handlers are registered.
 */
import type { WebSocketLike, WebSocketFactory } from '../../openclaw/types'

export interface MockWebSocketHandle extends WebSocketLike {
  /** Seed a canned success response for a given RPC method. */
  queueResponse(method: string, payload: unknown): this
  /** Manually deliver a raw JSON frame to the client as if from the server. */
  deliver(frame: unknown): void
  /** Simulate the server closing the connection. */
  simulateClose(code?: number, reason?: string): void
  /** All frames sent by the client (parsed JSON). */
  sentFrames: unknown[]
}

class MockWebSocket implements MockWebSocketHandle {
  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3

  readyState = 1 // OPEN
  onopen: ((ev: any) => void) | null = null
  onclose: ((ev: any) => void) | null = null
  onerror: ((ev: any) => void) | null = null

  sentFrames: unknown[] = []
  private cannedResponses = new Map<string, unknown>()
  private _handshakeScheduled = false

  // `onmessage` uses a setter to trigger the handshake the first time it is
  // assigned a non-null value. The client always sets onmessage LAST in
  // connect(), so all four handlers are in place when microtasks run.
  private _onmessage: ((ev: any) => void) | null = null
  get onmessage(): ((ev: any) => void) | null { return this._onmessage }
  set onmessage(fn: ((ev: any) => void) | null) {
    this._onmessage = fn
    if (fn !== null && !this._handshakeScheduled) {
      this._handshakeScheduled = true
      Promise.resolve()
        .then(() => { this.onopen?.({ type: 'open' }) })
        .then(() => {
          this._deliver({
            type: 'event',
            event: 'connect.challenge',
            payload: { nonce: 'mock-test-nonce-abc123' },
          })
        })
    }
  }

  send(data: string): void {
    let frame: any
    try { frame = JSON.parse(data) } catch { return }
    this.sentFrames.push(frame)

    if (frame.type !== 'req') return

    if (frame.method === 'connect') {
      // Respond to the signed connect request with hello-ok
      this._deliver({
        type: 'res',
        id: frame.id,
        ok: true,
        payload: {
          type: 'hello-ok',
          runtimeVersion: 'v2026.3.11',
          policy: { tickIntervalMs: 30_000 },
        },
      })
      return
    }

    const canned = this.cannedResponses.get(frame.method)
    if (canned !== undefined) {
      this._deliver({ type: 'res', id: frame.id, ok: true, payload: canned })
    } else {
      // Default: succeed with null payload so callers don't hang
      this._deliver({ type: 'res', id: frame.id, ok: true, payload: null })
    }
  }

  close(): void {
    this.readyState = this.CLOSED
    const cb = this.onclose
    this.onclose = null
    cb?.({ wasClean: true, code: 1000, reason: '' })
  }

  queueResponse(method: string, payload: unknown): this {
    this.cannedResponses.set(method, payload)
    return this
  }

  deliver(frame: unknown): void {
    this._deliver(frame)
  }

  simulateClose(code = 1006, reason = 'Test-initiated close'): void {
    this.readyState = this.CLOSED
    this.onclose?.({ wasClean: false, code, reason })
  }

  private _deliver(frame: unknown): void {
    this._onmessage?.({ data: JSON.stringify(frame) })
  }
}

/**
 * Create a MockWebSocket and a factory that returns it when called.
 *
 * The factory is called inside `client.connect()`, which sets onmessage last —
 * that setter then triggers the gateway handshake as microtasks.
 *
 * You can call `mock.queueResponse(...)` before or after connect():
 * - Before: seed responses ahead of time
 * - After: not needed since responses are looked up at send() time
 *
 * Usage:
 * ```ts
 * const { mock, factory } = createMockWebSocket()
 * mock.queueResponse('sessions.list', [...])        // seed before connect
 * const client = new OpenClawClient('ws://test', '', 'token', factory)
 * await client.connect()
 * const sessions = await client.listSessions()
 * ```
 */
export function createMockWebSocket(): {
  mock: MockWebSocketHandle
  factory: WebSocketFactory
} {
  const mock = new MockWebSocket()
  const factory: WebSocketFactory = (_url: string) => mock
  return { mock, factory }
}
