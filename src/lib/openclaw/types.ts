// OpenClaw Protocol v3 - Type Definitions

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  thinking?: string
  images?: MessageImage[]
  audioUrl?: string
  videoUrl?: string
  audioAsVoice?: boolean
  /** Original content of a failed message, for retry */
  failedContent?: string
  /** Original attachments of a failed message, for retry */
  failedAttachments?: Array<{ type?: string; mimeType?: string; fileName?: string; content: string; previewUrl?: string }>
}

export interface MessageImage {
  url: string
  mimeType?: string
  alt?: string
}

export interface Session {
  id: string
  key: string
  title: string
  agentId?: string
  createdAt: string
  updatedAt: string
  lastMessage?: string
  spawned?: boolean
  parentSessionId?: string
  cron?: boolean
  // Session-level directives (v2026.3.12)
  thinkingLevel?: string
  fastMode?: boolean
  verboseLevel?: string
  reasoningLevel?: string
  model?: string
  modelProvider?: string
  // Token usage
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  contextTokens?: number
}

export interface Agent {
  id: string
  name: string
  description?: string
  status: 'online' | 'offline' | 'busy'
  avatar?: string
  emoji?: string
  theme?: string
  model?: string
  thinkingLevel?: string
  timeout?: number
  configured?: boolean
}

export interface AgentFile {
  name: string
  path: string
  missing: boolean
  size?: number
  updatedAtMs?: number
  content?: string
}

export interface SkillRequirements {
  bins: string[]
  anyBins: string[]
  env: string[]
  config: string[]
  os: string[]
}

export interface SkillInstallOption {
  id: string
  kind: string
  label: string
  bins?: string[]
}

export interface Skill {
  id: string
  name: string
  description: string
  triggers: string[]
  enabled?: boolean
  content?: string
  // Extended metadata from skills.status
  emoji?: string
  homepage?: string
  source?: string
  bundled?: boolean
  filePath?: string
  eligible?: boolean
  always?: boolean
  requirements?: SkillRequirements
  missing?: SkillRequirements
  install?: SkillInstallOption[]
}

// Cron job schedule types
export type CronScheduleType =
  | { kind: 'at'; at: string }
  | { kind: 'every'; everyMs: number; anchorMs?: number }
  | { kind: 'cron'; expr: string; tz?: string; staggerMs?: number }

export type CronSessionTarget = 'main' | 'isolated'
export type CronWakeMode = 'next-heartbeat' | 'now'

// Cron payload types
export type CronPayload =
  | { kind: 'systemEvent'; text: string }
  | { kind: 'agentTurn'; message: string; model?: string; thinking?: string; timeoutSeconds?: number }

// Cron delivery types
export interface CronDelivery {
  mode: 'none' | 'announce' | 'webhook'
  channel?: string
  to?: string
  bestEffort?: boolean
}

// Cron job runtime state (read-only)
export interface CronJobState {
  nextRunAtMs?: number
  lastRunAtMs?: number
  lastRunStatus?: 'ok' | 'error' | 'skipped'
  lastError?: string
  lastDurationMs?: number
  consecutiveErrors?: number
}

export interface CronJob {
  id: string
  name: string
  schedule: string
  scheduleRaw?: CronScheduleType
  sessionTarget?: CronSessionTarget
  wakeMode?: CronWakeMode
  payload?: CronPayload
  delivery?: CronDelivery
  agentId?: string | null
  deleteAfterRun?: boolean
  nextRun?: string
  status: 'active' | 'paused'
  description?: string
  content?: string
  state?: CronJobState
  enabled?: boolean
}

// Hook types (internal hooks from server config)
export interface Hook {
  id: string
  name: string
  enabled: boolean
  events?: string[]
  description?: string
  emoji?: string
  source?: 'bundled' | 'workspace' | 'managed'
  filePath?: string
  env?: Record<string, string>
  always?: boolean
  eligible?: boolean
  requirements?: SkillRequirements
  missing?: SkillRequirements
}

// Top-level hooks config (for master toggles / HTTP hooks)
export interface HooksConfig {
  enabled?: boolean
  path?: string
  token?: string
  defaultSessionKey?: string
  internal?: {
    enabled?: boolean
    entries?: Record<string, { enabled?: boolean; env?: Record<string, string>; [key: string]: unknown }>
  }
  mappings?: HookMapping[]
}

export interface HookMapping {
  id?: string
  match?: { path?: string; source?: string }
  action?: 'wake' | 'agent'
  name?: string
  agentId?: string
  channel?: string
  to?: string
}

export interface RequestFrame {
  type: 'req'
  id: string
  method: string
  params?: any
}

export interface ResponseFrame {
  type: 'res'
  id: string
  ok: boolean
  payload?: any
  error?: {
    code: string
    message: string
    details?: any
  }
}

export interface EventFrame {
  type: 'event'
  event: string
  payload?: any
}

export interface Node {
  nodeId: string
  displayName?: string
  platform?: string
  version?: string
  coreVersion?: string
  uiVersion?: string
  deviceFamily?: string
  modelIdentifier?: string
  remoteIp?: string
  caps: string[]
  commands: string[]
  pathEnv?: string
  permissions?: Record<string, boolean>
  connectedAtMs?: number
  paired: boolean
  connected: boolean
}

export type EventHandler = (...args: unknown[]) => void

export type RpcCaller = <T = any>(method: string, params?: any, options?: { timeoutMs?: number }) => Promise<T>

/** Minimal interface that both native WebSocket and NativeWebSocketWrapper satisfy. */
export interface WebSocketLike {
  readyState: number
  onopen: ((ev: any) => void) | null
  onclose: ((ev: any) => void) | null
  onerror: ((ev: any) => void) | null
  onmessage: ((ev: any) => void) | null
  send(data: string): void
  close(): void
  readonly CONNECTING: number
  readonly OPEN: number
  readonly CLOSING: number
  readonly CLOSED: number
}

/** Factory function that creates a WebSocket-like connection for the given URL. */
export type WebSocketFactory = (url: string) => WebSocketLike
