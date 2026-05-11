/**
 * useBadgeTracker — React hook that owns the in-memory state and AsyncStorage
 * persistence for the badge system.
 *
 * Mount this once near the root (in _layout.tsx, inside BadgesProvider).
 * All event-emitting call sites call functions from events.ts which delegate
 * to the singleton tracker registered here.
 *
 * Hot-path: every public method checks enabledAt first and returns immediately
 * when null (badges disabled). Zero AsyncStorage IO on the hot path when off.
 */

import { useCallback, useEffect, useRef } from 'react';
import { registerBadgeTracker, unregisterBadgeTracker } from './events';
import type { MessageSentPayload, ModelSetPayload } from './events';
import {
  loadBadgeState,
  saveBadgeState,
  makeDefaultState,
  makeDefaultCounters,
  getOrCreateBadgeDeviceId,
  addToSet,
  recordMessageDate,
  pruneModelsToday,
  formatLocalDateKey,
} from './store';
import { evaluate } from './engine';
import type { BadgeState, BadgeStateCounters } from './types';
import { MODELS_TODAY_RETENTION_DAYS } from './types';
import { APP_VERSION } from '@/lib/appMeta';

// ─── Tracker interface (used by events.ts) ────────────────────────────────────

export interface BadgeTrackerInterface {
  onMessageSent(p: MessageSentPayload): void;
  onSessionCreated(): void;
  onModelSet(p: ModelSetPayload): void;
  onSlashCmdExec(cmdId: string): void;
  onToolResult(success: boolean): void;
  onThemeToggled(): void;
  onAbortGen(): void;
  onProfileSwitched(profileId: string): void;
  onFeedbackSent(): void;
  onGumaTapped(): void;
  onKonamiTriggered(): void;
  onAgentUsed(agentId: string): void;
  onClipboardAction(): void;
}

// ─── Flush queue (debounced 1s to batch rapid events) ────────────────────────

const FLUSH_DEBOUNCE_MS = 1000;

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseBadgeTrackerResult {
  /** Current state — null while loading from storage. */
  state: BadgeState | null;
  /** Subscribe to state changes; returns unsubscribe fn. */
  subscribe: (cb: (s: BadgeState | null) => void) => () => void;
  /** Enable the badge system. */
  enable: () => Promise<void>;
  /** Disable the badge system (preserves counters). */
  disable: () => Promise<void>;
  /** Mark all new unlocks as seen. */
  markAllSeen: () => Promise<void>;
  /** Update pinned badges selection. */
  setPinnedBadges: (ids: string[]) => Promise<void>;
  /** Set foundersWindowStart + foundersPurchasedAt from purchase event. */
  recordFoundersPurchase: (purchasedAt: string) => Promise<void>;
  /** Update leanSessionsCount when a session ends (lean = peakRatio < 0.10). */
  recordSessionEnd: (peakContextRatio: number | null) => Promise<void>;
  /**
   * Merge engine-detected unlocks into stateRef (single source of truth).
   * Called by useSyncEngineUnlocks and useTierUpgradeReveal so that both
   * display-side and tracker-side writes go through the same ref, preventing
   * stale-ref overwrites.
   */
  mergeEngineUnlocks: (newUnlocks: import('./types').NewUnlock[], now: Date) => void;
  /**
   * Update the live entitlement tier used by applyCounterUpdate.
   * Called from BadgesProvider whenever the tier changes.
   */
  setEntitlementTier: (tier: import('./types').BadgeEntitlementTier) => void;
  /**
   * Erase all counters, unlocks, and cosmetics. Preserves deviceId and enabledAt.
   * Bypasses the debounce flush — writes synchronously to AsyncStorage.
   */
  resetAchievements: () => Promise<void>;
}

export function useBadgeTracker(): UseBadgeTrackerResult {
  const stateRef = useRef<BadgeState | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribersRef = useRef<Set<(s: BadgeState | null) => void>>(new Set());
  // Session-boundary lean tracking (ephemeral — not persisted).
  const lastSessionMsgCountRef = useRef<number>(0);
  const peakSessionRatioRef = useRef<number | null>(null);
  // Live entitlement tier — updated from BadgesProvider via setEntitlementTier.
  // Starts conservative ('free') until provider injects the real value.
  const entitlementTierRef = useRef<import('./types').BadgeEntitlementTier>('free');

  // ── Helpers ────────────────────────────────────────────────────────────────

  const subscribe = useCallback((cb: (s: BadgeState | null) => void): (() => void) => {
    subscribersRef.current.add(cb);
    return () => { subscribersRef.current.delete(cb); };
  }, []);

  const notify = useCallback((s: BadgeState | null): void => {
    subscribersRef.current.forEach((cb) => cb(s));
  }, []);

  const flush = useCallback(async (s: BadgeState): Promise<void> => {
    await saveBadgeState(s);
    notify(s);
  }, [notify]);

  const scheduledFlush = useCallback((): void => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      const s = stateRef.current;
      if (s) void flush(s);
    }, FLUSH_DEBOUNCE_MS);
  }, [flush]);

  /** Apply counters update + run engine + merge new unlocks, then schedule flush. */
  const applyCounterUpdate = useCallback(
    (update: (c: BadgeStateCounters) => BadgeStateCounters): void => {
      const s = stateRef.current;
      if (!s || s.enabledAt === null) return; // disabled — no-op

      const newCounters = update(s.counters);
      const now = new Date();

      // Run engine with the live entitlement tier (updated by BadgesProvider).
      const entitlement = { tier: entitlementTierRef.current };
      const { newUnlocks } = evaluate(newCounters, s.unlocks, entitlement, now);

      const updatedUnlocks = { ...s.unlocks };
      for (const u of newUnlocks) {
        if (!updatedUnlocks[u.id]) {
          updatedUnlocks[u.id] = {
            unlockedAt: u.unlockedAt,
            seen: false,
            tier: u.tier,
          };
        } else if (u.tier !== undefined) {
          const existing = updatedUnlocks[u.id];
          updatedUnlocks[u.id] = {
            unlockedAt: existing?.unlockedAt ?? u.unlockedAt,
            seen: false,
            tier: u.tier,
          };
        }
      }

      stateRef.current = {
        ...s,
        counters: newCounters,
        unlocks: updatedUnlocks,
        lastModified: now.toISOString(),
      };
      scheduledFlush();
    },
    [scheduledFlush],
  );

  // ── Mount: load state + register tracker ──────────────────────────────────

  useEffect(() => {
    let mounted = true;

    void (async (): Promise<void> => {
      let state = await loadBadgeState();
      if (!mounted) return;

      if (!state) {
        const deviceId = await getOrCreateBadgeDeviceId();
        const now = new Date().toISOString();
        state = makeDefaultState(deviceId, now);
        // Don't save yet — only persist when enabled or when an event fires.
      }

      stateRef.current = state;
      notify(state);

      // Record app launch with current build version.
      if (state.enabledAt !== null) {
        const version = APP_VERSION;
        if (version && !state.counters.distinctBuildVersionsSeen.includes(version)) {
          applyCounterUpdate((c) => ({
            ...c,
            distinctBuildVersionsSeen: addToSet(c.distinctBuildVersionsSeen, version),
          }));
        }
      }
    })();

    const tracker: BadgeTrackerInterface = {
      onMessageSent(p: MessageSentPayload): void {
        if (stateRef.current?.enabledAt === null) return;

        // Session-boundary lean tracking: detect new session via sessionMessageCount reset.
        // When a session restarts (count drops to <= 1), record the previous session
        // as lean if its peak context ratio stayed under 10%.
        const prevCount = lastSessionMsgCountRef.current;
        if (prevCount > 0 && p.sessionMessageCount <= 1) {
          const peakRatio = peakSessionRatioRef.current;
          if (peakRatio !== null && peakRatio < 0.10) {
            applyCounterUpdate((c) => ({ ...c, leanSessionsCount: c.leanSessionsCount + 1 }));
          }
          peakSessionRatioRef.current = p.leanRatio;
        } else if (p.leanRatio !== null) {
          peakSessionRatioRef.current = Math.max(peakSessionRatioRef.current ?? 0, p.leanRatio);
        }
        lastSessionMsgCountRef.current = p.sessionMessageCount;

        applyCounterUpdate((c) => {
          let updated: BadgeStateCounters = {
            ...c,
            messagesSent: c.messagesSent + 1,
            lastMessageLocalHour: p.localHour,
            lastMessageLocalMinute: p.localMinute,
            attachmentsSentCount: c.attachmentsSentCount + p.attachmentCount,
            voiceInputCount: c.voiceInputCount + (p.hasVoiceAttachment ? 1 : 0),
          };

          // Streak tracking
          updated = recordMessageDate(updated, p.localDateKey);

          // Model tracking
          if (p.modelId) {
            updated = {
              ...updated,
              modelsUsedSet: addToSet(c.modelsUsedSet, p.modelId),
            };
            const todayModels = updated.modelsUsedTodayByDate[p.localDateKey] ?? [];
            const updatedTodayModels = todayModels.includes(p.modelId)
              ? todayModels
              : [...todayModels, p.modelId];
            updated = {
              ...updated,
              modelsUsedTodayByDate: pruneModelsToday(
                { ...updated.modelsUsedTodayByDate, [p.localDateKey]: updatedTodayModels },
                p.localDateKey,
                MODELS_TODAY_RETENTION_DAYS,
              ),
            };
          }

          // Session message count for Marathon
          if (p.sessionMessageCount > updated.longestSingleSessionMessageCount) {
            updated = {
              ...updated,
              longestSingleSessionMessageCount: p.sessionMessageCount,
            };
          }

          return updated;
        });
      },

      onSessionCreated(): void {
        if (stateRef.current?.enabledAt === null) return;
        applyCounterUpdate((c) => ({
          ...c,
          sessionsStarted: c.sessionsStarted + 1,
        }));
      },

      onModelSet(p: ModelSetPayload): void {
        if (stateRef.current?.enabledAt === null) return;
        applyCounterUpdate((c) => {
          const today = formatLocalDateKey(new Date());
          const todayModels = c.modelsUsedTodayByDate[today] ?? [];
          const updatedToday = todayModels.includes(p.modelId)
            ? todayModels
            : [...todayModels, p.modelId];
          return {
            ...c,
            modelsUsedSet: addToSet(c.modelsUsedSet, p.modelId),
            modelsUsedTodayByDate: pruneModelsToday(
              { ...c.modelsUsedTodayByDate, [today]: updatedToday },
              today,
              MODELS_TODAY_RETENTION_DAYS,
            ),
            modelChangedMidConversationCount: p.midConversation
              ? c.modelChangedMidConversationCount + 1
              : c.modelChangedMidConversationCount,
            reasoningModelUsedCount: p.isReasoning
              ? c.reasoningModelUsedCount + 1
              : c.reasoningModelUsedCount,
          };
        });
      },

      onSlashCmdExec(cmdId: string): void {
        if (stateRef.current?.enabledAt === null) return;
        applyCounterUpdate((c) => ({
          ...c,
          slashCommandIdsUsedSet: addToSet(c.slashCommandIdsUsedSet, cmdId),
        }));
      },

      onToolResult(success: boolean): void {
        if (stateRef.current?.enabledAt === null) return;
        if (!success) return;
        applyCounterUpdate((c) => ({
          ...c,
          toolCallSuccessCount: c.toolCallSuccessCount + 1,
        }));
      },

      onThemeToggled(): void {
        if (stateRef.current?.enabledAt === null) return;
        applyCounterUpdate((c) => ({
          ...c,
          themeToggleCount: c.themeToggleCount + 1,
        }));
      },

      onAbortGen(): void {
        if (stateRef.current?.enabledAt === null) return;
        applyCounterUpdate((c) => ({
          ...c,
          stopGenerationCount: c.stopGenerationCount + 1,
        }));
      },

      onProfileSwitched(profileId: string): void {
        if (stateRef.current?.enabledAt === null) return;
        applyCounterUpdate((c) => ({
          ...c,
          serverProfilesUsedSet: addToSet(c.serverProfilesUsedSet, profileId),
        }));
      },

      onFeedbackSent(): void {
        if (stateRef.current?.enabledAt === null) return;
        applyCounterUpdate((c) => ({
          ...c,
          feedbackSubmittedCount: c.feedbackSubmittedCount + 1,
        }));
      },

      onGumaTapped(): void {
        if (stateRef.current?.enabledAt === null) return;
        applyCounterUpdate((c) => ({
          ...c,
          gumaTapCount: c.gumaTapCount + 1,
        }));
      },

      onKonamiTriggered(): void {
        if (stateRef.current?.enabledAt === null) return;
        applyCounterUpdate((c) => ({
          ...c,
          konamiTriggered: true,
        }));
      },

      onAgentUsed(agentId: string): void {
        if (stateRef.current?.enabledAt === null) return;
        applyCounterUpdate((c) => ({
          ...c,
          agentIdsUsedSet: addToSet(c.agentIdsUsedSet, agentId),
        }));
      },

      onClipboardAction(): void {
        if (stateRef.current?.enabledAt === null) return;
        applyCounterUpdate((c) => ({
          ...c,
          clipboardActionCount: c.clipboardActionCount + 1,
        }));
      },
    };

    registerBadgeTracker(tracker);

    return () => {
      mounted = false;
      unregisterBadgeTracker();
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        // Final synchronous flush of pending state if any.
        const s = stateRef.current;
        if (s) void saveBadgeState(s);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Public API ─────────────────────────────────────────────────────────────

  const enable = useCallback(async (): Promise<void> => {
    const s = stateRef.current;
    if (s?.enabledAt !== null && s !== null) return; // already enabled
    const now = new Date();
    const nowIso = now.toISOString();
    const deviceId = s?.deviceId ?? (await getOrCreateBadgeDeviceId());
    const base = s ?? makeDefaultState(deviceId, nowIso);

    // Record the current build version so badges whose predicate checks
    // distinctBuildVersionsSeen (e.g. betaTester) fire at opt-in time
    // rather than waiting for the next app launch.
    const version = APP_VERSION;
    const counters: import('./types').BadgeStateCounters = version
      ? { ...base.counters, distinctBuildVersionsSeen: addToSet(base.counters.distinctBuildVersionsSeen, version) }
      : base.counters;

    // Run the engine synchronously so any already-qualifying badges
    // (e.g. betaTester on a v0.x build) unlock immediately on opt-in.
    const { newUnlocks } = evaluate(counters, base.unlocks, { tier: entitlementTierRef.current }, now);
    const unlocks = { ...base.unlocks };
    for (const u of newUnlocks) {
      unlocks[u.id] = { unlockedAt: u.unlockedAt, seen: false, tier: u.tier };
    }

    const updated: BadgeState = { ...base, counters, unlocks, enabledAt: nowIso, lastModified: nowIso };
    stateRef.current = updated;
    await saveBadgeState(updated);
    notify(updated);
  }, [notify]);

  const disable = useCallback(async (): Promise<void> => {
    const s = stateRef.current;
    if (!s) return;
    const now = new Date().toISOString();
    const updated: BadgeState = { ...s, enabledAt: null, lastModified: now };
    stateRef.current = updated;
    await saveBadgeState(updated);
    notify(updated);
  }, [notify]);

  const markAllSeen = useCallback(async (): Promise<void> => {
    const s = stateRef.current;
    if (!s) return;
    const updatedUnlocks = Object.fromEntries(
      Object.entries(s.unlocks).map(([k, v]) => [k, { ...v, seen: true }]),
    );
    const updated: BadgeState = {
      ...s,
      unlocks: updatedUnlocks,
      lastModified: new Date().toISOString(),
    };
    stateRef.current = updated;
    await saveBadgeState(updated);
    notify(updated);
  }, [notify]);

  const setPinnedBadges = useCallback(async (ids: string[]): Promise<void> => {
    const s = stateRef.current;
    if (!s) return;
    const updated: BadgeState = {
      ...s,
      cosmetics: { ...s.cosmetics, displayedBadges: ids.slice(0, 3) },
      lastModified: new Date().toISOString(),
    };
    stateRef.current = updated;
    await saveBadgeState(updated);
    notify(updated);
  }, [notify]);

  const recordFoundersPurchase = useCallback(async (purchasedAt: string): Promise<void> => {
    const s = stateRef.current;
    if (!s) return;
    const updated: BadgeState = {
      ...s,
      counters: { ...s.counters, foundersPurchasedAt: purchasedAt },
      lastModified: new Date().toISOString(),
    };
    stateRef.current = updated;
    await saveBadgeState(updated);
    notify(updated);
  }, [notify]);

  const recordSessionEnd = useCallback(async (peakContextRatio: number | null): Promise<void> => {
    const s = stateRef.current;
    if (!s || s.enabledAt === null) return;
    if (peakContextRatio === null || peakContextRatio >= 0.10) return;
    applyCounterUpdate((c) => ({
      ...c,
      leanSessionsCount: c.leanSessionsCount + 1,
    }));
  }, [applyCounterUpdate]);

  const setEntitlementTier = useCallback((tier: import('./types').BadgeEntitlementTier): void => {
    entitlementTierRef.current = tier;
  }, []);

  const resetAchievements = useCallback(async (): Promise<void> => {
    const s = stateRef.current;
    if (!s) return;
    const now = new Date().toISOString();
    const updated: BadgeState = {
      schemaVersion: s.schemaVersion,
      deviceId: s.deviceId,
      enabledAt: s.enabledAt,
      counters: makeDefaultCounters(now),
      unlocks: {},
      cosmetics: {},
      lastModified: now,
    };
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    lastSessionMsgCountRef.current = 0;
    peakSessionRatioRef.current = null;
    stateRef.current = updated;
    await saveBadgeState(updated);
    notify(updated);
  }, [notify]);

  const mergeEngineUnlocks = useCallback((
    newUnlocks: import('./types').NewUnlock[],
    now: Date,
  ): void => {
    if (newUnlocks.length === 0) return;
    const s = stateRef.current;
    if (!s) return;

    const updatedUnlocks = { ...s.unlocks };
    for (const u of newUnlocks) {
      if (!updatedUnlocks[u.id]) {
        updatedUnlocks[u.id] = { unlockedAt: u.unlockedAt, seen: false, tier: u.tier };
      } else if (u.tier !== undefined && (updatedUnlocks[u.id]?.tier ?? -1) < u.tier) {
        const existing = updatedUnlocks[u.id];
        updatedUnlocks[u.id] = {
          unlockedAt: existing?.unlockedAt ?? u.unlockedAt,
          seen: false,
          tier: u.tier,
        };
      }
    }

    const updated: BadgeState = {
      ...s,
      unlocks: updatedUnlocks,
      lastModified: now.toISOString(),
    };
    stateRef.current = updated;
    scheduledFlush();
    notify(updated);
  }, [scheduledFlush, notify]);

  return {
    state: stateRef.current,
    subscribe,
    enable,
    disable,
    markAllSeen,
    setPinnedBadges,
    recordFoundersPurchase,
    recordSessionEnd,
    setEntitlementTier,
    mergeEngineUnlocks,
    resetAchievements,
  };
}
