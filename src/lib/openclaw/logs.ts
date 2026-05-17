import type { RpcCaller } from './types'

export interface LogsTailParams {
  limit?: number
  maxBytes?: number
  cursor?: number
}

export interface LogsTailResult {
  path: string
  cursor: number
  size: number
  lines: string[]
}

export async function tailLogs(call: RpcCaller, params: LogsTailParams = {}): Promise<LogsTailResult> {
  return call<LogsTailResult>('logs.tail', {
    limit: 500,
    maxBytes: 256 * 1024,
    ...params,
  })
}

/**
 * Reads `logging.file` from a parsed openclaw.json config (the object returned
 * inside `config.get`'s ConfigFileSnapshot). Returned when `logs.tail.path` is
 * empty so the UI can still surface the active log file.
 *
 * Returns null for: missing key, non-string value, or empty/whitespace string.
 * Does not attempt to derive the dated default (`/tmp/openclaw/openclaw-*.log`)
 * — that requires the gateway host's local date which the client cannot know.
 */
export function extractLoggingFile(config: unknown): string | null {
  if (config == null || typeof config !== 'object') return null
  const logging = (config as Record<string, unknown>).logging
  if (logging == null || typeof logging !== 'object') return null
  const file = (logging as Record<string, unknown>).file
  if (typeof file !== 'string') return null
  const trimmed = file.trim()
  return trimmed.length > 0 ? trimmed : null
}
