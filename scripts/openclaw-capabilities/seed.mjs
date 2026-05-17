#!/usr/bin/env node
/**
 * seed.mjs
 *
 * One-shot inventory seeder. Calls all extractors, merges upstream capabilities
 * with local implementation data, and writes docs/OPENCLAW_CAPABILITIES.md.
 *
 * Usage:
 *   node scripts/openclaw-capabilities/seed.mjs
 *   node scripts/openclaw-capabilities/seed.mjs --dry-run   # print diff, no write
 *
 * Output:
 *   docs/OPENCLAW_CAPABILITIES.md  — living inventory draft
 *
 * After seeding: human reviews, marks deliberate oos rows with reason in notes,
 * then run check.mjs to confirm zero unmapped.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

import {
  extractRpcs,
  extractEvents,
  extractTools,
  extractFlags,
  extractChannels,
  extractProviders,
  extractClientImpl,
  extractClientEvents,
} from './extractors.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outPath = resolve(root, 'docs', 'OPENCLAW_CAPABILITIES.md')
const dryRun = process.argv.includes('--dry-run')

// ── Category mapping for RPCs ─────────────────────────────────────────────────
// Maps known method name prefixes to inventory categories.

const RPC_CATEGORIES = {
  'sessions.': 'Sessions',
  'session.': 'Sessions',
  'chat.': 'Chat',
  'agent.': 'Agents',
  'agents.': 'Agents',
  'tasks.': 'Agents',
  'artifacts.': 'Agents',
  'environments.': 'Agents',
  'agent ': 'Agents',
  'skills.': 'Skills',
  'cron.': 'Cron',
  'config.': 'Config',
  'secrets.': 'Config',
  'update.': 'Config',
  'wizard.': 'Config',
  'hooks.': 'Hooks',
  'node.': 'Nodes',
  'device.': 'Nodes',
  'exec.': 'Nodes',
  'voicewake.': 'Features',
  'tts.': 'Features',
  'talk.': 'Features',
  'logs.': 'Logs',
  'log.': 'Logs',
  'usage.': 'Telemetry',
  'doctor.': 'Telemetry',
  'diagnostics.': 'Telemetry',
  'models.': 'Providers',
  'commands.': 'Sessions',
  'tools.': 'SDK/Plugin',
  'channels.': 'Channels',
  'web.login.': 'Channels',
  'push.': 'Features',
  'send': 'Chat',
  'health': 'Config',
  'status': 'Config',
  'gateway.': 'Config',
  'system-': 'Config',
  'last-': 'Config',
  'set-': 'Config',
}

function categoryForRpc(name) {
  for (const [prefix, cat] of Object.entries(RPC_CATEGORIES)) {
    if (name.startsWith(prefix) || name === prefix.trim()) return cat
  }
  return 'Experimental'
}

// ── OOS detection ─────────────────────────────────────────────────────────────
// Narrow server-internal surfaces pre-classified as out-of-scope.

const OOS_PREFIXES = [
  // Deployment/infra targets — not mobile surfaces
]

const OOS_EXACT = new Set([
  // Channel bridge mechanics — mobile is direct client, not bridge consumer
])

function isOos(cap) {
  for (const pfx of OOS_PREFIXES) {
    if (cap.name.startsWith(pfx)) return true
  }
  return OOS_EXACT.has(cap.name)
}

// ── Render helpers ─────────────────────────────────────────────────────────────

function tableRow(id, name, rpcEvent, status, ref, notes = '') {
  return `| ${id} | ${name} | \`${rpcEvent}\` | ${status} | ${ref || '—'} | ${notes} |`
}

function sectionTable(title, rows) {
  if (!rows.length) return ''
  const header = `## ${title}\n| id | capability | rpc/event | status | client ref | notes |\n|---|---|---|---|---|---|`
  return [header, ...rows].join('\n')
}

// ── Main ───────────────────────────────────────────────────────────────────────

console.log('Fetching upstream capabilities…')

const [rpcs, events, tools, flags, channels, providers, clientImpl, clientEvents] =
  await Promise.all([
    extractRpcs(),
    extractEvents(),
    extractTools(),
    extractFlags(),
    extractChannels(),
    extractProviders(),
    extractClientImpl(),
    extractClientEvents(),
  ])

console.log(`RPCs: ${rpcs.length}, Events: ${events.length}, Tools: ${tools.length}`)
console.log(`Flags: ${flags.length}, Channels: ${channels.length}, Providers: ${providers.length}`)
console.log(`Client impl: ${clientImpl.length} RPCs, ${clientEvents.length} events`)

// Build implemented sets for status resolution
const implRpcs = new Set(clientImpl.map(c => c.id))
const implEvents = new Set(clientEvents.map(c => c.name))

function resolveStatus(cap) {
  if (isOos(cap)) return 'oos'
  if (cap.kind === 'rpc' && implRpcs.has(cap.name)) return 'done'
  if (cap.kind === 'event' && implEvents.has(cap.name)) return 'done'
  return 'gap'
}

function clientRefFor(cap) {
  if (cap.kind === 'rpc') {
    const match = clientImpl.find(c => c.id === cap.name)
    return match?.client_ref || ''
  }
  if (cap.kind === 'event') {
    const match = clientEvents.find(c => c.name === cap.name)
    return match?.client_ref || ''
  }
  return ''
}

// ── Build inventory sections ───────────────────────────────────────────────────

// Group RPCs by category
const rpcByCategory = new Map()
for (const rpc of rpcs) {
  const cat = categoryForRpc(rpc.name)
  if (!rpcByCategory.has(cat)) rpcByCategory.set(cat, [])
  rpcByCategory.get(cat).push(rpc)
}

// Category order (matches plan schema)
const CATEGORY_ORDER = [
  'Sessions', 'Chat', 'Agents', 'Skills', 'Cron', 'Config', 'Hooks',
  'Nodes', 'Features', 'Logs', 'Memory', 'Tools', 'Automation',
  'Approvals', 'Channels', 'Providers', 'Security', 'Telemetry',
  'SDK/Plugin', 'Experimental',
]

const sections = []

for (const cat of CATEGORY_ORDER) {
  const catRpcs = rpcByCategory.get(cat) || []
  const rows = catRpcs.map(rpc => {
    const status = resolveStatus(rpc)
    const ref = clientRefFor(rpc)
    return tableRow(rpc.id, rpc.name, rpc.name, status, ref)
  })
  if (rows.length) sections.push(sectionTable(cat, rows))
}

// Events section
const eventRows = events.map(ev => {
  const status = resolveStatus(ev)
  const ref = clientRefFor(ev)
  return tableRow(ev.id, ev.name, ev.name, status, ref)
})
if (eventRows.length) sections.push(sectionTable('Events', eventRows))

// Tools section
const toolRows = tools.map(t => tableRow(t.id, t.name, `tool \`${t.name}\``, 'gap', '', ''))
if (toolRows.length) sections.push(sectionTable('Tools', toolRows))

// Flags section
const flagRows = flags.map(f => tableRow(f.id, f.name, `flag \`${f.name}\``, 'gap', '', ''))
if (flagRows.length) sections.push(sectionTable('Experimental flags', flagRows))

// Channels section — all oos by default (mobile is direct client, not bridge)
const channelRows = channels.map(c =>
  tableRow(c.id, c.name, 'n/a', 'oos', '—', 'gateway-side bridge; mobile is direct client')
)
if (channelRows.length) sections.push(sectionTable('Channels', channelRows))

// Providers section — separate per-provider docs pages (oos for now, not mobile's concern)
const providerRows = providers.map(p =>
  tableRow(p.id, p.name, 'n/a', 'gap', '', 'provider config — expose active provider in settings')
)
if (providerRows.length) sections.push(sectionTable('Providers', providerRows))

// ── Get latest openclaw release ref ───────────────────────────────────────────

let latestRef = 'unknown'
try {
  latestRef = execSync(
    `gh api repos/openclaw/openclaw/releases/latest --jq '.tag_name'`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }
  ).trim()
} catch {}

const today = new Date().toISOString().slice(0, 10)

// ── Assemble doc ───────────────────────────────────────────────────────────────

const doc = `---
schema: 1
last_reviewed: ${today}
openclaw_ref: ${latestRef}
---

# OpenClaw Capability Inventory

Status key: \`done\` | \`partial\` | \`gap\` | \`oos\` (out-of-scope for mobile)

Stable \`id\`s are the dedup key for the drift watcher — **never rename them**.

OOS discipline: only clearly server-internal surfaces use \`oos\`: deployment targets,
plugin SDK internals, channel-bridge mechanics for channels mobile doesn't run, and
gateway-admin-only TUI config. User-facing capabilities default to \`gap\` pending a
deliberate "no" decision (add reason in \`notes\`).

${sections.join('\n\n')}

---

## Triage loop

When the watcher files an issue:
1. Add a row with \`status: gap\` and a link to the roadmap plan under \`docs/plans/\`, OR
2. Mark \`oos\` with a written reason in \`notes\`, OR
3. Fold into an existing roadmap plan.

OOS is only for: deployment targets (Docker/Nix/K8s/Fly/Hetzner), plugin SDK internals
(HTTP routes, context engines, agent harness), channel-bridge mechanics for channels
mobile doesn't run, and gateway config that only makes sense in a server admin TUI.
`

// ── Output ────────────────────────────────────────────────────────────────────

if (dryRun) {
  const existing = existsSync(outPath) ? readFileSync(outPath, 'utf8') : ''
  if (existing === doc) {
    console.log('Dry run: no changes')
  } else {
    console.log('Dry run: would write docs/OPENCLAW_CAPABILITIES.md')
    console.log(`  done rows: ${[...doc.matchAll(/\| done \|/g)].length}`)
    console.log(`  gap rows:  ${[...doc.matchAll(/\| gap \|/g)].length}`)
    console.log(`  oos rows:  ${[...doc.matchAll(/\| oos \|/g)].length}`)
  }
} else {
  writeFileSync(outPath, doc, 'utf8')
  console.log(`Wrote docs/OPENCLAW_CAPABILITIES.md`)
  console.log(`  done: ${[...doc.matchAll(/\| done \|/g)].length}`)
  console.log(`  gap:  ${[...doc.matchAll(/\| gap \|/g)].length}`)
  console.log(`  oos:  ${[...doc.matchAll(/\| oos \|/g)].length}`)
  console.log('')
  console.log('Next: review the draft, mark deliberate oos rows with reason in notes,')
  console.log('then run: node scripts/openclaw-capabilities/check.mjs')
}
