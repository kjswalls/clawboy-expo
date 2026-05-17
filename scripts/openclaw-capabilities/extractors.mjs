#!/usr/bin/env node
/**
 * extractors.mjs
 *
 * Shared capability extractors for seed.mjs and check.mjs.
 * Each extractor returns { id, name, kind, source_url }[]
 *
 * Upstream fetches: tries `gh api` first (GHA GITHUB_TOKEN, local gh auth),
 * falls back to raw.githubusercontent.com for public repo access.
 */

import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const REPO = 'openclaw/openclaw'
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`

// ── Fetch upstream file ────────────────────────────────────────────────────────

async function fetchFile(path) {
  const sourceUrl = `${RAW_BASE}/${path}`

  // gh api: works in GHA (GITHUB_TOKEN) and locally (gh auth login)
  try {
    const json = execSync(`gh api repos/${REPO}/contents/${path}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
    })
    const { content } = JSON.parse(json)
    const text = Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf8')
    return { text, sourceUrl }
  } catch {}

  // fallback: unauthenticated fetch (public repo)
  const res = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`fetch ${sourceUrl} → ${res.status}`)
  return { text: await res.text(), sourceUrl }
}

// ── Section splitter ───────────────────────────────────────────────────────────

function slice(text, from, to) {
  const s = text.indexOf(from)
  if (s === -1) return ''
  const body = text.slice(s + from.length)
  if (!to) return body
  const e = body.indexOf(to)
  return e === -1 ? body : body.slice(0, e)
}

// Single-word RPC allowlist (real gateway RPCs without a dot in the name)
const SINGLE_WORD_RPCS = new Set(['health', 'status', 'send', 'connect', 'wake', 'ping'])

// Extract the first `identifier` from a bullet line, plus any that immediately
// follow in a comma/and-separated list before the description starts.
function bulletIdentifiers(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('- ')) return []

  // Match backtick-wrapped identifiers (allow dots and hyphens; no underscores for RPCs)
  const re = /`([a-z][a-z0-9.-]*)(?:[(`\s,]|$)/g
  const ids = []
  let m
  let first = true

  while ((m = re.exec(trimmed)) !== null) {
    const id = m[1]

    // Skip scopes, config paths, and param-like words
    if (
      /^operator\./.test(id) ||
      /^agents\.defaults\./.test(id) ||
      /^skills\.install\./.test(id) ||
      /^models\.providers\./.test(id) ||
      /^tools\.profile$/.test(id) ||
      /^tools\.(allow|deny)$/.test(id)
    ) continue

    // Single-word identifiers must be in the explicit allowlist
    if (!id.includes('.') && !SINGLE_WORD_RPCS.has(id)) continue

    ids.push(id)

    if (first) {
      first = false
      // Continue extracting only comma/and-separated continuations
      const after = trimmed.slice(m.index + m[0].length)
      if (!after.startsWith(',') && !after.startsWith(' and `') && !after.startsWith(', `')) break
    }
  }

  return ids
}

function isValidId(name) {
  return /^[a-z][a-z0-9_.-]*$/.test(name) && name.length > 1
}

// ── RPC extractor ──────────────────────────────────────────────────────────────

export async function extractRpcs() {
  const { text, sourceUrl } = await fetchFile('docs/gateway/protocol.md')

  const sections = [
    slice(text, '## Common RPC method families', '### Common event families'),
    slice(text, '### Node helper methods', '### Task ledger RPCs'),
    slice(text, '### Task ledger RPCs', '### Operator helper methods'),
    slice(text, '### Operator helper methods', "### `models.list`"),
  ].join('\n')

  const rpcs = new Map()
  for (const line of sections.split('\n')) {
    for (const name of bulletIdentifiers(line)) {
      if (isValidId(name) && !rpcs.has(name)) {
        rpcs.set(name, { id: name, name, kind: 'rpc', source_url: sourceUrl })
      }
    }
  }
  return [...rpcs.values()]
}

// ── Event extractor ────────────────────────────────────────────────────────────

export async function extractEvents() {
  const { text, sourceUrl } = await fetchFile('docs/gateway/protocol.md')
  const section = slice(text, '### Common event families', '### Node helper methods')

  // Known single-word event names (event families without a dot)
  const SINGLE_WORD_EVENTS = new Set(['chat', 'presence', 'tick', 'health', 'heartbeat', 'cron', 'shutdown'])

  const events = new Map()
  const re = /`([a-z][a-z0-9_./*-]+)`/g
  let m
  while ((m = re.exec(section)) !== null) {
    const name = m[1]
    if (!isValidId(name) || name.includes('/')) continue
    // Single-word names must be in the event allowlist
    if (!name.includes('.') && !SINGLE_WORD_EVENTS.has(name)) continue
    if (!events.has(name)) {
      events.set(name, { id: `event.${name.replace(/\./g, '_')}`, name, kind: 'event', source_url: sourceUrl })
    }
  }
  return [...events.values()]
}

// ── Tool extractor ─────────────────────────────────────────────────────────────

export async function extractTools() {
  const { text, sourceUrl } = await fetchFile('docs/tools/index.md')

  // Extract backtick-wrapped tool names from the built-in categories table
  const tableSection = slice(text, '## Built-in tool categories', '## ')
  const tools = new Map()

  // Match tool names from table rows (snake_case, no wildcards)
  const re = /`([a-z][a-z0-9_]*)(?:`|,|\s)/g
  let m
  while ((m = re.exec(tableSection)) !== null) {
    const name = m[1]
    // Skip wildcard patterns and single-char names
    if (name.includes('*') || name.length < 2) continue
    if (isValidId(name) && !name.includes('.')) {
      tools.set(name, { id: `tool.${name}`, name, kind: 'tool', source_url: sourceUrl })
    }
  }

  return [...tools.values()]
}

// ── Flag extractor ─────────────────────────────────────────────────────────────

export async function extractFlags() {
  const { text, sourceUrl } = await fetchFile('docs/concepts/experimental-features.md')

  // Extract flag keys from the table (first column: `agents.defaults.experimental.*`)
  const tableSection = slice(text, '## Currently documented flags', '## ')
  const flags = new Map()

  const re = /`((?:agents|tools)\.(?:[\w.]+\.)?experimental\.[\w]+)`/g
  let m
  while ((m = re.exec(tableSection)) !== null) {
    const name = m[1]
    const id = `flag.${name.replace(/\./g, '_')}`
    if (!flags.has(id)) {
      flags.set(id, { id, name, kind: 'flag', source_url: sourceUrl })
    }
  }

  return [...flags.values()]
}

// ── Channel extractor ──────────────────────────────────────────────────────────

export async function extractChannels() {
  const { text, sourceUrl } = await fetchFile('docs/channels/index.md')
  const section = slice(text, '## Supported channels', '## Notes')

  const channels = []
  const re = /^- \[([^\]]+)\]\(\/channels\/([^)]+)\)/gm
  let m
  while ((m = re.exec(section)) !== null) {
    const name = m[1]
    const slug = m[2]
    channels.push({ id: `channel.${slug}`, name, kind: 'channel', source_url: `${RAW_BASE}/docs/channels/${slug}.md` })
  }
  return channels
}

// ── Provider extractor ─────────────────────────────────────────────────────────

export async function extractProviders() {
  const { text, sourceUrl } = await fetchFile('docs/providers/index.md')
  const section = slice(text, '## Provider docs', '## ')

  const providers = []
  const re = /^- \[([^\]]+)\]\(\/providers\/([^)]+)\)/gm
  let m
  while ((m = re.exec(section)) !== null) {
    const name = m[1]
    const slug = m[2]
    providers.push({ id: `provider.${slug}`, name, kind: 'provider', source_url: `${RAW_BASE}/docs/providers/${slug}.md` })
  }
  return providers
}

// ── Client implementation extractor ───────────────────────────────────────────

export async function extractClientImpl() {
  const libDir = resolve(root, 'src/lib/openclaw')
  const implemented = new Map()

  let files
  try {
    files = readdirSync(libDir).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))
  } catch {
    return []
  }

  for (const file of files) {
    const content = readFileSync(resolve(libDir, file), 'utf8')
    const clientRef = `src/lib/openclaw/${file}`

    // Match: call<Type>('method.name', ...) or call('method.name', ...)
    const re = /\bcall(?:<[^>]+>)?\(\s*['"]([a-z][a-z0-9._-]*)['"](?:\s*,|\s*\))/g
    let m
    while ((m = re.exec(content)) !== null) {
      const name = m[1]
      if (!implemented.has(name)) {
        implemented.set(name, { id: name, name, kind: 'client_done', client_ref: clientRef })
      }
    }

    // Match: caller<Type>('method.name', ...)  — commands.ts style
    const re2 = /\bcaller(?:<[^>]+>)?\(\s*['"]([a-z][a-z0-9._-]*)['"](?:\s*,|\s*\))/g
    while ((m = re2.exec(content)) !== null) {
      const name = m[1]
      if (!implemented.has(name)) {
        implemented.set(name, { id: name, name, kind: 'client_done', client_ref: clientRef })
      }
    }
  }

  return [...implemented.values()]
}

// ── Event handler extractor ────────────────────────────────────────────────────
// Extract event names from client.ts dispatch switch (case 'event.name':)

export async function extractClientEvents() {
  const clientPath = resolve(root, 'src/lib/openclaw/client.ts')
  const events = new Map()

  let content
  try {
    content = readFileSync(clientPath, 'utf8')
  } catch {
    return []
  }

  const re = /case\s+['"]([a-z][a-z0-9._-]*)['"]:/g
  let m
  while ((m = re.exec(content)) !== null) {
    const name = m[1]
    if (!events.has(name)) {
      events.set(name, { id: `event.${name.replace(/\./g, '_')}`, name, kind: 'event_client', client_ref: 'src/lib/openclaw/client.ts' })
    }
  }

  return [...events.values()]
}
