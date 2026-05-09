#!/usr/bin/env node
/**
 * generate-licenses.mjs
 *
 * Generates docs/legal/open-source-licenses.md from the direct runtime
 * dependencies listed in package.json.
 *
 * Scope (hybrid):
 *   - Full license text for every direct runtime dep (`dependencies` only).
 *   - devDependencies are excluded — they are not shipped in the app bundle.
 *   - expo-pinned-websocket (file: local module) is excluded as first-party.
 *   - Transitive deps covered by a footnote disclaimer.
 *
 * Usage:
 *   node scripts/generate-licenses.mjs
 *   npm run generate-licenses
 *
 * Run automatically by scripts/release.mjs on every version bump.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outPath = resolve(root, 'docs/legal/open-source-licenses.md');

// ── Read root package.json ─────────────────────────────────────────────────────

const rootPkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const deps = rootPkg.dependencies ?? {};

// ── License file finder ────────────────────────────────────────────────────────

// Prefer exact names first; fall back to any file whose name starts with
// LICENSE / LICENCE / COPYING (handles variants like LICENSE-MIT.txt).
const LICENSE_PRIORITY = [
  'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md', 'LICENCE.txt',
  'COPYING', 'COPYING.md', 'COPYING.txt',
];

function findLicenseFile(pkgDir) {
  for (const name of LICENSE_PRIORITY) {
    const candidate = join(pkgDir, name);
    if (existsSync(candidate)) return candidate;
  }
  // Fallback: scan directory for any file with a license-like prefix
  try {
    const entries = readdirSync(pkgDir, { withFileTypes: true });
    const prefixes = ['LICENSE', 'LICENCE', 'COPYING'];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const upper = entry.name.toUpperCase();
      if (prefixes.some(p => upper.startsWith(p))) {
        return join(pkgDir, entry.name);
      }
    }
  } catch {
    // ignore readdir failures
  }
  return null;
}

// ── Resolve package info from node_modules ─────────────────────────────────────

function resolveRepo(meta) {
  const r = meta.repository;
  if (!r) return null;
  if (typeof r === 'string') return r.replace(/^git\+/, '').replace(/\.git$/, '');
  if (typeof r === 'object' && r.url) {
    return r.url.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '');
  }
  return null;
}

function normalizeLicenseId(meta) {
  const l = meta.license ?? meta.licenses;
  if (!l) return 'UNKNOWN';
  if (typeof l === 'string') return l;
  if (Array.isArray(l)) return l.map(x => (typeof x === 'string' ? x : x.type ?? '')).join(' OR ');
  if (typeof l === 'object' && l.type) return l.type;
  return String(l);
}

function spdxUrl(id) {
  const clean = id.replace(/[()]/g, '').split(/\s+OR\s+/i)[0].trim();
  return `https://spdx.org/licenses/${clean}.html`;
}

// ── Collect packages ───────────────────────────────────────────────────────────

const entries = [];
const missing = [];

for (const [name, versionSpec] of Object.entries(deps)) {
  // Skip first-party local modules
  if (versionSpec.startsWith('file:')) continue;

  const pkgDir = resolve(root, 'node_modules', name);
  const metaPath = join(pkgDir, 'package.json');

  if (!existsSync(metaPath)) {
    console.warn(`  WARN: node_modules/${name}/package.json not found — skipping`);
    missing.push(name);
    continue;
  }

  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const licenseId = normalizeLicenseId(meta);
  const repo = resolveRepo(meta);
  const homepage = meta.homepage ?? null;
  const licenseFile = findLicenseFile(pkgDir);

  let licenseText = null;
  if (licenseFile) {
    licenseText = readFileSync(licenseFile, 'utf8').trimEnd();
  }

  entries.push({
    name,
    version: meta.version ?? versionSpec,
    licenseId,
    repo,
    homepage,
    licenseText,
    haslicenseFile: !!licenseFile,
  });

  if (!licenseFile) {
    missing.push(name);
  }
}

// Sort alphabetically
entries.sort((a, b) => a.name.localeCompare(b.name));

// ── Generate markdown anchor ───────────────────────────────────────────────────

function mdAnchor(name) {
  // GitHub/most renderers: lowercase, replace non-alphanum with -
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ── Emit markdown ──────────────────────────────────────────────────────────────

const now = new Date().toISOString().slice(0, 10);

const lines = [];

lines.push(`# Open Source Licenses`);
lines.push(``);
lines.push(`ClawBoy is built on the work of many open source projects. We are grateful to their authors and maintainers. The licenses below satisfy the attribution requirements of the MIT, BSD, ISC, and Apache-2.0 licenses governing these packages.`);
lines.push(``);
lines.push(`**Generated:** ${now} from \`package.json\` version ${rootPkg.version ?? '(unknown)'}`);
lines.push(``);
lines.push(`---`);
lines.push(``);
lines.push(`## Notes`);
lines.push(``);
lines.push(`- **Direct runtime dependencies** are listed below with full license text.`);
lines.push(`- **Transitive dependencies** (packages pulled in by the above) are governed by the same family of permissive licenses (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC). A complete machine-readable list is available on request by emailing [support@sundaysoftworks.com](mailto:support@sundaysoftworks.com).`);
lines.push(`- **expo-pinned-websocket** is a first-party native module developed by Sunday Softworks for ClawBoy and is not a third-party open source package.`);
lines.push(`- **Development-only packages** (\`devDependencies\`) are excluded — they are not bundled into the shipped app.`);
lines.push(``);
lines.push(`---`);
lines.push(``);
lines.push(`## Index`);
lines.push(``);

for (const e of entries) {
  lines.push(`- [${e.name}](#${mdAnchor(e.name)}) — ${e.licenseId}`);
}

lines.push(``);
lines.push(`---`);
lines.push(``);

for (const e of entries) {
  lines.push(`## ${e.name}`);
  lines.push(``);
  lines.push(`- **Version:** ${e.version}`);
  lines.push(`- **License:** ${e.licenseId}`);
  if (e.homepage) lines.push(`- **Homepage:** ${e.homepage}`);
  if (e.repo) lines.push(`- **Repository:** ${e.repo}`);
  lines.push(``);

  if (e.licenseText) {
    lines.push(`\`\`\``);
    lines.push(e.licenseText);
    lines.push(`\`\`\``);
  } else {
    lines.push(`> License text not bundled with this package. Canonical text available at ${spdxUrl(e.licenseId)}`);
  }

  lines.push(``);
  lines.push(`---`);
  lines.push(``);
}

// Trim trailing blank lines before final write
const output = lines.join('\n').trimEnd() + '\n';

writeFileSync(outPath, output, 'utf8');

// ── Summary ────────────────────────────────────────────────────────────────────

const total = entries.length;
const missingTextCount = entries.filter(e => !e.haslicenseFile).length;

console.log(`✓ Generated docs/legal/open-source-licenses.md`);
console.log(`  Packages: ${total}`);
if (missingTextCount > 0) {
  console.log(`  Missing license file (SPDX stub used): ${missingTextCount}`);
  for (const e of entries.filter(x => !x.haslicenseFile)) {
    console.log(`    - ${e.name} (${e.licenseId})`);
  }
}
if (missing.length > 0) {
  const notInNodeModules = missing.filter(n => !entries.find(e => e.name === n));
  if (notInNodeModules.length > 0) {
    console.log(`  Packages not found in node_modules (skipped): ${notInNodeModules.join(', ')}`);
  }
}
