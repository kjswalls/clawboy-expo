// OpenClaw Client - Core Connection, Events, and Streaming

import { ClawError } from '../errors'
import { debugIngest } from '../debugIngest'
import type {
  Session, Agent, Skill, CronJob, Node,
  RequestFrame, ResponseFrame, EventFrame, EventHandler,
  WebSocketLike, WebSocketFactory
} from './types'
import type { DeviceIdentity, DeviceConnectField } from '../device-identity'
import { signChallenge } from '../device-identity'
import { APP_NAME, APP_VERSION, OPENCLAW_CLIENT_ID, OPENCLAW_CLIENT_MODE } from '../appMeta'
import { getPlatform } from '../platform'
import { stripAnsi, stripModelSpecialTokens, extractToolResultText, extractTextFromContent, extractImagesFromContent, isHeartbeatContent, isNoiseContent, stripSystemNotifications, parseMediaTokens, classifyMediaUrls } from './utils'
import * as sessionsApi from './sessions'
import * as chatApi from './chat'
import * as agentsApi from './agents'
import * as skillsApi from './skills'
import * as cronApi from './cron-jobs'
import * as configApi from './config'
import * as commandsApi from './commands'
import * as hooksApi from './hooks'
import * as featuresApi from './features'
import * as nodesApi from './nodes'
import * as logsApi from './logs'

/** Matches internal system sessions that should never be treated as subagents. */
const SYSTEM_SESSION_RE = /^agent:[^:]+:(main|cron)(:|$)/

/** Per-session stream accumulation state. */
interface SessionStreamState {
  source: 'chat' | 'agent' | null
  text: string
  mode: 'delta' | 'cumulative' | null
  blockOffset: number
  started: boolean
  runId: string | null
  /** Raw MEDIA: lines stripped during streaming, preserved for lifecycle-end extraction. */
  mediaLines: string[]
  /** Pre-parsed media URLs from server (data.mediaUrls in agent:assistant events). */
  serverMediaUrls: string[]
  /** Set when chat:final has been processed — suppresses late-arriving agent events. */
  finalized: boolean
}

function createSessionStream(): SessionStreamState {
  return { source: null, text: '', mode: null, blockOffset: 0, started: false, runId: null, mediaLines: [], serverMediaUrls: [], finalized: false }
}

export class OpenClawClient {
  private ws: WebSocketLike | null = null
  private wsFactory: WebSocketFactory | null
  private url: string
  private token: string
  private authMode: 'token' | 'password'
  private requestId = 0
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }>()
  private eventHandlers = new Map<string, Set<EventHandler>>()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 20
  private static readonly DEFAULT_MAX_RECONNECT_ATTEMPTS = 20
  private authenticated = false
  private deviceIdentity: DeviceIdentity | null = null
  private deviceName: string | null = null
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null
  private static HEALTH_CHECK_INTERVAL = 15000 // 15s
  private static HEALTH_CHECK_TIMEOUT = 10000  // 10s
  /** Timestamp of last received WebSocket message — used to skip redundant health checks. */
  private lastMessageAt = 0
  /** Server tick interval (from hello-ok policy), default 30s. */
  private tickIntervalMs = 30000
  /** Server runtime version from hello-ok payload (v2026.3.11). */
  public serverVersion: string | null = null
  /** Minimum client semver required by this server, from hello-ok policy. */
  public minClientVersion: string | null = null
  /** Watchdog timer that detects missed server ticks (dead connection). */
  private tickWatchTimer: ReturnType<typeof setTimeout> | null = null
  /** Timestamp of the last received server tick event. */
  private lastTickAt = 0
  /** When true, suppresses reconnect (auth failures, cert errors, etc.) */
  private suppressReconnect = false
  /** Track whether certError has been emitted this connect cycle */
  private certErrorEmitted = false
  /** Timer ID for pending reconnect attempt (so disconnect() can cancel it). */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  // Per-session stream tracking — allows concurrent agent conversations
  // without cross-contaminating stream text buffers.
  private sessionStreams = new Map<string, SessionStreamState>()
  // Set of session keys that the user has actively sent messages to.
  // Used for subagent detection: events from unknown sessions are subagents.
  private parentSessionKeys = new Set<string>()
  // The session key for the most recent user send (fallback for events without sessionKey).
  private defaultSessionKey: string | null = null
  // Guards against emitting duplicate streamSessionKey events per send cycle.
  private sessionKeyResolved = false
  // The session key that is actively producing text chunks for the current
  // send cycle. Once a session key claims the "active stream" slot, events
  // from OTHER session keys are still processed internally (their stream
  // state accumulates) but their streamChunk emissions are suppressed so
  // only one stream writes to the main chat placeholder.
  private activeStreamKey: string | null = null

  constructor(url: string, token: string = '', authMode: 'token' | 'password' = 'token', wsFactory?: WebSocketFactory, deviceIdentity?: DeviceIdentity | null, deviceName?: string) {
    this.url = url
    this.token = token
    this.authMode = authMode
    this.wsFactory = wsFactory || null
    this.deviceIdentity = deviceIdentity || null
    this.deviceName = deviceName || null
  }

  // Event handling
  on(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
    }
    this.eventHandlers.get(event)!.add(handler)
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        this.eventHandlers.delete(event)
      }
    }
  }

  private emit(event: string, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(event)
    handlers?.forEach((handler) => {
      try {
        handler(...args)
      } catch {
        // Event handler error - silently ignore
      }
    })
  }

  // Connection management
  connect(): Promise<void> {
    // Restore reconnect attempts (may have been zeroed by disconnect())
    this.maxReconnectAttempts = OpenClawClient.DEFAULT_MAX_RECONNECT_ATTEMPTS
    this.reconnectAttempts = 0
    return new Promise((resolve, reject) => {
      let settled = false
      const settle = (fn: typeof resolve | typeof reject, value?: any) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        fn(value)
      }

      // 15-second timeout to prevent hanging on unreachable servers
      const timeout = setTimeout(() => {
        settle(reject, new Error('Connection timed out — server may be unreachable'))
        this.ws?.close()
      }, 15_000)

      try {
        console.log('[OpenClaw] connect()')
        this.ws = this.wsFactory ? this.wsFactory(this.url) : new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log('[OpenClaw] socket open')
          this.reconnectAttempts = 0
          this.suppressReconnect = false
          this.certErrorEmitted = false
        }

        // Stores the onerror event so onclose can build a richer message from
        // the close code + reason (which arrive only in the onclose event).
        let onerrorEvent: any = null

        this.ws.onerror = (error: any) => {
          const errorMsg = error?.message || ''
          console.warn('[OpenClaw] ws.onerror', {
            readyState: this.ws?.readyState,
            message: errorMsg,
            isTLSError: error?.isTLSError,
            code: error?.code,
            type: error?.type,
          })

          // Check for TLS certificate errors:
          // 1. Native iOS WebSocket tags TLS errors with 'TLS_CERTIFICATE_ERROR:' prefix
          // 2. For browser WebSocket, we can only guess based on wss:// + immediate close
          const isTLSError = error?.isTLSError === true
          const isBrowserCertGuess = !this.wsFactory &&
            this.url.startsWith('wss://') &&
            this.ws?.readyState === WebSocket.CLOSED

          if (isTLSError || isBrowserCertGuess) {
            try {
              const urlObj = new URL(this.url)
              const httpsUrl = `https://${urlObj.host}`
              if (!this.certErrorEmitted) {
                this.certErrorEmitted = true
                this.emit('certError', { url: this.url, httpsUrl })
              }
              // Don't settle here — let onclose fire so attemptReconnect can run.
              return
            } catch {
              // URL parsing failed, fall through
            }
          }

          // Store the event but don't settle yet. onclose always fires after onerror
          // and carries the close code + human-readable reason (e.g. "Connection refused").
          onerrorEvent = error
          this.emit('error', error)
        }

        this.ws.onclose = (event: any) => {
          const closeReason: string = event?.reason || ''
          const closeCode: number | undefined = event?.code
          console.warn('[OpenClaw] ws.onclose', {
            code: closeCode,
            reason: closeReason,
            wasClean: event?.wasClean,
            authenticated: this.authenticated,
          })
          debugIngest(() => {
            const activeStreams: Array<{ sk: string; started: boolean }> = []
            for (const [sk, ss] of this.sessionStreams) activeStreams.push({ sk, started: ss.started })
            return { hypothesisId: 'H1,H3,H5', location: 'client.ts:ws.onclose', message: 'WebSocket onclose fired', data: { code: closeCode, reason: closeReason, wasClean: event?.wasClean, authenticated: this.authenticated, activeStreams, willEmitInterrupted: activeStreams.some(s => s.started) } }
          })
          this.authenticated = false
          this.stopHealthCheck()
          this.stopTickWatch()
          // Emit synthetic streamEnd + streamInterrupted for any active streams so
          // UI doesn't stay stuck and can offer a retry affordance.
          for (const [sessionKey, ss] of this.sessionStreams) {
            if (ss.started) {
              this.emit('streamInterrupted', { sessionKey })
              this.emit('streamEnd', { sessionKey })
            }
          }
          this.resetStreamState()
          // Reject all in-flight RPC requests so callers don't hang for 30s
          this.rejectPendingRequests('Connection lost')
          this.emit('disconnected')

          // Build the most informative error message available:
          // - If onerror fired, prefer the close reason (it's human-readable on iOS,
          //   e.g. "Connection refused") over the generic onerror message.
          // - If no onerror, this is a clean-ish close before handshake completed.
          let rejectMsg: string
          if (onerrorEvent !== null) {
            rejectMsg = closeReason || onerrorEvent?.message || 'WebSocket connection failed'
          } else {
            rejectMsg = 'WebSocket closed before handshake completed'
          }
          settle(reject, new Error(rejectMsg))
          this.attemptReconnect()
        }

        this.ws.onmessage = (event) => {
          const incoming = (event as MessageEvent).data
          if (typeof incoming === 'string') {
            this.handleMessage(incoming, (...a) => settle(resolve, ...a), (...a) => settle(reject, ...a))
            return
          }

          // Some runtimes deliver WebSocket frames as Blob/ArrayBuffer.
          if (incoming instanceof Blob) {
            incoming.text().then((text) => {
              this.handleMessage(text, (...a) => settle(resolve, ...a), (...a) => settle(reject, ...a))
            }).catch((err) => {
              settle(reject, new Error(`Failed to decode Blob frame: ${err}`))
            })
            return
          }

          if (incoming instanceof ArrayBuffer) {
            try {
              const text = new TextDecoder().decode(new Uint8Array(incoming))
              this.handleMessage(text, (...a) => settle(resolve, ...a), (...a) => settle(reject, ...a))
            } catch (err) {
              settle(reject, new Error(`Failed to decode ArrayBuffer frame: ${err}`))
            }
            return
          }

          // Unknown frame type; ignore.
        }
      } catch (error) {
        settle(reject, error)
      }
    })
  }

  private attemptReconnect(): void {
    // Don't reconnect after auth failures, cert errors, etc.
    if (this.suppressReconnect) {
      this.emit('reconnectExhausted')
      return
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnectExhausted')
      return
    }

    this.reconnectAttempts++
    // Exponential backoff: 1s, 2s, 4s, 8s... capped at 30s, with ±25% jitter
    const base = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000)
    const jitter = base * 0.25 * (Math.random() * 2 - 1) // ±25%
    const delay = Math.round(base + jitter)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect().catch((err) => {
        console.warn(`[OpenClaw] Reconnect attempt ${this.reconnectAttempts} failed:`, err?.message || err)
      })
    }, delay)
  }

  disconnect(): void {
    this.maxReconnectAttempts = 0 // Prevent auto-reconnect on this connection
    // Cancel any pending reconnect timer to prevent zombie reconnections
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.stopHealthCheck()
    this.stopTickWatch()
    // Emit synthetic streamEnd for any active streams so the UI doesn't stay stuck
    for (const [sessionKey, ss] of this.sessionStreams) {
      if (ss.started) {
        this.emit('streamEnd', { sessionKey })
      }
    }
    if (this.ws) {
      // Null out handlers BEFORE close() so the socket stops processing
      // messages immediately. ws.close() is async — without this, events
      // arriving during the CLOSING state still trigger handleMessage.
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
    }
    this.ws = null
    this.authenticated = false
    this.resetStreamState()
  }

  /** Periodic health check to detect half-open (silently dead) connections. */
  private startHealthCheck(): void {
    this.stopHealthCheck()
    this.healthCheckTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== this.ws.OPEN || !this.authenticated) return

      // Skip health check if we received a message recently (connection is alive)
      if (Date.now() - this.lastMessageAt < OpenClawClient.HEALTH_CHECK_INTERVAL) return

      const id = (++this.requestId).toString()
      const request = { type: 'req', method: 'skills.status', params: {}, id }
      let resolved = false

      const timeout = setTimeout(() => {
        if (resolved) return
        resolved = true
        this.pendingRequests.delete(id)
        // Health check timed out — connection is dead, force close to trigger reconnect
        if (this.ws) {
          this.ws.onmessage = null
          this.ws.close()
        }
      }, OpenClawClient.HEALTH_CHECK_TIMEOUT)

      this.pendingRequests.set(id, {
        resolve: () => { if (!resolved) { resolved = true; clearTimeout(timeout) } },
        reject: () => { if (!resolved) { resolved = true; clearTimeout(timeout) } }
      })

      try {
        this.ws.send(JSON.stringify(request))
      } catch {
        // Send failed — socket is dead
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          this.pendingRequests.delete(id)
          if (this.ws) this.ws.close()
        }
      }
    }, OpenClawClient.HEALTH_CHECK_INTERVAL)
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  /** Reset the tick watchdog — called whenever we receive a server tick event. */
  private resetTickWatch(): void {
    if (this.tickWatchTimer) clearTimeout(this.tickWatchTimer)
    // If no tick arrives within 2× the interval, the connection is likely dead
    this.tickWatchTimer = setTimeout(() => {
      this.tickWatchTimer = null
      if (this.ws && this.ws.readyState === this.ws.OPEN) {
        // Force close — onclose will trigger reconnect
        this.ws.onmessage = null
        this.ws.close()
      }
    }, this.tickIntervalMs * 2)
  }

  private stopTickWatch(): void {
    if (this.tickWatchTimer) {
      clearTimeout(this.tickWatchTimer)
      this.tickWatchTimer = null
    }
  }

  /** Reject all pending RPC requests (e.g. on socket close) so callers don't hang. */
  private rejectPendingRequests(reason: string): void {
    const pending = Array.from(this.pendingRequests.entries())
    this.pendingRequests.clear()
    for (const [, { reject }] of pending) {
      try { reject(new Error(reason)) } catch { /* ignore */ }
    }
  }

  private async performHandshake(nonce?: string): Promise<void> {
    const id = (++this.requestId).toString()
    const scopes = ['operator.read', 'operator.write', 'operator.admin', 'operator.approvals']

    // Sign the challenge if we have a device identity and nonce
    let device: DeviceConnectField | undefined
    if (this.deviceIdentity && nonce) {
      try {
        device = await signChallenge(this.deviceIdentity, nonce, this.token, scopes)
      } catch (err) {
        // Device challenge signing failed — connect without device identity
      }
    }

    const connectMsg: RequestFrame = {
      type: 'req',
      id,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        role: 'operator',
        scopes,
        client: {
          id: OPENCLAW_CLIENT_ID,
          displayName: this.deviceName || APP_NAME,
          version: APP_VERSION,
          platform: getPlatform(),
          mode: OPENCLAW_CLIENT_MODE
        },
        caps: ['tool-events', 'thinking-events', 'plugin-approvals'],
        auth: this.token
          ? (this.authMode === 'password' ? { password: this.token } : { token: this.token })
          : undefined,
        device
      }
    }

    this.ws?.send(JSON.stringify(connectMsg))
  }

  // RPC methods
  private async _call<T>(method: string, params?: any, options?: { timeoutMs?: number }): Promise<T> {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) {
      throw new ClawError('not_connected')
    }

    const id = (++this.requestId).toString()
    const request: RequestFrame = {
      type: 'req',
      method,
      params,
      id
    }

    const timeoutMs = options?.timeoutMs || 30000

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject
      })

      this.ws!.send(JSON.stringify(request))

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new ClawError('request_timeout', { method }))
        }
      }, timeoutMs)
    })
  }

  private handleMessage(data: string, resolve?: () => void, reject?: (err: Error) => void): void {
    this.lastMessageAt = Date.now()
    try {
      const message = JSON.parse(data)

      // 1. Handle Events
      if (message.type === 'event') {
        const eventFrame = message as EventFrame

        // Special case: Handshake Challenge
        if (eventFrame.event === 'connect.challenge') {
          console.log('[OpenClaw] received connect.challenge — signing and sending connect')
          this.performHandshake(eventFrame.payload?.nonce).catch((err) => {
            console.error('[OpenClaw] Handshake challenge signing failed:', err?.message || err)
            reject?.(err)
          })
          return
        }

        this.handleNotification(eventFrame.event, eventFrame.payload)
        return
      }

      // 2. Handle Responses
      if (message.type === 'res') {
        const resFrame = message as ResponseFrame
        const pending = this.pendingRequests.get(resFrame.id)

        // Special case: Initial Connect Response
        if (!this.authenticated && resFrame.ok && resFrame.payload?.type === 'hello-ok') {
          this.authenticated = true
          // Capture server tick interval from hello-ok policy (if provided)
          const policyTick = resFrame.payload?.policy?.tickIntervalMs
          if (typeof policyTick === 'number' && policyTick > 0) {
            this.tickIntervalMs = policyTick
          }
          // Capture server version. Gateways ≥v2026.3.11 emit top-level
          // `runtimeVersion`; older builds nest it under `payload.server.version`
          // (or `.runtimeVersion`). Walk both shapes.
          const serverObj = resFrame.payload?.server
          const version =
            resFrame.payload?.runtimeVersion ||
            resFrame.payload?.version ||
            (serverObj && typeof serverObj === 'object'
              ? (serverObj as Record<string, unknown>).runtimeVersion ?? (serverObj as Record<string, unknown>).version
              : undefined)
          console.log(`[OpenClaw] hello-ok — authenticated (server v${version ?? '?'})`)
          if (typeof version === 'string') {
            this.serverVersion = version
          }
          // Capture optional minimum client version the server requires.
          const minClient = resFrame.payload?.policy?.minClientVersion
          if (typeof minClient === 'string') {
            this.minClientVersion = minClient
          }
          this.startHealthCheck()
          this.resetTickWatch() // Start watching for server ticks
          this.emit('connected', resFrame.payload)
          resolve?.()
          return
        }

        if (pending) {
          this.pendingRequests.delete(resFrame.id)
          if (resFrame.ok) {
            pending.resolve(resFrame.payload)
          } else {
            const errorMsg = resFrame.error?.message || 'Unknown error'
            pending.reject(new Error(errorMsg))
          }
        } else if (!resFrame.ok && !this.authenticated) {
          // Failed connect response — don't reconnect with same bad credentials
          this.suppressReconnect = true
          const errorCode = resFrame.error?.code
          const errorMsg = resFrame.error?.message || 'Handshake failed'
          console.warn('[OpenClaw] handshake failed', {
            code: errorCode,
            message: errorMsg,
          })
          if (errorCode === 'NOT_PAIRED') {
            this.emit('pairingRequired', {
              requestId: resFrame.id,
              deviceId: this.deviceIdentity?.id
            })
            reject?.(new Error('NOT_PAIRED'))
            return
          }
          // Stale device identity — keypair changed but server has old key.
          // Signal the store to clear the identity and retry.
          if (errorMsg.toLowerCase().includes('signature invalid') ||
            errorMsg.toLowerCase().includes('signature mismatch')) {
            this.emit('deviceIdentityStale')
            reject?.(new Error('DEVICE_IDENTITY_STALE'))
            return
          }
          reject?.(new Error(errorMsg))
        }
        return
      }
    } catch {
      // Failed to parse message
    }
  }

  // Stream state management — per-session

  private getStream(sessionKey: string): SessionStreamState {
    let ss = this.sessionStreams.get(sessionKey)
    if (!ss) {
      ss = createSessionStream()
      this.sessionStreams.set(sessionKey, ss)
    }
    return ss
  }

  /** Resolve the session key for an event. Falls back to defaultSessionKey for legacy events. */
  private resolveEventSessionKey(eventSessionKey?: unknown): string {
    if (typeof eventSessionKey === 'string' && eventSessionKey) {
      return eventSessionKey
    }
    return this.defaultSessionKey || '__default__'
  }

  private resetSessionStream(sessionKey: string): void {
    this.sessionStreams.delete(sessionKey)
  }

  private resetStreamState(): void {
    this.sessionStreams.clear()
    this.parentSessionKeys.clear()
    this.defaultSessionKey = null
    this.sessionKeyResolved = false
    this.activeStreamKey = null
  }

  /** Emit streamSessionKey for the first event of a new send cycle if the key differs. */
  private maybeEmitSessionKey(runId: unknown, sessionKey: string): void {
    if (this.sessionKeyResolved) return
    if (!this.defaultSessionKey) return
    // Skip events from other known parent sessions (different conversations)
    if (this.parentSessionKeys.has(sessionKey) && sessionKey !== this.defaultSessionKey) return
    // Never rename the current session to a system/subagent session key.
    // In multi-agent setups, subagent events can race ahead of the main
    // session's first event — renaming currentSessionId to the subagent's
    // key causes that subagent's text to stream into the main chat.
    if (SYSTEM_SESSION_RE.test(sessionKey)) {
      return // Skip without marking resolved — the real session key hasn't arrived yet
    }

    this.sessionKeyResolved = true
    if (sessionKey === this.defaultSessionKey) return // Same key, no rename needed

    // Server assigned a different canonical key — update tracking and notify store
    this.parentSessionKeys.add(sessionKey)
    this.emit('streamSessionKey', { runId, sessionKey })
  }

  private ensureStream(ss: SessionStreamState, source: 'chat' | 'agent', modeHint: 'delta' | 'cumulative', runId: unknown, sessionKey: string): void {
    // If chat:final already processed this session, suppress all late events.
    // This prevents ghost bubbles from agent events that arrive after finalization.
    if (ss.finalized) {
      return
    }

    if (typeof runId === 'string' && !ss.runId) {
      ss.runId = runId
    }

    // Assign source BEFORE emitting session key so handlers see correct state
    if (ss.source === null) {
      ss.source = source
    }
    if (ss.source !== source) {
      return
    }

    this.maybeEmitSessionKey(runId, sessionKey)

    if (!ss.mode) {
      ss.mode = modeHint
    }

    if (!ss.started) {
      ss.started = true
      this.emit('streamStart', { sessionKey })
    }
  }

  private applyStreamText(ss: SessionStreamState, nextText: string, sessionKey: string): void {
    if (!nextText) return
    // chat:final has already replaced the placeholder; drop any late buffer
    // flushes so they don't create a ghost second bubble.
    if (ss.finalized) return
    const previous = ss.text
    if (nextText === previous) return

    // Single-stream-key guard: only the first session key to produce text
    // in a send cycle is allowed to emit chunks. In multi-agent setups,
    // the server may send the same content through multiple session keys
    // (parent session, system session, subagent). Without this guard, all
    // of them would write to the main chat placeholder, causing triple text.
    if (this.activeStreamKey === null) {
      this.activeStreamKey = sessionKey
    } else if (this.activeStreamKey !== sessionKey) {
      // Still accumulate text internally so state stays consistent,
      // but suppress the emission to prevent duplicate display.
      ss.text = nextText
      return
    }

    if (!previous) {
      ss.text = nextText
      this.emit('streamChunk', { text: nextText, sessionKey })
      return
    }

    if (nextText.startsWith(previous)) {
      const append = nextText.slice(previous.length)
      ss.text = nextText
      if (append) {
        this.emit('streamChunk', { text: append, sessionKey })
      }
      return
    }

    // New content block — accumulate rather than replace.
    // But first, suppress if the new text is a repetition of existing content.
    const probe = nextText.slice(0, Math.min(120, nextText.length))
    if (probe.length >= 40 && previous.includes(probe)) {
      return
    }
    const separator = '\n\n'
    ss.text = ss.text + separator + nextText
    this.emit('streamChunk', { text: separator + nextText, sessionKey })
  }

  private mergeIncoming(ss: SessionStreamState, incoming: string, modeHint: 'delta' | 'cumulative'): string {
    const previous = ss.text

    if (modeHint === 'cumulative') {
      if (!previous) return incoming
      if (incoming === previous) return previous

      // Normal cumulative growth: incoming extends the full accumulated text
      if (incoming.startsWith(previous)) return incoming

      // Check if incoming extends just the current content block
      // (agent data.text is cumulative per-block, resetting on tool calls)
      const currentBlock = previous.slice(ss.blockOffset)
      if (currentBlock && incoming.startsWith(currentBlock)) {
        return previous.slice(0, ss.blockOffset) + incoming
      }

      // Repetition guard: if the incoming text is already contained within
      // the accumulated text, the server agent is stuck in a generative loop.
      // Suppress the duplicate to prevent runaway text accumulation.
      if (previous.length >= incoming.length && previous.includes(incoming)) {
        return previous
      }
      // Also check if a significant prefix of the incoming text (first 120 chars)
      // already appears in the accumulated text — catches partial-overlap loops.
      const probe = incoming.slice(0, Math.min(120, incoming.length))
      if (probe.length >= 40 && previous.includes(probe)) {
        return previous
      }

      // Runaway text cap: if the accumulated text is excessively long,
      // replace rather than append to prevent the UI from choking.
      if (previous.length > 50_000) {
        ss.blockOffset = 0
        return incoming
      }

      // New content block detected — accumulate rather than replace.
      const separator = '\n\n'
      ss.blockOffset = previous.length + separator.length
      return previous + separator + incoming
    }

    // Some servers send cumulative strings even in "delta" fields.
    if (previous && incoming.startsWith(previous)) {
      return incoming
    }

    // Some servers repeat a suffix; avoid regressions.
    if (previous && previous.endsWith(incoming)) {
      return previous
    }

    // Repetition guard for delta mode: if the incoming delta is already
    // contained in the accumulated text, suppress it.
    if (previous && incoming.length >= 40 && previous.includes(incoming)) {
      return previous
    }

    // Fallback for partial overlap between chunk boundaries.
    // Cap the search to avoid O(n²) on very long strings.
    if (previous) {
      const maxOverlap = Math.min(previous.length, incoming.length, 500)
      for (let i = maxOverlap; i > 0; i--) {
        if (previous.endsWith(incoming.slice(0, i))) {
          return previous + incoming.slice(i)
        }
      }
    }

    // Runaway cap for delta mode
    if (previous && previous.length > 50_000) {
      return incoming
    }

    return previous + incoming
  }

  // Notification / event handling

  private handleNotification(event: string, payload: any): void {
    const eventSessionKey = payload?.sessionKey as string | undefined
    const sk = this.resolveEventSessionKey(eventSessionKey)

    // Subagent detection: events from sessions not in the parent set
    // indicate a spawned subagent conversation.
    // Skip system sessions (agent:X:main, agent:X:cron) — they are internal
    // and should never surface as subagent blocks in the chat.
    if (this.parentSessionKeys.size > 0 && eventSessionKey && !this.parentSessionKeys.has(eventSessionKey)) {
      if (!SYSTEM_SESSION_RE.test(eventSessionKey)) {
        this.emit('subagentDetected', { sessionKey: eventSessionKey })
      }
    }

    switch (event) {
      case 'chat': {
        const ss = this.getStream(sk)

        if (payload.state === 'delta') {
          this.ensureStream(ss, 'chat', 'cumulative', payload.runId, sk)
          if (ss.source !== 'chat') return // Another stream type already claimed this session

          let rawText = stripSystemNotifications(
            payload.message?.content !== undefined
              ? extractTextFromContent(payload.message.content)
              : (typeof payload.delta === 'string' ? stripAnsi(payload.delta) : '')
          )

          // Strip MEDIA: lines and trailing partial MEDIA tokens from streaming text
          if (rawText.includes('MEDIA')) {
            rawText = rawText
              .split('\n')
              .filter(l => !/\bMEDIA:\s*/i.test(l))
              .join('\n')
              .replace(/\s*\bMEDIA\s*$/, '')
              .trim()
          }

          if (rawText && !isNoiseContent(rawText) && !isHeartbeatContent(rawText)) {
            const nextText = this.mergeIncoming(ss, rawText, 'cumulative')
            this.applyStreamText(ss, nextText, sk)
          }
          return
        } else if (payload.state === 'error') {
          // Server-side error during message processing.
          // Surface as a system message and end the stream.
          const errorMsg = payload.errorMessage || payload.error?.message || 'Unknown server error'
          const isRateLimit = /rate.?limit|too many requests|429|resource.?exhausted|quota exceeded|tokens per (minute|day)|model.?cooldown|\btpm\b/i.test(errorMsg)
          this.emit('message', {
            id: `error-${Date.now()}`,
            role: 'system',
            content: isRateLimit
              ? `Rate limit reached — the model provider is throttling requests. Please wait a moment and try again.`
              : `Server error: ${errorMsg}`,
            timestamp: new Date().toISOString(),
            sessionKey: eventSessionKey,
            isRateLimit
          })
          if (isRateLimit) {
            this.emit('rateLimit', { message: errorMsg, sessionKey: eventSessionKey })
          }
          if (ss.started) {
            this.emit('streamEnd', { sessionKey: eventSessionKey })
          }
          this.resetSessionStream(sk)
          return
        } else if (payload.state === 'final') {
          this.maybeEmitSessionKey(payload.runId, sk)
          debugIngest(() => {
            const m: any = payload.message
            const rawText = m ? extractTextFromContent(m.content) : ''
            return { hypothesisId: 'H9,H10', location: 'client.ts:chat.final', message: 'chat:final received', data: { sk, hasMessage: !!m, role: m?.role, rawTextLen: rawText.length, rawTextPreview: rawText.slice(0, 200), contentType: Array.isArray(m?.content) ? 'array' : typeof m?.content, ssStarted: ss.started, ssSource: ss.source, ssFinalized: ss.finalized } }
          })

          // Diagnostic: log the final message shape to surface reasoning fields.
          // Enabled via EXPO_PUBLIC_DEBUG_CHAT_EVENTS=1.
          if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_CHAT_EVENTS === '1' && payload.message) {
            const m = payload.message
            const contentTypes = Array.isArray(m.content)
              ? (m.content as any[]).map((c: any) => c.type ?? typeof c)
              : [typeof m.content]
            console.log('[ChatEvent:chat:final]', {
              sessionKey: eventSessionKey,
              contentTypes,
              hasTopLevelThinking: typeof m.thinking === 'string',
              hasTopLevelReasoning: typeof m.reasoning === 'string',
              hasTopLevelReasoningContent: typeof m.reasoning_content === 'string',
              messageKeys: Object.keys(m),
            })
          }

          // Always emit the canonical final message so the store can replace
          // any truncated streaming placeholder.
          if (payload.message) {
            let text = stripSystemNotifications(extractTextFromContent(payload.message.content)).trim()
            let images = extractImagesFromContent(payload.message.content, this.url)
            let thinking: string | undefined
            if (Array.isArray(payload.message.content)) {
              // Accept multiple reasoning block type names for gateway/model compatibility
              // (Anthropic: 'thinking'; DeepSeek/OpenAI-style: 'reasoning', 'reasoning_content').
              const thinkingBlock = payload.message.content.find(
                (c: any) => c.type === 'thinking' || c.type === 'reasoning' || c.type === 'reasoning_content'
              )
              if (thinkingBlock) {
                thinking = thinkingBlock.thinking ?? thinkingBlock.reasoning ?? thinkingBlock.reasoning_content ?? thinkingBlock.text
              }
            }
            // Top-level reasoning fallbacks for gateways that surface it outside content[].
            if (!thinking) {
              thinking = payload.message.thinking ?? payload.message.reasoning ?? payload.message.reasoning_content
            }
            // Parse MEDIA: tokens from text and convert to image/audio/video URLs
            let audioUrl: string | undefined
            let videoUrl: string | undefined
            if (text.includes('MEDIA:')) {
              const parsed = parseMediaTokens(text, this.url)
              text = parsed.cleanText.trim()
              if (parsed.images.length > 0) {
                images = [...images, ...parsed.images]
              }
              if (parsed.audioUrls.length > 0) {
                audioUrl = parsed.audioUrls[0]
              }
              if (parsed.videoUrls.length > 0) {
                videoUrl = parsed.videoUrls[0]
              }
            }
            // Extract mediaUrl/mediaUrls from sendPayload-style events
            if (typeof payload.mediaUrl === 'string' && payload.mediaUrl) {
              images.push({ url: payload.mediaUrl, alt: 'Media' })
            }
            if (Array.isArray(payload.mediaUrls)) {
              for (const u of payload.mediaUrls) {
                if (typeof u === 'string' && u) images.push({ url: u, alt: 'Media' })
              }
            }
            // Extract details.media (v2026.3.22 media reply migration)
            const files: import('./types').MessageFile[] = []
            if (payload.details?.media) {
              const dm = payload.details.media
              if (Array.isArray(dm)) {
                for (const m of dm) {
                  if (m.type === 'image' && typeof m.url === 'string') {
                    images.push({ url: m.url, mimeType: m.mimeType, alt: m.alt || 'Media' })
                  } else if (m.type === 'audio' && typeof m.url === 'string' && !audioUrl) {
                    audioUrl = m.url
                  } else if (m.type === 'video' && typeof m.url === 'string' && !videoUrl) {
                    videoUrl = m.url
                  } else if (m.type === 'document' && typeof m.url === 'string') {
                    files.push({ url: m.url, name: m.fileName || m.alt || 'Document', mimeType: m.mimeType })
                  }
                }
              } else if (typeof dm.url === 'string') {
                if (dm.type === 'audio') { if (!audioUrl) audioUrl = dm.url }
                else if (dm.type === 'video') { if (!videoUrl) videoUrl = dm.url }
                else if (dm.type === 'document') { files.push({ url: dm.url, name: dm.fileName || dm.alt || 'Document', mimeType: dm.mimeType }) }
                else images.push({ url: dm.url, mimeType: dm.mimeType, alt: dm.alt || 'Media' })
              }
            }
            // Extract audioAsVoice flag from sendPayload
            const audioAsVoice = payload.audioAsVoice === true
            // Deduplicate images by URL
            const seenUrls = new Set<string>()
            images = images.filter(img => {
              if (seenUrls.has(img.url)) return false
              seenUrls.add(img.url)
              return true
            })
            const willEmit = (text && !isNoiseContent(text) && !isHeartbeatContent(text)) || images.length > 0 || audioUrl || videoUrl || files.length > 0
            debugIngest(() => ({ hypothesisId: 'H10', location: 'client.ts:chat.final:emit', message: willEmit ? 'chat:final WILL emit message' : 'chat:final SUPPRESSED (text empty/noise)', data: { sk, willEmit, textLen: text.length, textPreview: text.slice(0, 200), isNoise: isNoiseContent(text), isHeartbeat: isHeartbeatContent(text), hasImages: images.length > 0, hasAudio: !!audioUrl, hasVideo: !!videoUrl, hasFiles: files.length > 0, hasThinking: typeof thinking === 'string' && thinking.length > 0 } }))
            if (willEmit) {
              const id =
                (typeof payload.message.id === 'string' && payload.message.id) ||
                (typeof payload.runId === 'string' && payload.runId) ||
                `msg-${Date.now()}`
              const tsRaw = payload.message.timestamp
              const tsNum = typeof tsRaw === 'number' ? tsRaw : NaN
              const tsMs = Number.isFinite(tsNum) ? (tsNum > 1e12 ? tsNum : tsNum * 1000) : Date.now()
              this.emit('message', {
                id,
                role: payload.message.role,
                content: text,
                timestamp: new Date(tsMs).toISOString(),
                thinking,
                images: images.length > 0 ? images : undefined,
                audioUrl,
                videoUrl,
                audioAsVoice: audioAsVoice || undefined,
                files: files.length > 0 ? files : undefined,
                sessionKey: eventSessionKey
              })
            }
          }

          if (ss.started) {
            this.emit('streamEnd', { sessionKey: eventSessionKey })
          }
          // Mark finalized instead of deleting — keeps the session stream alive
          // so late-arriving agent events are suppressed by the finalized guard.
          // Full deletion happens on next send cycle (setPrimarySessionKey).
          ss.finalized = true
          ss.started = false
        } else if (payload.state !== undefined) {
          // Unknown chat state — forward for dev logging; safe to ignore in prod.
          this.emit('chatStatus', { state: payload.state, sessionKey: eventSessionKey })
        }
        break
      }
      case 'presence':
        this.emit('agentStatus', payload)
        break
      case 'agent': {
        const ss = this.getStream(sk)

        // If chat:final already finalized this session, suppress duplicate assistant
        // text (already in the final message) but still pass through tool, thinking,
        // and compaction events — they may arrive slightly late and should still be
        // visible in the UI.
        if (
          ss.finalized &&
          payload.stream !== 'tool' &&
          payload.stream !== 'thinking' &&
          payload.stream !== 'reasoning' &&
          payload.stream !== 'compaction' &&
          !(
            payload.stream === 'lifecycle' &&
            (
              payload.data?.phase === 'end' ||
              payload.data?.state === 'complete' ||
              payload.data?.phase === 'error' ||
              payload.data?.state === 'error'
            )
          )
        ) {
          return
        }

        // Diagnostic: log raw agent stream events to help identify reasoning shapes
        // from models like DeepSeek R1. Enabled via EXPO_PUBLIC_DEBUG_CHAT_EVENTS=1.
        // Placed after the finalized suppression block to avoid logging duplicates.
        if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_CHAT_EVENTS === '1') {
          const knownStreams = new Set(['assistant', 'tool', 'thinking', 'compaction', 'lifecycle'])
          const d = payload.data ?? {}
          console.log('[ChatEvent:agent]', {
            stream: payload.stream,
            sessionKey: eventSessionKey,
            finalized: ss.finalized,
            hasText: typeof d.text === 'string',
            hasDelta: typeof d.delta === 'string',
            hasReasoning: typeof d.reasoning === 'string',
            hasReasoningContent: typeof d.reasoning_content === 'string',
            hasThinking: typeof d.thinking === 'string',
            textLen: typeof d.text === 'string' ? d.text.length : undefined,
            deltaLen: typeof d.delta === 'string' ? d.delta.length : undefined,
            dataKeys: Object.keys(d),
            unhandled: !knownStreams.has(payload.stream),
          })
          if (payload.stream === 'item') {
            // Extra diagnostics: inspect structured agent item events to decide
            // whether they should map into thinking/progress UI blocks.
            console.log('[ChatEvent:agent:item:raw]', d)
          }
        }

        if (payload.stream === 'assistant') {
          const hasCanonicalText = typeof payload.data?.text === 'string'
          this.ensureStream(ss, 'agent', hasCanonicalText ? 'cumulative' : 'delta', payload.runId, sk)
          if (ss.source !== 'agent') return // Another stream type already claimed this session

          // Prefer canonical cumulative text when available.
          let canonicalText = stripSystemNotifications(
            typeof payload.data?.text === 'string' ? stripModelSpecialTokens(stripAnsi(payload.data.text)) : ''
          )
          // Strip MEDIA: lines and trailing partial MEDIA tokens from streaming text.
          // Preserve stripped MEDIA: lines for lifecycle-end extraction.
          if (canonicalText.includes('MEDIA')) {
            const lines = canonicalText.split('\n')
            const mediaRe = /\bMEDIA:\s*/i
            for (const l of lines) {
              if (mediaRe.test(l) && !ss.mediaLines.includes(l.trim())) {
                ss.mediaLines.push(l.trim())
              }
            }
            canonicalText = lines
              .filter(l => !mediaRe.test(l))
              .join('\n')
              .replace(/\s*\bMEDIA\s*$/, '') // strip trailing partial "MEDIA" before colon arrives
              .trim()
          }
          if (canonicalText && !isNoiseContent(canonicalText) && !isHeartbeatContent(canonicalText)) {
            const nextText = this.mergeIncoming(ss, canonicalText, 'cumulative')
            this.applyStreamText(ss, nextText, sk)
            return
          }

          let deltaText = stripSystemNotifications(
            typeof payload.data?.delta === 'string' ? stripAnsi(payload.data.delta) : ''
          )
          if (deltaText.includes('MEDIA:')) {
            const deltaLines = deltaText.split('\n')
            const mediaRe = /\bMEDIA:\s*/i
            for (const l of deltaLines) {
              if (mediaRe.test(l) && !ss.mediaLines.includes(l.trim())) {
                ss.mediaLines.push(l.trim())
              }
            }
            deltaText = deltaLines.filter(l => !mediaRe.test(l)).join('\n').trim()
          }
          if (deltaText && !isNoiseContent(deltaText) && !isHeartbeatContent(deltaText)) {
            const nextText = this.mergeIncoming(ss, deltaText, 'delta')
            this.applyStreamText(ss, nextText, sk)
          }

          // Capture pre-parsed media URLs from server (server already stripped MEDIA: lines
          // from data.text and sends extracted URLs separately in data.mediaUrls).
          if (Array.isArray(payload.data?.mediaUrls)) {
            for (const u of payload.data.mediaUrls) {
              if (typeof u === 'string' && u && !ss.serverMediaUrls.includes(u)) {
                ss.serverMediaUrls.push(u)
              }
            }
          }
        } else if (payload.stream === 'tool') {
          this.maybeEmitSessionKey(payload.runId, sk)

          if (!ss.started) {
            ss.started = true
            this.emit('streamStart', { sessionKey: sk })
          }

          const data = payload.data || {}
          let rawResult = extractToolResultText(data.result)
          const phase = data.phase || (data.result !== undefined ? 'result' : 'start')
          // On 'result' phase, server may strip data.result (unless verboseLevel=full)
          // but still sends data.meta with a short summary (e.g. file path, command).
          const meta = typeof data.meta === 'string' ? data.meta : undefined

          // Extract details.media (v2026.3.22 media reply migration) for tool results.
          // The server may deliver audio/image/video via details.media instead of embedding
          // a MEDIA: line in data.result — e.g. after a TTS tool completes.
          if (phase === 'result' && data.details && typeof data.details === 'object') {
            const dm = (data.details as Record<string, unknown>).media
            if (dm) {
              const mediaParts: string[] = rawResult ? [rawResult] : []
              if (Array.isArray(dm)) {
                for (const item of dm as Array<Record<string, unknown>>) {
                  if (typeof item.url === 'string' && item.url) {
                    mediaParts.push(`MEDIA: ${item.url}`)
                  }
                }
              } else if (typeof dm === 'object' && typeof (dm as Record<string, unknown>).url === 'string') {
                mediaParts.push(`MEDIA: ${(dm as Record<string, unknown>).url}`)
              }
              if (mediaParts.length > 0) {
                rawResult = mediaParts.join('\n')
              }
            }
          }

          const toolPayload = {
            toolCallId: data.toolCallId || data.id || `tool-${Date.now()}`,
            name: data.name || data.toolName || 'unknown',
            phase,
            result: rawResult ? stripAnsi(rawResult) : undefined,
            args: phase === 'start' ? data.args : undefined,
            meta,
            sessionKey: eventSessionKey
          }
          if (
            __DEV__ &&
            process.env.EXPO_PUBLIC_DEBUG_CHAT_EVENTS === '1' &&
            /tts|audio|voice|speech/i.test(toolPayload.name)
          ) {
            console.log('[ChatEvent:agent:tool:audio-suspect]', {
              name: toolPayload.name,
              phase: toolPayload.phase,
              dataKeys: Object.keys(data),
              resultType: typeof data.result,
              resultKeys: data.result && typeof data.result === 'object' ? Object.keys(data.result as Record<string, unknown>) : undefined,
              resultContentTypes: Array.isArray((data.result as any)?.content)
                ? (data.result as any).content.map((c: any) => c?.type ?? typeof c)
                : undefined,
              metaType: typeof data.meta,
              metaPreview: typeof data.meta === 'string' ? data.meta.slice(0, 200) : undefined,
              detailsKeys: data.details && typeof data.details === 'object' ? Object.keys(data.details as Record<string, unknown>) : undefined,
              detailsMedia: (data.details as any)?.media,
              rawResultExtracted: rawResult?.slice(0, 200),
            })
          }
          this.emit('toolCall', toolPayload)
        } else if (payload.stream === 'thinking' || payload.stream === 'reasoning') {
          this.maybeEmitSessionKey(payload.runId, sk)

          if (!ss.started) {
            ss.started = true
            this.emit('streamStart', { sessionKey: sk })
          }

          // Prefer cumulative text, then fall back to delta, then reasoning-specific
          // field names used by some gateway/model combinations (DeepSeek R1, etc.).
          const d = payload.data ?? {}
          const isCumulative = typeof d.text === 'string'
          const thinkingText: string = isCumulative
            ? d.text
            : typeof d.delta === 'string'
              ? d.delta
              : typeof d.reasoning === 'string'
                ? d.reasoning
                : typeof d.reasoning_content === 'string'
                  ? d.reasoning_content
                  : typeof d.thinking === 'string'
                    ? d.thinking
                    : ''

          if (thinkingText) {
            this.emit('thinkingChunk', {
              text: thinkingText,
              cumulative: isCumulative,
              sessionKey: eventSessionKey
            })
          }
        } else if (payload.stream === 'compaction') {
          this.maybeEmitSessionKey(payload.runId, sk)
          const phase = payload.data?.phase // 'start' or 'end'
          const willRetry = payload.data?.willRetry ?? false
          this.emit('compaction', { phase, willRetry, sessionKey: eventSessionKey })
        } else if (payload.stream === 'lifecycle') {
          this.maybeEmitSessionKey(payload.runId, sk)
          const phase = payload.data?.phase
          const state = payload.data?.state
          debugIngest(() => ({ hypothesisId: 'H6,H8', location: 'client.ts:agent.lifecycle', message: 'agent lifecycle event', data: { phase, state, sk, ssSource: ss.source, ssStarted: ss.started, ssFinalized: ss.finalized, errorRaw: typeof payload.data?.error === 'string' ? payload.data.error.slice(0, 500) : payload.data?.error, livenessState: payload.data?.livenessState, dataKeys: Object.keys(payload.data ?? {}) } }))
          if (phase === 'end' || phase === 'error' || state === 'complete' || state === 'error') {
            // Before ending the stream, extract any MEDIA: lines that were stripped
            // during streaming. These are preserved in ss.mediaLines and would be lost
            // if no chat:final arrives to parse them from the canonical message.
            if (ss.source === 'agent' && ss.mediaLines.length > 0) {
              const mediaText = ss.mediaLines.join('\n')
              const parsed = parseMediaTokens(mediaText, this.url)
              if (parsed.images.length > 0 || parsed.audioUrls.length > 0 || parsed.videoUrls.length > 0) {
                this.emit('message', {
                  id: `media-${Date.now()}`,
                  role: 'assistant',
                  content: '',
                  timestamp: new Date().toISOString(),
                  images: parsed.images.length > 0 ? parsed.images : undefined,
                  audioUrl: parsed.audioUrls[0],
                  videoUrl: parsed.videoUrls[0],
                  sessionKey: eventSessionKey
                })
              }
            }

            // Emit pre-parsed media URLs captured from agent:assistant data.mediaUrls.
            // The server strips MEDIA: lines from data.text and sends URLs here instead,
            // so ss.mediaLines may be empty even when media was sent.
            if (ss.source === 'agent' && ss.serverMediaUrls.length > 0) {
              const serverParsed = classifyMediaUrls(ss.serverMediaUrls, this.url)
              if (serverParsed.images.length > 0 || serverParsed.audioUrls.length > 0 || serverParsed.videoUrls.length > 0) {
                this.emit('message', {
                  id: `media-srv-${Date.now()}`,
                  role: 'assistant',
                  content: '',
                  timestamp: new Date().toISOString(),
                  images: serverParsed.images.length > 0 ? serverParsed.images : undefined,
                  audioUrl: serverParsed.audioUrls[0],
                  videoUrl: serverParsed.videoUrls[0],
                  sessionKey: eventSessionKey
                })
              }
            }

            // Also extract mediaUrl/mediaUrls from the lifecycle event payload itself
            const lifecycleImages: Array<{ url: string; mimeType?: string; alt?: string }> = []
            let lifecycleVideoUrl: string | undefined
            if (typeof payload.mediaUrl === 'string' && payload.mediaUrl) {
              lifecycleImages.push({ url: payload.mediaUrl, alt: 'Media' })
            }
            if (Array.isArray(payload.mediaUrls)) {
              for (const u of payload.mediaUrls) {
                if (typeof u === 'string' && u) lifecycleImages.push({ url: u, alt: 'Media' })
              }
            }
            // Extract details.media (v2026.3.22 media reply migration)
            let lifecycleAudioUrl: string | undefined
            const lifecycleFiles: import('./types').MessageFile[] = []
            if (payload.details?.media) {
              const dm = payload.details.media
              if (Array.isArray(dm)) {
                for (const m of dm) {
                  if (m.type === 'image' && typeof m.url === 'string') {
                    lifecycleImages.push({ url: m.url, mimeType: m.mimeType, alt: m.alt || 'Media' })
                  } else if (m.type === 'audio' && typeof m.url === 'string' && !lifecycleAudioUrl) {
                    lifecycleAudioUrl = m.url
                  } else if (m.type === 'video' && typeof m.url === 'string' && !lifecycleVideoUrl) {
                    lifecycleVideoUrl = m.url
                  } else if (m.type === 'document' && typeof m.url === 'string') {
                    lifecycleFiles.push({ url: m.url, name: m.fileName || m.alt || 'Document', mimeType: m.mimeType })
                  }
                }
              } else if (typeof dm.url === 'string') {
                if (dm.type === 'audio') lifecycleAudioUrl = dm.url
                else if (dm.type === 'video') lifecycleVideoUrl = dm.url
                else if (dm.type === 'document') { lifecycleFiles.push({ url: dm.url, name: dm.fileName || dm.alt || 'Document', mimeType: dm.mimeType }) }
                else lifecycleImages.push({ url: dm.url, mimeType: dm.mimeType, alt: dm.alt || 'Media' })
              }
            }
            if (lifecycleImages.length > 0 || lifecycleAudioUrl || lifecycleVideoUrl || lifecycleFiles.length > 0) {
              this.emit('message', {
                id: `media-lc-${Date.now()}`,
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString(),
                images: lifecycleImages.length > 0 ? lifecycleImages : undefined,
                audioUrl: lifecycleAudioUrl,
                videoUrl: lifecycleVideoUrl,
                files: lifecycleFiles.length > 0 ? lifecycleFiles : undefined,
                sessionKey: eventSessionKey
              })
            }

            if (ss.source === 'agent' && ss.started) {
              this.emit('streamEnd', { sessionKey: eventSessionKey })
              // Partial reset: keep source and text so late-arriving chat:delta
              // events are still filtered by the source !== 'chat' guard.
              // chat:final will mark the session as finalized (not deleted) to
              // suppress ghost bubbles from any further late events.
              ss.started = false
            } else if (ss.source === null) {
              // Agent lifecycle ended without producing any content (no
              // assistant/tool/thinking events fired). Without this synthesis,
              // the UI placeholder created by chatAwaitingResponse stays at
              // isStreaming=true forever, leaving the user with a stuck
              // "Thinking…" indicator. Mark the turn interrupted so the user
              // can retry. Emitting only streamInterrupted (not streamEnd)
              // preserves the bubble; if a late chat:final arrives, it will
              // still replace the placeholder via the existing stream-id scan
              // in useChat's onMessage handler.
              debugIngest(() => ({ runId: 'post-fix', hypothesisId: 'H6', location: 'client.ts:agent.lifecycle:emptyEnd', message: 'FIX: empty agent run -> emitting streamInterrupted', data: { phase, state, sk } }))
              this.emit('streamInterrupted', { sessionKey: eventSessionKey })
            }
          }
        }
        break
      }
      case 'chat.side_result': {
        // BTW side question response (v2026.3.22) — ephemeral, not persisted
        const text = typeof payload.text === 'string'
          ? payload.text
          : typeof payload.message?.content === 'string'
            ? payload.message.content
            : extractTextFromContent(payload.message?.content) || ''
        if (text) {
          this.emit('sideResult', {
            text: stripAnsi(text),
            sessionKey: eventSessionKey
          })
        }
        break
      }
      case 'tick':
        // Server keepalive — reset the tick watchdog so we don't false-positive
        this.lastTickAt = Date.now()
        this.resetTickWatch()
        this.emit('tick', payload ?? {})
        break
      case 'exec.approval.requested':
        this.emit('execApprovalRequested', payload)
        break
      default:
        this.emit(event, payload)
    }
  }

  getActiveSessionKey(): string | null {
    return this.defaultSessionKey
  }

  hasActiveStream(sessionKey: string): boolean {
    return this.sessionStreams.has(sessionKey)
  }

  /** True iff any session currently has an in-flight stream (started but not
   *  finalized). Used by the connection lifecycle to avoid tearing down the
   *  WebSocket while an assistant turn is still producing content — including
   *  while the app is backgrounded. */
  hasAnyActiveStream(): boolean {
    for (const [, ss] of this.sessionStreams) {
      if (ss.started && !ss.finalized) return true
    }
    return false
  }

  setPrimarySessionKey(key: string | null): void {
    if (key) {
      // Clear any stale stream state from a previous send cycle.
      // Without this, a prior agent-sourced stream leaves ss.source='agent'
      // which blocks subsequent chat-sourced responses from being processed.
      this.sessionStreams.delete(key)
      this.parentSessionKeys.add(key)
      this.defaultSessionKey = key
      this.sessionKeyResolved = false
      // Reset active stream key so the new send cycle can claim it
      this.activeStreamKey = null
    } else {
      // Clear default when switching sessions (parent set is preserved
      // so concurrent streams from other sessions aren't detected as subagents)
      this.defaultSessionKey = null
    }
  }

  /** Public RPC call — used by slash command executor and other callers that
   *  need direct access to gateway RPC methods. */
  async call<T = any>(method: string, params?: any, options?: { timeoutMs?: number }): Promise<T> {
    return this._call(method, params, options)
  }

  // Domain API methods - delegated to modules

  // Sessions
  async listSessions(): Promise<Session[]> {
    return sessionsApi.listSessions(this._call.bind(this))
  }

  async createSession(agentId?: string): Promise<Session> {
    return sessionsApi.createSession(agentId)
  }

  async getSession(sessionKey: string): Promise<Session | null> {
    return sessionsApi.getSession(this._call.bind(this), sessionKey)
  }

  async deleteSession(sessionId: string): Promise<void> {
    return sessionsApi.deleteSession(this._call.bind(this), sessionId)
  }

  async updateSession(sessionId: string, updates: sessionsApi.SessionPatchParams): Promise<void> {
    return sessionsApi.updateSession(this._call.bind(this), sessionId, updates)
  }

  async compactSession(sessionId: string): Promise<void> {
    return sessionsApi.compactSession(this._call.bind(this), sessionId)
  }

  async resetSession(sessionKey: string): Promise<void> {
    // Must clear BEFORE the RPC: the gateway often streams the startup greeting
    // (agent events + chat:final) before it sends the sessions.reset response.
    // Those events would otherwise hit ss.finalized=true left by the prior turn
    // and be silently dropped by the suppression guard in handleNotification.
    const prevStream = this.sessionStreams.get(sessionKey)
    const prevActive = this.activeStreamKey
    const prevResolved = this.sessionKeyResolved

    this.sessionStreams.delete(sessionKey)
    if (this.activeStreamKey === sessionKey) {
      this.activeStreamKey = null
    }
    this.sessionKeyResolved = false

    try {
      await this._call('sessions.reset', { key: sessionKey })
    } catch (err) {
      // Restore optimistic state so the UI's prior turn isn't corrupted
      // if the reset call itself failed.
      if (prevStream) this.sessionStreams.set(sessionKey, prevStream)
      this.activeStreamKey = prevActive
      this.sessionKeyResolved = prevResolved
      throw err
    }
  }

  async spawnSession(agentId: string, prompt?: string): Promise<Session> {
    return sessionsApi.spawnSession(this._call.bind(this), agentId, prompt)
  }

  // Chat
  async getSessionMessages(sessionId: string): Promise<chatApi.ChatHistoryResult> {
    return chatApi.getSessionMessages(this._call.bind(this), sessionId, this.url)
  }

  async sendMessage(params: {
    sessionId?: string
    content: string
    agentId?: string
    thinking?: boolean
    thinkingLevel?: string | null
    attachments?: chatApi.ChatAttachmentInput[]
  }): Promise<{ sessionKey?: string }> {
    const result = await chatApi.sendMessage(this._call.bind(this), params)
    this.emit('chatAwaitingResponse', { sessionKey: result?.sessionKey ?? params.sessionId })
    return result
  }

  async abortChat(sessionId: string): Promise<void> {
    return chatApi.abortChat(this._call.bind(this), sessionId)
  }

  // Models
  async listModels(): Promise<Array<{ id: string; name?: string; provider?: string; contextWindow?: number; reasoning?: boolean; input?: string[] }>> {
    const result = await this._call<any>('models.list', {})
    const models = result?.models
    if (!Array.isArray(models)) return []
    return models.map((m: any) => ({
      id: m.id || m.name || String(m),
      name: m.name || m.id,
      provider: m.provider || m.providerId || undefined,
      contextWindow: typeof m.contextWindow === 'number' ? m.contextWindow : undefined,
      reasoning: typeof m.reasoning === 'boolean' ? m.reasoning : undefined,
      input: Array.isArray(m.input) ? m.input : undefined,
    }))
  }

  // Tools catalog (v2026.3.22)
  async getToolsCatalog(): Promise<Array<{ name: string; description?: string; provenance?: string; enabled?: boolean }>> {
    try {
      const result = await this._call<any>('tools.catalog', {})
      const tools = result?.tools || result
      if (!Array.isArray(tools)) return []
      return tools.map((t: any) => ({
        name: t.name || t.id || String(t),
        description: t.description || undefined,
        provenance: t.provenance || t.source || undefined,
        enabled: t.enabled ?? true
      }))
    } catch {
      return []
    }
  }

  // Agents
  async listAgents(): Promise<Agent[]> {
    return agentsApi.listAgents(this._call.bind(this), this.url)
  }

  async getAgentIdentity(agentId: string): Promise<{ name?: string; emoji?: string; avatar?: string; avatarUrl?: string } | null> {
    return agentsApi.getAgentIdentity(this._call.bind(this), agentId)
  }

  async getAgentFiles(agentId: string): Promise<{ workspace: string; files: Array<{ name: string; path: string; missing: boolean; size?: number }> } | null> {
    return agentsApi.getAgentFiles(this._call.bind(this), agentId)
  }

  async getAgentFile(agentId: string, fileName: string): Promise<{ content?: string; missing: boolean } | null> {
    return agentsApi.getAgentFile(this._call.bind(this), agentId, fileName)
  }

  async setAgentFile(agentId: string, fileName: string, content: string): Promise<boolean> {
    return agentsApi.setAgentFile(this._call.bind(this), agentId, fileName, content)
  }

  async createAgent(params: agentsApi.CreateAgentParams): Promise<agentsApi.CreateAgentResult> {
    return agentsApi.createAgent(this._call.bind(this), params)
  }

  async deleteAgent(agentId: string): Promise<agentsApi.DeleteAgentResult> {
    return agentsApi.deleteAgent(this._call.bind(this), agentId)
  }

  // Commands
  async listCommands(params?: commandsApi.ListCommandsParams): Promise<commandsApi.CommandEntry[]> {
    return commandsApi.listCommands(this._call.bind(this), params)
  }

  // Skills
  async listSkills(): Promise<Skill[]> {
    return skillsApi.listSkills(this._call.bind(this))
  }

  async toggleSkill(skillKey: string, enabled: boolean): Promise<void> {
    return skillsApi.toggleSkill(this._call.bind(this), skillKey, enabled)
  }

  async installSkill(skillName: string, installId: string): Promise<void> {
    return skillsApi.installSkill(this._call.bind(this), skillName, installId)
  }

  async installHubSkill(slug: string, sessionKey?: string): Promise<void> {
    return skillsApi.installHubSkill(this._call.bind(this), slug, sessionKey)
  }

  // Cron Jobs
  async listCronJobs(): Promise<CronJob[]> {
    return cronApi.listCronJobs(this._call.bind(this))
  }

  async toggleCronJob(cronId: string, enabled: boolean): Promise<void> {
    return cronApi.toggleCronJob(this._call.bind(this), cronId, enabled)
  }

  async getCronJobDetails(cronId: string): Promise<CronJob | null> {
    return cronApi.getCronJobDetails(this._call.bind(this), cronId)
  }

  // Config
  async getServerConfig(): Promise<{ config: any; hash: string }> {
    return configApi.getServerConfig(this._call.bind(this))
  }

  async patchServerConfig(patch: object, baseHash: string): Promise<void> {
    return configApi.patchServerConfig(this._call.bind(this), patch, baseHash)
  }

  /** Validate a config patch without applying it (v2026.3.22 dry-run). */
  async validateServerConfig(patch: object, baseHash: string): Promise<{ valid: boolean; errors?: Array<{ path: string; message: string }> }> {
    return configApi.validateServerConfig(this._call.bind(this), patch, baseHash)
  }

  // Cron Jobs (Extended)
  async addCronJob(params: any): Promise<void> {
    return cronApi.addCronJob(this._call.bind(this), params)
  }
  async updateCronJob(id: string, params: any): Promise<void> {
    return cronApi.updateCronJob(this._call.bind(this), id, params)
  }
  async removeCronJob(id: string): Promise<void> {
    return cronApi.removeCronJob(this._call.bind(this), id)
  }
  async runCronJob(id: string): Promise<void> {
    return cronApi.runCronJob(this._call.bind(this), id)
  }

  // Hooks (config-based)
  async fetchHooks(): Promise<hooksApi.HooksState> {
    return hooksApi.fetchHooks(this._call.bind(this))
  }

  async toggleHookEnabled(hookId: string, enabled: boolean): Promise<void> {
    return hooksApi.toggleHookEnabled(this._call.bind(this), hookId, enabled)
  }

  async toggleInternalHooksEnabled(enabled: boolean): Promise<void> {
    return hooksApi.toggleInternalHooksEnabled(this._call.bind(this), enabled)
  }

  async updateHookEnv(hookId: string, env: Record<string, string>): Promise<void> {
    return hooksApi.updateHookEnv(this._call.bind(this), hookId, env)
  }

  // Features
  async getUsageStatus(): Promise<any> { return featuresApi.getUsageStatus(this._call.bind(this)) }
  async getUsageCost(): Promise<any> { return featuresApi.getUsageCost(this._call.bind(this)) }
  async getSessionsUsage(params?: { days?: number; limit?: number }): Promise<any> { return featuresApi.getSessionsUsage(this._call.bind(this), params) }

  async getTtsStatus(): Promise<any> { return featuresApi.getTtsStatus(this._call.bind(this)) }
  async getTtsProviders(): Promise<any> { return featuresApi.getTtsProviders(this._call.bind(this)) }
  async setTtsEnable(enable: boolean): Promise<any> { return featuresApi.setTtsEnable(this._call.bind(this), enable) }
  async setTtsProvider(provider: string): Promise<any> { return featuresApi.setTtsProvider(this._call.bind(this), provider) }

  async getVoicewake(): Promise<any> { return featuresApi.getVoicewake(this._call.bind(this)) }
  async setVoicewake(params: any): Promise<any> { return featuresApi.setVoicewake(this._call.bind(this), params) }

  // Nodes
  async listNodes(): Promise<Node[]> { return nodesApi.listNodes(this._call.bind(this)) }
  async getExecApprovals(): Promise<nodesApi.ExecApprovalsResponse | null> { return nodesApi.getExecApprovals(this._call.bind(this)) }
  async getNodeExecApprovals(nodeId: string): Promise<nodesApi.ExecApprovalsResponse | null> { return nodesApi.getNodeExecApprovals(this._call.bind(this), nodeId) }
  async setExecApprovals(file: nodesApi.ExecApprovalsFile, baseHash: string): Promise<void> { return nodesApi.setExecApprovals(this._call.bind(this), file, baseHash) }
  async setNodeExecApprovals(nodeId: string, file: nodesApi.ExecApprovalsFile, baseHash: string): Promise<void> { return nodesApi.setNodeExecApprovals(this._call.bind(this), nodeId, file, baseHash) }
  async listDevicePairings(): Promise<nodesApi.DevicePairListResponse | null> { return nodesApi.listDevicePairings(this._call.bind(this)) }
  async approveDevicePairing(requestId: string): Promise<void> { return nodesApi.approveDevicePairing(this._call.bind(this), requestId) }
  async rejectDevicePairing(requestId: string): Promise<void> { return nodesApi.rejectDevicePairing(this._call.bind(this), requestId) }
  async removeDevice(deviceId: string): Promise<void> { return nodesApi.removeDevice(this._call.bind(this), deviceId) }
  async rotateDeviceToken(deviceId: string, role: string, scopes?: string[]): Promise<void> { return nodesApi.rotateDeviceToken(this._call.bind(this), deviceId, role, scopes) }
  async revokeDeviceToken(deviceId: string, role: string): Promise<void> { return nodesApi.revokeDeviceToken(this._call.bind(this), deviceId, role) }
  async resolveExecApproval(approvalId: string, decision: nodesApi.ExecApprovalDecision): Promise<void> { return nodesApi.resolveExecApproval(this._call.bind(this), approvalId, decision) }

  // Logs
  async tailLogs(params?: logsApi.LogsTailParams): Promise<logsApi.LogsTailResult> { return logsApi.tailLogs(this._call.bind(this), params) }

  /** Lightweight liveness check — returns true if the server tick is recent (no RPC needed). */
  isAlive(): boolean {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN || !this.authenticated) return false
    // If we've never received a tick, fall back to lastMessageAt
    const lastActivity = this.lastTickAt || this.lastMessageAt
    if (!lastActivity) return this.authenticated
    // Connection is alive if last tick/message arrived within 2× the tick interval
    return Date.now() - lastActivity < this.tickIntervalMs * 2
  }
}
