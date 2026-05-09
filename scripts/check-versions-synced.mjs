#!/usr/bin/env node
/**
 * check-versions-synced.mjs
 *
 * Verifies that app.json expo.version and package.json version are identical.
 * Run automatically via the `pretest` npm script.
 *
 * Exit 0 if in sync. Exit 1 with an actionable message if not.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const appVersion = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8')).expo?.version;
const pkgVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;

if (!appVersion) {
  console.error('check-versions-synced: could not read expo.version from app.json');
  process.exit(1);
}

if (appVersion !== pkgVersion) {
  console.error(
    `\n  Version drift detected!\n` +
    `    app.json    expo.version = "${appVersion}"\n` +
    `    package.json      version = "${pkgVersion}"\n\n` +
    `  Fix: run \`npm run release:patch|minor|major\` to bump both together,\n` +
    `  or manually set both to the same value.\n`,
  );
  process.exit(1);
}

console.log(`check-versions-synced: OK (${appVersion})`);
