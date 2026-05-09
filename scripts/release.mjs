#!/usr/bin/env node
/**
 * release.mjs
 *
 * Bump the app version, finalize the [Unreleased] changelog section, and
 * regenerate src/constants/changelog.ts — all in one step.
 *
 * Usage:
 *   node scripts/release.mjs patch   # 1.0.0 → 1.0.1
 *   node scripts/release.mjs minor   # 1.0.0 → 1.1.0
 *   node scripts/release.mjs major   # 1.0.0 → 2.0.0
 *
 *   npm run release:patch
 *   npm run release:minor
 *   npm run release:major
 *
 * What it does:
 *   1. Reads version from app.json (single source of truth).
 *   2. Computes next semver.
 *   3. Validates that [Unreleased] has actual content (refuses to make an
 *      empty release).
 *   4. In CHANGELOG.md: moves [Unreleased] content into a dated release
 *      section, resets [Unreleased] to the empty placeholder, and updates
 *      the reference links at the bottom.
 *   5. Updates app.json and package.json to the new version.
 *   6. Runs `node scripts/sync-changelog.mjs` to regenerate changelog.ts.
 *   7. Prints the git commands to commit and tag.
 *
 * After this script you still need to:
 *   git add -A
 *   git commit -m "chore(release): v<next>"
 *   git tag v<next>
 *   # Then either: eas update (OTA) or eas build + eas submit (store)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ── Args ───────────────────────────────────────────────────────────────────────

const bump = process.argv[2];
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error('Usage: node scripts/release.mjs patch|minor|major');
  process.exit(1);
}

// ── Read current version ───────────────────────────────────────────────────────

const appJsonPath = resolve(root, 'app.json');
const pkgJsonPath = resolve(root, 'package.json');
const changelogPath = resolve(root, 'CHANGELOG.md');

const app = JSON.parse(readFileSync(appJsonPath, 'utf8'));
const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));

const current = app.expo.version;
if (!current || !/^\d+\.\d+\.\d+$/.test(current)) {
  console.error(`app.json has unexpected version format: "${current}"`);
  process.exit(1);
}

const [maj, min, pat] = current.split('.').map(Number);
const next =
  bump === 'major' ? `${maj + 1}.0.0` :
  bump === 'minor' ? `${maj}.${min + 1}.0` :
                     `${maj}.${min}.${pat + 1}`;

console.log(`Releasing: ${current} → ${next}`);

// ── Validate CHANGELOG ─────────────────────────────────────────────────────────

let md = readFileSync(changelogPath, 'utf8');

// Empty placeholder: ## [Unreleased] immediately followed by only the empty note
const emptyPattern = /^## \[Unreleased\]\s*\n\s*_No unreleased changes yet\._\s*\n/m;
if (emptyPattern.test(md)) {
  console.error(
    '\nRefusing: [Unreleased] section is empty.\n' +
    'Add at least one bullet under ## [Unreleased] in CHANGELOG.md before releasing.',
  );
  process.exit(1);
}

// Confirm [Unreleased] section exists at all
if (!/^## \[Unreleased\]/m.test(md)) {
  console.error('Could not find ## [Unreleased] in CHANGELOG.md');
  process.exit(1);
}

// ── Rewrite CHANGELOG.md ───────────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);

// Replace the [Unreleased] heading with:
//   [Unreleased] (reset empty) + separator + new versioned heading
md = md.replace(
  /^## \[Unreleased\]/m,
  `## [Unreleased]\n\n_No unreleased changes yet._\n\n---\n\n## [${next}] - ${today}`,
);

// Remove the stale empty-placeholder line that was right after [Unreleased]
// (the old "_No unreleased changes yet._" that was there before real content)
// This handles the case where someone left the placeholder AND added content below it.
// The replace above inserts a fresh placeholder, so we just need to deduplicate
// if there happened to be two placeholders in a row.
md = md.replace(
  /_No unreleased changes yet\._\s*\n\n_No unreleased changes yet\._/,
  '_No unreleased changes yet._',
);

// Update reference-link footer
// Remove any existing [Unreleased] and versioned links, rebuild them cleanly.
const REPO = 'https://github.com/your-org/clawboy-expo';
md = md.replace(/^\[Unreleased\]:.*$/m, `[Unreleased]: ${REPO}/compare/v${next}...HEAD`);
md = md.replace(new RegExp(`^\\[${escapeRegex(next)}\\]:.*$`, 'm'), ''); // remove if already exists

// Insert the new versioned link after [Unreleased] link
const prevVersionPattern = new RegExp(`^(\\[Unreleased\\]:.*\\n)`, 'm');
const prevTag = current;
const newVersionLine = `[${next}]: ${REPO}/compare/v${prevTag}...v${next}`;
md = md.replace(prevVersionPattern, `$1${newVersionLine}\n`);

// Clean up any double-blank lines introduced near the link block
md = md.replace(/\n{3,}(\[)/g, '\n$1');

writeFileSync(changelogPath, md, 'utf8');
console.log(`✓ CHANGELOG.md updated`);

// ── Bump version in app.json and package.json ──────────────────────────────────

app.expo.version = next;
writeFileSync(appJsonPath, JSON.stringify(app, null, 2) + '\n', 'utf8');
console.log(`✓ app.json version: ${next}`);

pkg.version = next;
writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log(`✓ package.json version: ${next}`);

// ── Regenerate changelog.ts ────────────────────────────────────────────────────

execSync('node scripts/sync-changelog.mjs', { stdio: 'inherit', cwd: root });
execSync('node scripts/generate-licenses.mjs', { stdio: 'inherit', cwd: root });

// ── Done ───────────────────────────────────────────────────────────────────────

console.log(`
Release v${next} prepared. Next steps:

  git add -A
  git commit -m "chore(release): v${next}"
  git tag v${next}

Then ship:
  OTA-only (JS changes only):
    eas update --channel production --message "v${next}"

  Store build (native changes / version bump visible to OS):
    eas build --profile production --platform all
    eas submit --platform ios
`);

// ── Helpers ────────────────────────────────────────────────────────────────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
