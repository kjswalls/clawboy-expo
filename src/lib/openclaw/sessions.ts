// OpenClaw Client - Session API Methods

import type { Session, RpcCaller } from './types'
import { resolveSessionKey, toIsoTimestamp, isNoiseContent, stripAnsi, generateUUID, stripConversationMetadata } from './utils'

const MAX_TITLE_LEN = 80

/**
 * Server-derived titles are just the first ~N chars of the first user
 * message — wrapped in the gateway's metadata envelope ("Sender (untrusted
 * metadata): ```json {...}```\n[channel user ts] actual text"). Strip the
 * envelope, collapse whitespace, and truncate so the sidebar shows the
 * user's actual prompt rather than the metadata block.
 */
function sanitizeDerivedTitle(raw: string | undefined): string {
  if (!raw) return ''
  const stripped = stripConversationMetadata(raw).replace(/\s+/g, ' ').trim()
  if (!stripped) return ''
  // Server may deliver a truncated metadata wrapper (e.g. `Sender (untrusted metadata): ```json {…`)
  // that survives stripConversationMetadata because the closing fence got cut. Treat any
  // residue that still smells like the envelope as unusable so the caller falls through
  // to its friendly default instead of flashing raw JSON in the title bar.
  if (isJunkTitle(stripped)) return ''
  if (stripped.length <= MAX_TITLE_LEN) return stripped
  return stripped.slice(0, MAX_TITLE_LEN - 1).trimEnd() + '…'
}

/**
 * True when `title` is an auto-rename-eligible placeholder: empty, the literal "New Chat"
 * default, the session key (ugly UUID fallback), or unsanitized server metadata residue.
 * Used both to decide when to auto-rename and to swap a friendly label in at display time.
 */
export function isStillDefaultTitle(title: string | undefined, key: string): boolean {
  if (!title) return true
  if (title === 'New Chat') return true
  if (title === key) return true
  const trimmed = title.trim()
  if (!trimmed) return true
  return isJunkTitle(trimmed)
}

function isJunkTitle(trimmed: string): boolean {
  if (trimmed.startsWith('Sender (untrusted metadata)')) return true
  if (trimmed.startsWith('Conversation info (untrusted')) return true
  if (trimmed.startsWith('Thread starter (untrusted')) return true
  if (/^json\s*[{[:]/i.test(trimmed)) return true
  if (/^[{[]/.test(trimmed)) return true
  if (/^```/.test(trimmed)) return true
  return false
}

// Extract agentId from session key format "agent:{agentId}:{uuid}"
function extractAgentIdFromKey(key?: string): string | undefined {
  if (!key) return undefined
  const parts = key.split(':')
  if (parts[0] === 'agent' && parts.length >= 3) return parts[1]
  return undefined
}

// Subagent sessions use key format "agent:<agentId>:subagent:<uuid>"
function isSubagentKey(key?: string): boolean {
  return !!key && key.includes(':subagent:')
}

// Cron-triggered sessions use key format "agent:<agentId>:cron:<jobName>"
function isCronKey(key?: string): boolean {
  return !!key && key.includes(':cron:')
}

/**
 * Returns true for an agent's built-in main session (key format "agent:<agentId>:main").
 * The gateway does not allow deleting these sessions.
 */
export function isMainSessionKey(key?: string): boolean {
  if (!key) return false
  const parts = key.split(':')
  return parts.length === 3 && parts[0] === 'agent' && parts[2] === 'main'
}

/** Clean up a session's lastMessage preview — strip noise, heartbeats, ANSI, etc. */
function sanitizeLastMessage(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const text = stripAnsi(raw).trim()
  if (!text) return undefined
  if (isNoiseContent(text)) return undefined
  // Strip cron-trigger user messages
  const lower = text.toLowerCase()
  if (lower.includes('a scheduled reminder has been triggered') || lower.includes('scheduled update')) return undefined
  return text
}

export async function listSessions(call: RpcCaller): Promise<Session[]> {
  const result = await call<any>('sessions.list', {
    includeDerivedTitles: true,
    includeLastMessage: true,
    limit: 50
  })

  const sessions = Array.isArray(result) ? result : (result?.sessions || [])
  return (Array.isArray(sessions) ? sessions : []).map((s: any) => {
    const key = s.key || s.id
    const spawned = (s.spawned ?? s.isSpawned ?? isSubagentKey(key)) || undefined
    const cron = (s.cron ?? isCronKey(key)) || undefined
    // Field priority: `label` first because that's what `sessions.patch`
    // writes and what our client-side auto-rename sets — it should always
    // win over the noisy server `derivedTitle` (first user message wrapped
    // in its metadata envelope). Then fall through derivedTitle →
    // displayName → title → key for sessions that have no explicit label.
    // Every text source runs through `sanitizeDerivedTitle` because the
    // server may also populate these fields with the wrapped string.
    const label = sanitizeDerivedTitle(typeof s.label === 'string' ? s.label : '')
    const derived = sanitizeDerivedTitle(typeof s.derivedTitle === 'string' ? s.derivedTitle : '')
    const display = sanitizeDerivedTitle(typeof s.displayName === 'string' ? s.displayName : '')
    const titleField = sanitizeDerivedTitle(typeof s.title === 'string' ? s.title : '')
    const resolvedTitle = label || derived || display || titleField || 'New Chat'
    return {
      id: key || `session-${Math.random()}`,
      key,
      title: resolvedTitle,
      agentId: s.agentId || extractAgentIdFromKey(key),
      createdAt: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
      updatedAt: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
      lastMessage: sanitizeLastMessage(s.lastMessagePreview || s.lastMessage),
      spawned,
      cron,
      parentSessionId: s.parentSessionId || s.parentKey || s.spawnedBy || undefined,
      // Session-level directives (v2026.3.12)
      thinkingLevel: s.thinkingLevel || undefined,
      fastMode: s.fastMode ?? undefined,
      verboseLevel: s.verboseLevel || undefined,
      reasoningLevel: s.reasoningLevel || undefined,
      model: s.model || undefined,
      modelProvider: s.modelProvider || undefined,
      inputTokens: s.inputTokens ?? undefined,
      outputTokens: s.outputTokens ?? undefined,
      totalTokens: s.totalTokens ?? undefined,
      contextTokens: s.contextTokens ?? undefined,
    }
  })
}

export async function createSession(agentId?: string): Promise<Session> {
  // In v3, sessions are created lazily on first message.
  // Generate a proper session key in the server's expected format.
  const agent = agentId || 'main'
  const uniqueId = generateUUID()
  const key = `agent:${agent}:${uniqueId}`
  return {
    id: key,
    key,
    title: 'New Chat',
    agentId: agent,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

export async function getSession(call: RpcCaller, sessionKey: string): Promise<Session | null> {
  try {
    const result = await call<any>('sessions.get', { key: sessionKey })
    const s = result?.session || result
    if (!s) return null
    const key = s.key || s.id || sessionKey
    return {
      id: key,
      key,
      title: s.title || s.label || key || 'New Chat',
      agentId: s.agentId || undefined,
      createdAt: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
      updatedAt: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
      lastMessage: s.lastMessagePreview || s.lastMessage || undefined,
      thinkingLevel: s.thinkingLevel || undefined,
      fastMode: s.fastMode ?? undefined,
      verboseLevel: s.verboseLevel || undefined,
      reasoningLevel: s.reasoningLevel || undefined,
      model: s.model || undefined,
      modelProvider: s.modelProvider || undefined,
      inputTokens: s.inputTokens ?? undefined,
      outputTokens: s.outputTokens ?? undefined,
      totalTokens: s.totalTokens ?? undefined,
      contextTokens: s.contextTokens ?? undefined,
    }
  } catch {
    return null
  }
}

export async function describeSession(
  call: RpcCaller,
  sessionKey: string,
  opts?: { includeDerivedTitles?: boolean; includeLastMessage?: boolean }
): Promise<Session | null> {
  try {
    const result = await call<any>('sessions.describe', {
      key: sessionKey,
      includeDerivedTitles: opts?.includeDerivedTitles ?? true,
      includeLastMessage: opts?.includeLastMessage ?? false,
    })
    const s = result?.session || result
    if (!s) return null
    const key = s.key || s.id || sessionKey
    return {
      id: key,
      key,
      title: s.title || s.label || key || 'New Chat',
      agentId: s.agentId || extractAgentIdFromKey(key),
      createdAt: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
      updatedAt: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
      lastMessage: sanitizeLastMessage(s.lastMessagePreview || s.lastMessage),
      thinkingLevel: s.thinkingLevel || undefined,
      fastMode: s.fastMode ?? undefined,
      verboseLevel: s.verboseLevel || undefined,
      reasoningLevel: s.reasoningLevel || undefined,
      model: s.model || undefined,
      modelProvider: s.modelProvider || undefined,
      inputTokens: s.inputTokens ?? undefined,
      outputTokens: s.outputTokens ?? undefined,
      totalTokens: s.totalTokens ?? undefined,
      contextTokens: s.contextTokens ?? undefined,
    }
  } catch {
    return null
  }
}

export async function deleteSession(call: RpcCaller, sessionId: string): Promise<void> {
  await call('sessions.delete', { key: sessionId })
}

export interface SessionPatchParams {
  label?: string | null
  thinkingLevel?: string | null
  fastMode?: boolean | null
  verboseLevel?: string | null
  reasoningLevel?: string | null
  model?: string | null
}

export async function updateSession(call: RpcCaller, sessionId: string, updates: SessionPatchParams): Promise<void> {
  const params: Record<string, unknown> = { key: sessionId }
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) params[k] = v
  }
  await call('sessions.patch', params)
}

export async function compactSession(call: RpcCaller, sessionId: string): Promise<void> {
  await call('sessions.compact', { key: sessionId })
}

export async function spawnSession(call: RpcCaller, agentId: string, prompt?: string): Promise<Session> {
  const result = await call<any>('sessions.spawn', { agentId, prompt })
  const s = result?.session || result || {}
  const key = resolveSessionKey(s) || `spawned-${Date.now()}`
  return {
    id: key,
    key,
    title: s.title || s.label || key,
    agentId: s.agentId || agentId,
    createdAt: toIsoTimestamp(s.createdAt ?? Date.now()),
    updatedAt: toIsoTimestamp(s.updatedAt ?? s.createdAt ?? Date.now()),
    spawned: true,
    parentSessionId: s.parentSessionId || s.parentKey || undefined
  }
}
