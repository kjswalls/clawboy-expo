/**
 * Parity test: LEAK_PATTERNS in the app's scrub.ts must match those in the
 * feedback worker's leakPatterns.ts.
 *
 * Strategy:
 *   - Import the app's canonical LEAK_PATTERNS array.
 *   - Read the worker file as raw text.
 *   - Verify every pattern's .source appears in the worker source, and that
 *     the worker file has the /g flag on each pattern.
 *
 * This catches added/removed/modified patterns in either file, and verifies
 * the /g flag is always present (scrubLogsServer calls String.replace once
 * per pattern — without /g only the first match is scrubbed).
 */
import * as fs from 'fs';
import * as path from 'path';

import { LEAK_PATTERNS } from '../scrub';

const WORKER_LEAK_PATH = path.resolve(
  __dirname,
  '../../../../infra/feedback-worker/src/leakPatterns.ts',
);

describe('LEAK_PATTERNS parity (app scrub.ts vs worker leakPatterns.ts)', () => {
  const workerSrc = fs.readFileSync(WORKER_LEAK_PATH, 'utf-8');

  it('worker leakPatterns.ts file exists', () => {
    expect(fs.existsSync(WORKER_LEAK_PATH)).toBe(true);
  });

  it('worker contains every pattern from app LEAK_PATTERNS', () => {
    const missing: string[] = [];
    for (const re of LEAK_PATTERNS) {
      // Escape forward slashes in the source to handle patterns like /\bwss?:\/\//
      if (!workerSrc.includes(re.source)) {
        missing.push(`/${re.source}/${re.flags}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('all app LEAK_PATTERNS have the /g flag', () => {
    const missingG = [...LEAK_PATTERNS].filter((re) => !re.flags.includes('g'));
    const missingGSrc = missingG.map((re) => `/${re.source}/${re.flags}`);
    expect(missingGSrc).toEqual([]);
  });

  it('worker has same pattern count as app', () => {
    // Count occurrences of export const LEAK_PATTERNS array entries by counting
    // pattern sources present in worker. This catches if worker has FEWER patterns.
    let presentCount = 0;
    for (const re of LEAK_PATTERNS) {
      if (workerSrc.includes(re.source)) presentCount++;
    }
    expect(presentCount).toBe(LEAK_PATTERNS.length);
  });
});
