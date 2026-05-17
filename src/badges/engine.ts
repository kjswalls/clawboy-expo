/**
 * BadgeEngine — pure deterministic function.
 *
 * evaluate(counters, unlocks, entitlement, now) => { newUnlocks }
 *
 * Constraints:
 *   - No Date.now() calls. `now` is injected by caller.
 *   - No IO. No side effects.
 *   - No globals (besides BADGE_DEFINITIONS which is compile-time constant).
 *   - Fully unit-testable with fake data and fake time.
 */

import type {
  BadgeState,
  BadgeStateCounters,
  BadgeEntitlementTier,
  EngineResult,
  NewUnlock,
} from './types';
import { BADGE_DEFINITIONS } from './definitions';
import { ACTIVE_BADGE_WAVES } from './config';

// ─── Gate check ───────────────────────────────────────────────────────────────

function isGateOpen(
  gate: 'free' | 'pro' | 'founder',
  tier: BadgeEntitlementTier,
): boolean {
  if (gate === 'free') return true;
  if (gate === 'pro') return tier === 'pro' || tier === 'founder';
  // gate === 'founder'
  return tier === 'founder';
}

// ─── Evaluate ────────────────────────────────────────────────────────────────

export function evaluate(
  counters: BadgeStateCounters,
  unlocks: BadgeState['unlocks'],
  entitlement: { tier: BadgeEntitlementTier },
  now: Date,
): EngineResult {
  const newUnlocks: NewUnlock[] = [];

  for (const def of BADGE_DEFINITIONS) {
    // Skip badges in inactive release waves.
    const wave = def.releaseWave ?? 0;
    if (!ACTIVE_BADGE_WAVES.has(wave)) continue;

    // Skip if gate isn't open for this entitlement tier.
    if (!isGateOpen(def.gate, entitlement.tier)) continue;

    // Fast-path: skip badges already fully earned without running their predicate.
    if (def.kind !== 'track') {
      // One-shot, easter egg, founders: nothing to earn once unlocked.
      if (unlocks[def.id]?.unlockedAt) continue;
    } else if (def.tiers) {
      // Track: skip only if at the absolute max tier (freeTierMax upgrades still re-evaluate).
      const maxTier = def.tiers.length - 1;
      if ((unlocks[def.id]?.tier ?? -1) >= maxTier) continue;
    }

    // Evaluate predicate — pass def so predicates can reference requiresIds without duplication.
    const result = def.predicate(counters, unlocks, now, def);
    if (result === null) continue;

    if ('unlocked' in result) {
      // One-shot / easter egg / founders badge.
      newUnlocks.push({ id: def.id, unlockedAt: now.toISOString() });
    } else if ('tier' in result) {
      // Track badge.
      const predicateTier = result.tier;

      // Enforce partial free gating: free users can only reach freeTierMax.
      let allowedTier = predicateTier;
      if (def.freeTierMax !== undefined && entitlement.tier === 'free') {
        allowedTier = Math.min(predicateTier, def.freeTierMax);
      }

      const existingRecord = unlocks[def.id];
      const existingTier = existingRecord?.tier ?? -1;

      if (allowedTier > existingTier) {
        newUnlocks.push({
          id: def.id,
          unlockedAt: now.toISOString(),
          tier: allowedTier,
        });
      }
    }
  }

  return { newUnlocks };
}
