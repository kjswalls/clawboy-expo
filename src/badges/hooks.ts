/**
 * Badge system React hooks.
 *
 * useBadgeState    — raw state + enable/disable + mutations (from BadgesContext)
 * useEntitlements  — RC + Supabase combined tier (paid wins), founder > pro > free
 * useBadges        — full derived display data: runs engine with real entitlement
 * useTrophyShelfData — filtered + sorted badge list for the shelf screen
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation, type TFunction } from 'react-i18next';
// Note: BadgesProvider (JSX) lives in BadgesProvider.tsx — import from there.
import { useBadgeTracker, type UseBadgeTrackerResult } from './tracker';
import { evaluate } from './engine';
import { BADGE_DEFINITIONS, BADGE_BY_ID } from './definitions';
import type { BadgeState, BadgeId, BadgeEntitlementTier, NewUnlock } from './types';
import { useAccountContext } from '@/contexts/AccountContext';
import { usePurchases } from '@/contexts/PurchasesContext';
import { PURCHASES_ENABLED } from '@/constants/featureFlags';

// ─── useEntitlements ─────────────────────────────────────────────────────────

/**
 * Returns the effective entitlement tier combining RC + Supabase.
 * Paid wins: founder > pro > free.
 * To swap in a different source, change only this hook.
 */
export function useEntitlements(): { tier: BadgeEntitlementTier } {
  const { entitlement } = useAccountContext();
  const { tier: rcTier, isV0Grandfather } = usePurchases();

  // Resolve base tier from RC (when enabled) or Supabase fallback.
  const baseTier: BadgeEntitlementTier = PURCHASES_ENABLED
    ? (rcTier !== 'free' ? (rcTier as BadgeEntitlementTier) : ((entitlement?.tier as BadgeEntitlementTier) ?? 'free'))
    : ((entitlement?.tier as BadgeEntitlementTier) ?? 'free');

  // v0.x grandfather: when IAP is enabled, bump free-tier early adopters to
  // 'pro' automatically. When PURCHASES_ENABLED=false this is a no-op.
  // See PurchasesContextValue.isV0Grandfather for full semantics.
  const effectiveTier: BadgeEntitlementTier =
    PURCHASES_ENABLED && baseTier === 'free' && isV0Grandfather ? 'pro' : baseTier;

  return { tier: effectiveTier };
}

// ─── BadgesContext ────────────────────────────────────────────────────────────

export interface BadgesContextValue extends UseBadgeTrackerResult {
  /** Reactively updated state (triggers re-renders on change). */
  state: BadgeState | null;
}

export const BadgesContext = createContext<BadgesContextValue | null>(null);

// ─── useBadgeState ────────────────────────────────────────────────────────────

export function useBadgeState(): BadgesContextValue {
  const ctx = useContext(BadgesContext);
  if (!ctx) throw new Error('useBadgeState must be used within BadgesProvider');
  return ctx;
}

// ─── Derived display data ─────────────────────────────────────────────────────

export interface BadgeDisplayRecord {
  id: BadgeId;
  icon: string;
  name: string;
  description: string;
  gate: 'free' | 'pro' | 'founder';
  kind: string;
  hidden: boolean;
  /** Unlock record, if earned. */
  unlock: { unlockedAt: string; seen: boolean; tier?: number } | null;
  /** For track badges: the next threshold to reach. */
  nextThreshold: number | null;
  /** For track badges: current value vs threshold. */
  currentValue: number | null;
  /** State for locked pro/founder badges seen by free users. */
  visibleState: 'earned' | 'in_progress' | 'pro_locked' | 'founders_locked';
}

export interface UseBadgesResult {
  badges: BadgeDisplayRecord[];
  unseenCount: number;
  totalEarned: number;
  totalCount: number;
  isEnabled: boolean;
  /** New unlocks detected since last evaluate call — used to drive toasts. */
  pendingToasts: NewUnlock[];
  clearPendingToasts: () => void;
}

/** Map badge ID to the counter value it tracks (for progress display). */
function getCounterValue(id: BadgeId, state: BadgeState): number | null {
  const c = state.counters;
  switch (id) {
    case 'chatterbox': return c.messagesSent;
    case 'streakKeeper': return c.consecutiveDayStreakMax;
    case 'sessionBuilder': return c.sessionsStarted;
    case 'polyglot': return c.modelsUsedSet.length;
    case 'slashMaster': return c.slashCommandIdsUsedSet.length;
    case 'curator': return c.attachmentsSentCount;
    case 'agentWhisperer': return c.agentIdsUsedSet.length;
    case 'magpie': return c.clipboardActionCount;
    case 'tokenmaxxer': return c.cumulativeContextUsed;
    case 'leanMachine': return c.leanSessionsCount;
    default: return null;
  }
}

function getNextThreshold(
  id: BadgeId,
  state: BadgeState,
  tier: BadgeEntitlementTier,
): number | null {
  const def = BADGE_BY_ID[id];
  if (!def?.tiers) return null;
  const currentTierIdx = state.unlocks[id]?.tier ?? -1;
  const nextIdx = currentTierIdx + 1;
  if (nextIdx >= def.tiers.length) return null;
  // Free gate: cap at freeTierMax
  if (tier === 'free' && def.freeTierMax !== undefined && nextIdx > def.freeTierMax) {
    return null; // upgrade required
  }
  return def.tiers[nextIdx] ?? null;
}

// ─── Localised badge display helper ──────────────────────────────────────────

/**
 * Returns localised name + description for a badge definition.
 * Falls back to the canonical English values so any missing i18n key silently
 * degrades rather than surfacing a raw key path in the UI.
 */
function localisedBadgeStrings(
  id: string,
  canonicalName: string,
  canonicalDescription: string,
  t: TFunction,
): { name: string; description: string } {
  return {
    name: t(`badges.defs.${id}.name`, { defaultValue: canonicalName }),
    description: t(`badges.defs.${id}.description`, { defaultValue: canonicalDescription }),
  };
}

export function useBadges(): UseBadgesResult {
  const { state } = useBadgeState();
  const { tier } = useEntitlements();
  const { t } = useTranslation();
  const [pendingToasts, setPendingToasts] = useState<NewUnlock[]>([]);
  const prevUnlocksRef = useRef<Record<string, { unlockedAt: string; seen: boolean; tier?: number }>>({});
  // True once prevUnlocksRef has been seeded from the first real state load.
  // Prevents treating all existing unlocks as new on cold start.
  const primedRef = useRef(false);

  // Detect new unlocks and queue toasts.
  useEffect(() => {
    if (!state) return;

    // First non-null state: seed the previous-unlocks ref without queuing.
    if (!primedRef.current) {
      primedRef.current = true;
      prevUnlocksRef.current = { ...state.unlocks };
      return;
    }

    const prev = prevUnlocksRef.current;
    const curr = state.unlocks;
    const newOnes: NewUnlock[] = [];

    for (const [id, rec] of Object.entries(curr)) {
      const wasThere = prev[id];
      const isNew = !wasThere || (rec.tier !== undefined && (wasThere.tier ?? -1) < rec.tier);
      if (isNew) {
        newOnes.push({ id: id as BadgeId, unlockedAt: rec.unlockedAt, tier: rec.tier });
      }
    }

    if (newOnes.length > 0) {
      setPendingToasts((q) => [...q, ...newOnes]);
    }
    prevUnlocksRef.current = { ...curr };
  }, [state]);

  const clearPendingToasts = useCallback((): void => {
    setPendingToasts([]);
  }, []);

  // Memoized engine pass — only re-runs when counters, unlocks, or tier change.
  // A single stable `now` per memo prevents non-deterministic unlockedAt values.
  const engineResult = useMemo(() => {
    if (!state) return null;
    const now = new Date();
    const { newUnlocks } = evaluate(state.counters, state.unlocks, { tier }, now);
    const effectiveUnlocks = { ...state.unlocks };
    for (const u of newUnlocks) {
      if (!effectiveUnlocks[u.id] || (u.tier !== undefined && (effectiveUnlocks[u.id]?.tier ?? -1) < u.tier)) {
        effectiveUnlocks[u.id] = { unlockedAt: u.unlockedAt, seen: false, tier: u.tier };
      }
    }
    return { effectiveUnlocks, now };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.counters, state?.unlocks, tier]);

  if (!state || !engineResult) {
    return {
      badges: [],
      unseenCount: 0,
      totalEarned: 0,
      totalCount: BADGE_DEFINITIONS.length,
      isEnabled: false,
      pendingToasts,
      clearPendingToasts,
    };
  }

  const { effectiveUnlocks } = engineResult;

  const badges: BadgeDisplayRecord[] = BADGE_DEFINITIONS.map((def) => {
    const unlock = effectiveUnlocks[def.id] ?? null;
    const currentVal = getCounterValue(def.id, state);
    const nextThreshold = getNextThreshold(def.id, state, tier);

    let visibleState: BadgeDisplayRecord['visibleState'];
    if (unlock) {
      visibleState = 'earned';
    } else if (def.gate === 'founder' && tier !== 'founder') {
      visibleState = 'founders_locked';
    } else if (def.gate === 'pro' && tier === 'free') {
      visibleState = 'pro_locked';
    } else {
      visibleState = 'in_progress';
    }

    const { name, description } = localisedBadgeStrings(def.id, def.name, def.description, t);
    return {
      id: def.id,
      icon: def.icon,
      name,
      description,
      gate: def.gate,
      kind: def.kind,
      hidden: def.hidden ?? false,
      unlock,
      nextThreshold,
      currentValue: currentVal,
      visibleState,
    };
  });

  const earned = badges.filter((b) => b.unlock !== null);
  const unseenCount = Object.values(state.unlocks).filter((u) => !u.seen).length;

  return {
    badges,
    unseenCount,
    totalEarned: earned.length,
    totalCount: BADGE_DEFINITIONS.length,
    isEnabled: state.enabledAt !== null,
    pendingToasts,
    clearPendingToasts,
  };
}

// ─── useTrophyShelfData ───────────────────────────────────────────────────────

export type ShelfFilter = 'all' | 'earned' | 'in_progress' | 'locked' | 'founders';

const VISIBLE_STATE_ORDER: Record<BadgeDisplayRecord['visibleState'], number> = {
  earned: 0,
  in_progress: 1,
  pro_locked: 2,
  founders_locked: 3,
};

export function useTrophyShelfData(filter: ShelfFilter = 'all'): BadgeDisplayRecord[] {
  const { badges } = useBadges();

  const filtered = badges.filter((b) => {
    // Hidden badges only show if earned.
    if (b.hidden && !b.unlock) return false;

    switch (filter) {
      case 'earned': return b.unlock !== null;
      case 'in_progress': return b.unlock === null && b.visibleState === 'in_progress';
      case 'locked': return b.visibleState === 'pro_locked' || b.visibleState === 'founders_locked';
      case 'founders': return b.gate === 'founder';
      default: return true; // 'all': show everything except hidden-unearned (handled above)
    }
  });

  // For the 'all' view, sort by visible state (earned first, locked last), then
  // preserve the definitions-array order within each bucket.
  if (filter === 'all') {
    const withIndex = filtered.map((b, i) => ({ b, i }));
    withIndex.sort((a, z) => {
      const orderDiff = VISIBLE_STATE_ORDER[a.b.visibleState] - VISIBLE_STATE_ORDER[z.b.visibleState];
      return orderDiff !== 0 ? orderDiff : a.i - z.i;
    });
    return withIndex.map(({ b }) => b);
  }

  return filtered;
}

// ─── Pinned badges ─────────────────────────────────────────────────────────────

const PINNED_DISPLAY_LIMIT = 3;

/**
 * Returns exactly up to 3 badge records for the account card pip row.
 * Pinned earned badges come first; any remaining slots are padded with the
 * first non-hidden badges from the definitions list (in definition order),
 * skipping IDs already in the pinned set. Padded records may be unearned —
 * callers must check `unlock !== null` to distinguish earned from placeholder.
 */
export function usePinnedBadges(): BadgeDisplayRecord[] {
  const { badges } = useBadges();
  const { state } = useBadgeState();

  if (!state) return [];

  const pinnedIds = state.cosmetics.displayedBadges ?? [];
  const earnedPinned: BadgeDisplayRecord[] = pinnedIds
    .map((id) => badges.find((b) => b.id === id))
    .filter((b): b is BadgeDisplayRecord => b !== undefined && b.unlock !== null);

  if (earnedPinned.length >= PINNED_DISPLAY_LIMIT) {
    return earnedPinned.slice(0, PINNED_DISPLAY_LIMIT);
  }

  const used = new Set(earnedPinned.map((b) => b.id));
  const padding = badges
    .filter((b) => !b.hidden && !used.has(b.id))
    .slice(0, PINNED_DISPLAY_LIMIT - earnedPinned.length);

  return [...earnedPinned, ...padding].slice(0, PINNED_DISPLAY_LIMIT);
}

// ─── useTierUpgradeReveal ─────────────────────────────────────────────────────

/**
 * Watches the effective entitlement tier. When it upgrades (free→pro/founder),
 * re-runs the engine with the new tier to find all newly-visible badges and
 * routes them through tracker.mergeEngineUnlocks (single source of truth).
 */
export function useTierUpgradeReveal(): void {
  const { state, mergeEngineUnlocks } = useBadgeState();
  const { tier } = useEntitlements();
  const prevTierRef = useRef<BadgeEntitlementTier | null>(null);

  useEffect(() => {
    const prev = prevTierRef.current;
    prevTierRef.current = tier;

    // Only act on upgrades (not on first load or same-tier).
    if (prev === null || prev === tier) return;
    const tierRank = { free: 0, pro: 1, founder: 2 } as const;
    const isUpgrade = (tierRank[tier] ?? 0) > (tierRank[prev] ?? 0);
    if (!isUpgrade) return;
    if (!state || state.enabledAt === null) return;

    // Run engine with new tier to get all previously-gated badges.
    const now = new Date();
    const { newUnlocks } = evaluate(state.counters, state.unlocks, { tier }, now);
    if (newUnlocks.length === 0) return;

    // Route through tracker — updates stateRef + debounces flush. No direct saveBadgeState.
    mergeEngineUnlocks(newUnlocks, now);
  }, [tier, state, mergeEngineUnlocks]);
}

// Persist new unlocks found by useBadges engine pass (so display stays in sync with storage).
export function useSyncEngineUnlocks(): void {
  const { state, mergeEngineUnlocks } = useBadgeState();
  const { tier } = useEntitlements();
  const syncedRef = useRef<string>('');

  useEffect(() => {
    if (!state || state.enabledAt === null) return;
    const key = JSON.stringify({ counters: state.counters, tier });
    if (syncedRef.current === key) return;
    syncedRef.current = key;

    const now = new Date();
    const { newUnlocks } = evaluate(state.counters, state.unlocks, { tier }, now);
    if (newUnlocks.length === 0) return;

    // Route through tracker — updates stateRef + debounces flush. No direct saveBadgeState.
    mergeEngineUnlocks(newUnlocks, now);
  }, [state, tier, mergeEngineUnlocks]);
}
