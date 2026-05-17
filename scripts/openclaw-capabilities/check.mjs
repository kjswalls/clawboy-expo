#!/usr/bin/env node
/**
 * check.mjs
 *
 * Daily drift checker. Diffs upstream OpenClaw capabilities against
 * docs/OPENCLAW_CAPABILITIES.md and state.json.
 *
 * Outputs (for GHA step):
 *   changed=true|false
 *   body_path=<path>   (when changed=true)
 *   ref=<release tag>  (when changed=true)
 *
 * Exit 0 always. Non-zero only on extractor failures that exceed sanity thresholds.
 *
 * Usage:
 *   node scripts/openclaw-capabilities/check.mjs
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
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
const inventoryPath = resolve(root, 'docs', 'OPENCLAW_CAPABILITIES.md')
const statePath = resolve(root, 'scripts', 'openclaw-capabilities', 'state.json')
const bodyPath = resolve(root, 'scripts', 'openclaw-capabilities', 'body.md')

// ── GHA output helper ──────────────────────────────────────────────────────────

function output(key, value) {
  const ghOutput = process.env.GITHUB_OUTPUT
  if (ghOutput) {
    appendFileSync(ghOutput, `${key}=${value}\n`)
  } else {
    console.log(`[output] ${key}=${value}`)
  }
}

// ── Load state ─────────────────────────────────────────────────────────────────

let state = {
  last_release: 'unknown',
  seen_unmapped: [],
  extractor_minimums: { rpc: 20, event: 8, tool: 8, flag: 2, channel: 10, provider: 15 },
}
if (existsSync(statePath)) {
  try {
    state = { ...state, ...JSON.parse(readFileSync(statePath, 'utf8')) }
  } catch (e) {
    console.error(`Failed to parse state.json: ${e.message}`)
  }
}

// ── Parse inventory ────────────────────────────────────────────────────────────

function parseInventory(text) {
  const known = new Set()
  const oos = new Set()

  // Parse table rows: | id | capability | rpc/event | status | ... |
  const rowRe = /^\| ([^|]+) \| [^|]+ \| [^|]+ \| (done|partial|gap|oos) \|/gm
  let m
  while ((m = rowRe.exec(text)) !== null) {
    const id = m[1].trim()
    const status = m[2].trim()
    known.add(id)
    if (status === 'oos') oos.add(id)
  }

  return { known, oos }
}

// ── Get latest release ─────────────────────────────────────────────────────────

function getLatestRelease() {
  try {
    return execSync(
      `gh api repos/openclaw/openclaw/releases/latest --jq '.tag_name'`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 }
    ).trim()
  } catch {
    try {
      return execSync(
        `gh api repos/openclaw/openclaw/tags --jq '.[0].name'`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 }
      ).trim()
    } catch {
      return 'unknown'
    }
  }
}

// ── Sanity check extractors ────────────────────────────────────────────────────

function sanityCheck(results, kind, minimum) {
  if (results.length < minimum) {
    console.error(
      `FAIL: ${kind} extractor returned ${results.length} (minimum ${minimum}). ` +
      `Upstream may have restructured. Fix extractors before continuing.`
    )
    process.exit(1)
  }
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

const min = state.extractor_minimums
sanityCheck(rpcs, 'rpc', min.rpc ?? 20)
sanityCheck(events, 'event', min.event ?? 8)
sanityCheck(tools, 'tool', min.tool ?? 8)
sanityCheck(flags, 'flag', min.flag ?? 2)
sanityCheck(channels, 'channel', min.channel ?? 10)
sanityCheck(providers, 'provider', min.provider ?? 15)

console.log(`RPCs: ${rpcs.length}, Events: ${events.length}, Tools: ${tools.length}`)
console.log(`Flags: ${flags.length}, Channels: ${channels.length}, Providers: ${providers.length}`)

// Build upstream set (all discovered capabilities)
const upstream = new Map()
for (const cap of [...rpcs, ...events, ...tools, ...flags, ...channels, ...providers]) {
  upstream.set(cap.id, cap)
}

// Parse current inventory
if (!existsSync(inventoryPath)) {
  console.error('docs/OPENCLAW_CAPABILITIES.md not found. Run seed.mjs first.')
  process.exit(1)
}
const inventoryText = readFileSync(inventoryPath, 'utf8')
const { known, oos } = parseInventory(inventoryText)

// Client implementations for regression detection
const implRpcs = new Set(clientImpl.map(c => c.id))
const implEvents = new Set(clientEvents.map(c => c.name))

// Unmapped = upstream − known − seen_unmapped − oos
const seenUnmapped = new Set(state.seen_unmapped)
const unmapped = []
for (const [id, cap] of upstream) {
  if (known.has(id)) continue
  if (seenUnmapped.has(id)) continue
  if (oos.has(id)) continue
  unmapped.push(cap)
}

// Regressions = known(gap) ∩ implemented in client
const regressions = []
const gapRe = /^\| ([^|]+) \| [^|]+ \| [^|]+ \| gap \|/gm
let rm
while ((rm = gapRe.exec(inventoryText)) !== null) {
  const id = rm[1].trim()
  if (implRpcs.has(id) || implEvents.has(id.replace(/^event\./, '').replace(/_/g, '.'))) {
    regressions.push(id)
  }
}

console.log(`Unmapped: ${unmapped.length}, Regressions: ${regressions.length}`)

// Get latest release info
const latestRef = getLatestRelease()

// Nothing to do?
if (unmapped.length === 0 && regressions.length === 0) {
  console.log('No drift detected. Updating state.last_release if changed.')
  if (latestRef !== state.last_release && latestRef !== 'unknown') {
    state.last_release = latestRef
    writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8')
    console.log(`state.last_release → ${latestRef}`)
  }
  output('changed', 'false')
  process.exit(0)
}

// ── Build issue body ───────────────────────────────────────────────────────────

function groupByKind(caps) {
  const groups = {}
  for (const cap of caps) {
    const k = cap.kind
    if (!groups[k]) groups[k] = []
    groups[k].push(cap)
  }
  return groups
}

const kindLabels = {
  rpc: 'RPCs',
  event: 'Events',
  tool: 'Tools',
  flag: 'Experimental flags',
  channel: 'Channels',
  provider: 'Providers',
}

const groups = groupByKind(unmapped)
const sections = []

for (const [kind, label] of Object.entries(kindLabels)) {
  const caps = groups[kind]
  if (!caps?.length) continue
  sections.push(`### New ${label}\n`)
  for (const cap of caps) {
    sections.push(`- \`${cap.id}\` — ${cap.name} ([source](${cap.source_url}))`)
  }
}

if (regressions.length) {
  sections.push('\n### Inventory drift: marked `gap` but implemented in client\n')
  for (const id of regressions) {
    sections.push(`- \`${id}\` — update status to \`done\` or \`partial\``)
  }
}

sections.push(`\n### Upstream release context\n`)
sections.push(`- Latest release: \`${latestRef}\` (previous: \`${state.last_release}\`)`)

sections.push('\n---')
sections.push('**Triage:** For each new capability, either:')
sections.push('1. Add a row to `docs/OPENCLAW_CAPABILITIES.md` with `status: gap` and a plan link, or')
sections.push('2. Mark `oos` with written reason in `notes`, or')
sections.push('3. Fold into an existing roadmap plan under `docs/plans/`.')
sections.push('')
sections.push('Once triaged, the id will not re-appear (recorded in `state.seen_unmapped`).')

const body = sections.join('\n')
writeFileSync(bodyPath, body, 'utf8')

// ── Update state ───────────────────────────────────────────────────────────────

for (const cap of unmapped) {
  if (!seenUnmapped.has(cap.id)) {
    state.seen_unmapped.push(cap.id)
  }
}
if (latestRef !== 'unknown') state.last_release = latestRef

// Update extractor minimums to 50% of current counts
state.extractor_minimums = {
  rpc: Math.floor(rpcs.length * 0.5),
  event: Math.floor(events.length * 0.5),
  tool: Math.floor(tools.length * 0.5),
  flag: Math.floor(flags.length * 0.5),
  channel: Math.floor(channels.length * 0.5),
  provider: Math.floor(providers.length * 0.5),
}

writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8')
console.log(`Updated state.json (seen_unmapped: ${state.seen_unmapped.length})`)

output('changed', 'true')
output('body_path', bodyPath)
output('ref', latestRef)

console.log(`Issue body written to ${bodyPath}`)
