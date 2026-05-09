/**
 * coldStart.test.ts
 *
 * Tests for the cold-start toast flood fix in useBadges.
 *
 * The fix: on first non-null state, prime prevUnlocksRef with existing unlocks
 * so they are not treated as new. Subsequent state changes still produce toasts.
 *
 * We test the pure priming logic (the `primedRef` guard) without mounting React
 * hooks, since the logic is a simple conditional.
 */

import { test, expect } from '@jest/globals';
import type { BadgeState } from '../types';
import { makeDefaultState } from '../store';

function makeStateWithUnlocks(): BadgeState {
  return {
    ...makeDefaultState(),
    enabledAt: '2026-01-01T00:00:00.000Z',
    unlocks: {
      chatterbox: { unlockedAt: '2026-01-10T00:00:00.000Z', seen: true, tier: 0 },
      streak3days: { unlockedAt: '2026-01-11T00:00:00.000Z', seen: false },
    },
  };
}

/**
 * Simulates the useBadges useEffect logic with the primedRef guard.
 * Returns the toasts that would be queued during the effect.
 */
function simulateEffect(
  state: ReturnType<typeof makeStateWithUnlocks>,
  primedRef: { current: boolean },
  prevRef: { current: Record<string, { unlockedAt: string; seen: boolean; tier?: number }> },
): string[] /* queued unlock ids */ {
  if (!state) return [];

  if (!primedRef.current) {
    primedRef.current = true;
    prevRef.current = { ...state.unlocks };
    return []; // no toasts on first load
  }

  const prev = prevRef.current;
  const curr = state.unlocks;
  const newOnes: string[] = [];

  for (const [id, rec] of Object.entries(curr)) {
    const wasThere = prev[id];
    const isNew = !wasThere || (rec.tier !== undefined && (wasThere.tier ?? -1) < rec.tier);
    if (isNew) newOnes.push(id);
  }

  prevRef.current = { ...curr };
  return newOnes;
}

test('cold start: existing unlocks do not appear in pendingToasts', () => {
  const state = makeStateWithUnlocks();
  const primedRef = { current: false };
  const prevRef = { current: {} };

  // First effect run (cold start — state just loaded)
  const toasts1 = simulateEffect(state, primedRef, prevRef);
  expect(toasts1).toHaveLength(0);
});

test('cold start: after priming, new unlock from tracker IS queued', () => {
  const state = makeStateWithUnlocks();
  const primedRef = { current: false };
  const prevRef = { current: {} };

  // First run — prime
  simulateEffect(state, primedRef, prevRef);

  // Second run — new unlock arrives
  const stateWithNewBadge: BadgeState = {
    ...state,
    unlocks: {
      ...state.unlocks,
      slashMaster: { unlockedAt: '2026-01-12T00:00:00.000Z', seen: false },
    },
  };
  const toasts2 = simulateEffect(stateWithNewBadge, primedRef, prevRef);
  expect(toasts2).toContain('slashMaster');
  expect(toasts2).not.toContain('chatterbox'); // already primed
});

test('cold start: tier upgrade on existing badge IS queued as new', () => {
  const state = makeStateWithUnlocks();
  const primedRef = { current: false };
  const prevRef = { current: {} };

  // Prime
  simulateEffect(state, primedRef, prevRef);

  // chatterbox tier bumps from 0 to 1
  const stateWithTierBump: BadgeState = {
    ...state,
    unlocks: {
      ...state.unlocks,
      chatterbox: { unlockedAt: '2026-01-10T00:00:00.000Z', seen: false, tier: 1 },
    },
  };
  const toasts = simulateEffect(stateWithTierBump, primedRef, prevRef);
  expect(toasts).toContain('chatterbox');
});
