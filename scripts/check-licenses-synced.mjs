#!/usr/bin/env node
/**
 * check-licenses-synced.mjs
 *
 * Verifies docs/legal/open-source-licenses.md matches generator output from
 * package.json + node_modules. Run via pretest (after npm install).
 *
 * The **Generated:** date line is ignored so the check does not fail daily
 * without substantive changes.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildOpenSourceLicensesMarkdown } from './generate-licenses.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = resolve(root, 'docs/legal/open-source-licenses.md');

const GENERATED_LINE = /^\*\*Generated:\*\* .+$/m;

function normalizeForCompare(md) {
  return md.replace(GENERATED_LINE, '__GENERATED_LINE__');
}

const current = readFileSync(outPath, 'utf8');
const { markdown: expected } = buildOpenSourceLicensesMarkdown(root);

if (normalizeForCompare(current) !== normalizeForCompare(expected)) {
  console.error(
    `\n  docs/legal/open-source-licenses.md is out of sync with package.json + node_modules.\n\n` +
    `  Fix: run \`npm run generate-licenses\` then commit the updated file.\n`,
  );
  process.exit(1);
}

console.log('check-licenses-synced: OK');
