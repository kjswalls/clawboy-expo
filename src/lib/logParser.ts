export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'unknown'

export interface LogLine {
  /** Stable unique ID for FlatList keying: seq + raw prefix */
  id: string
  /** Full original text (may span multiple merged source lines) */
  raw: string
  /** ISO timestamp string or null if not parseable */
  ts: string | null
  level: LogLevel
  /** Optional subsystem/tag e.g. "[tools]" or "agents/tool-images" */
  tag: string | null
  /** Message body (everything after level + tag) */
  msg: string
}

// Regex for the standard gateway log line format:
//   2026-03-18T04:21:12.054Z info [tools] message body
//   2026-03-18T04:21:12.054Z info agents/tool-images {"json":"payload"} message
const LOG_RE =
  /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(info|warn|warning|error|debug)\s+(?:(\[?[\w\-/.:]+\]?)\s+)?(.*)$/i

// Detect whether a line starts with an ISO timestamp (used by coalesceMultiline).
const TS_PREFIX_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s/

// Detect tslog JSON records — belt-and-suspenders marker.
const TSLOG_JSON_RE = /^\{".*"_meta":/

function normaliseLevel(raw: string): LogLevel {
  const l = raw.toLowerCase()
  if (l === 'warning') return 'warn'
  if (l === 'info' || l === 'warn' || l === 'error' || l === 'debug') return l as LogLevel
  if (l === 'fatal') return 'error'
  if (l === 'trace' || l === 'silly' || l === 'verbose') return 'debug'
  return 'unknown'
}

/**
 * Extract a human-readable tag from the tslog `_meta.name` field.
 * `name` is often a JSON-encoded subsystem descriptor like `"{\"subsystem\":\"cron\"}"`.
 * Returns e.g. "openclaw/cron" combining parentNames + subsystem.
 */
function extractTag(meta: Record<string, unknown>): string | null {
  const nameRaw = meta.name
  if (typeof nameRaw !== 'string' || !nameRaw) return null

  let subsystem: string | null = null

  // Try to parse name as JSON to pull out .subsystem
  try {
    const parsed = JSON.parse(nameRaw)
    if (parsed && typeof parsed === 'object' && typeof parsed.subsystem === 'string') {
      subsystem = parsed.subsystem
    }
  } catch {
    // name is a plain string — use as-is
    subsystem = nameRaw
  }

  if (!subsystem) subsystem = nameRaw

  // Prefix with parent path, e.g. ["openclaw"] → "openclaw/cron"
  const parents = Array.isArray(meta.parentNames) ? (meta.parentNames as string[]) : []
  if (parents.length > 0) {
    return [...parents, subsystem].join('/')
  }
  return subsystem
}

/**
 * Build the human message from the numeric-keyed tslog fields ("0", "1", "2", ...).
 * Skips values that look like subsystem descriptors (already used for the tag).
 */
function extractMsg(record: Record<string, unknown>, meta: Record<string, unknown>): string {
  // Collect the tag value so we can skip it in the message.
  const nameRaw = typeof meta.name === 'string' ? meta.name : null

  const parts: string[] = []
  // Numeric string keys in insertion order.
  for (const key of Object.keys(record)) {
    if (key === '_meta') continue
    const val = record[key]

    // Skip if this value is the same as the raw name descriptor (would duplicate the tag).
    if (typeof val === 'string') {
      if (nameRaw && val === nameRaw) continue
      // Skip if it's a JSON subsystem descriptor that matches the tag.
      try {
        const parsed = JSON.parse(val)
        if (parsed && typeof parsed === 'object' && 'subsystem' in parsed) continue
      } catch {
        // not JSON — keep it
      }
      parts.push(val)
    } else if (val !== null && val !== undefined) {
      parts.push(JSON.stringify(val))
    }
  }

  return parts.join(' ').trim()
}

/**
 * Try to parse a tslog-style JSON log record.
 * Returns null if the line is not a tslog record.
 */
function parseTsLogRecord(raw: string, seq: number): LogLine | null {
  if (!raw.startsWith('{')) return null

  let record: Record<string, unknown>
  try {
    record = JSON.parse(raw)
  } catch {
    return null
  }

  const meta = record['_meta']
  if (!meta || typeof meta !== 'object') return null

  const m = meta as Record<string, unknown>

  const ts = typeof m.date === 'string' ? m.date : null
  const level = normaliseLevel(typeof m.logLevelName === 'string' ? m.logLevelName : '')
  const tag = extractTag(m)
  const msg = extractMsg(record, m)

  return {
    id: `log-${seq}`,
    raw,
    ts,
    level,
    tag,
    msg,
  }
}

/**
 * Merge continuation lines (lines that don't start with an ISO timestamp
 * and aren't tslog JSON records) into the preceding line.
 * This handles stack traces and multi-line JSON blobs.
 */
export function coalesceMultiline(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    const isTslogJson = TSLOG_JSON_RE.test(line)
    if (out.length === 0 || TS_PREFIX_RE.test(line) || isTslogJson) {
      out.push(line)
    } else {
      out[out.length - 1] = out[out.length - 1] + '\n' + line
    }
  }
  return out
}

/**
 * Parse a single (possibly coalesced) log line into a structured LogLine.
 * `seq` is a monotonically increasing counter used to generate a stable ID.
 *
 * Tries:
 * 1. tslog JSON record (gateway native format)
 * 2. Plain-text log line regex
 * 3. Unknown fallback
 */
export function parseLogLine(raw: string, seq: number): LogLine {
  const trimmed = raw.trimEnd()

  // Try tslog JSON first.
  const tslog = parseTsLogRecord(trimmed, seq)
  if (tslog) return tslog

  // Fall back to plain-text regex.
  const match = LOG_RE.exec(trimmed)

  if (!match) {
    return {
      id: `log-${seq}`,
      raw: trimmed,
      ts: null,
      level: 'unknown',
      tag: null,
      msg: trimmed,
    }
  }

  const [, ts, levelRaw, tag, msg] = match
  return {
    id: `log-${seq}`,
    raw: trimmed,
    ts: ts ?? null,
    level: normaliseLevel(levelRaw ?? ''),
    tag: tag ?? null,
    msg: msg ?? '',
  }
}
