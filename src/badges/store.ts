/**
 * Badge state persistence.
 *
 * Storage key: 'clawboy-badges-v1' (AsyncStorage — non-sensitive).
 * Schema migrations live in migrateState().
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BadgeState, BadgeStateCounters } from './types';
import { COUNTER_SET_CAP, DAILY_DATES_RETENTION_DAYS } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'clawboy-badges-v1';
export const CURRENT_SCHEMA_VERSION = 1;

// ─── Default state factory ────────────────────────────────────────────────────

export function makeDefaultCounters(now: string): BadgeStateCounters {
  return {
    messagesSent: 0,
    lastMessageLocalHour: null,
    lastMessageLocalMinute: null,
    lastMessageLength: null,
    sessionsStarted: 0,
    modelsUsedSet: [],
    modelsUsedTodayByDate: {},
    slashCommandIdsUsedSet: [],
    attachmentsSentCount: 0,
    voiceInputCount: 0,
    agentIdsUsedSet: [],
    clipboardActionCount: 0,
    themeToggleCount: 0,
    stopGenerationCount: 0,
    serverProfilesUsedSet: [],
    toolCallSuccessCount: 0,
    cardExpandedCount: 0,
    logsPausedCount: 0,
    inputClearedCount: 0,
    privacyExpandedCount: 0,
    fakeSubmitTappedCount: 0,
    footerLinkTappedCount: 0,
    chatHeaderTripleTappedCount: 0,
    sessionsPinnedCount: 0,
    sessionsDeletedCount: 0,
    sessionsRenamedCount: 0,
    sessionsBulkClearedCount: 0,
    logFiltersAppliedSet: [],
    logSearchesCount: 0,
    themeVariantsUsedSet: [],
    updateChecksCount: 0,
    voiceTestedCount: 0,
    audioStoppedCount: 0,
    annotatedRepliesSentCount: 0,
    dailyMessageDates: {},
    consecutiveDayStreakMax: 0,
    leanSessionsCount: 0,
    cumulativeContextUsed: 0,
    feedbackSubmittedCount: 0,
    foundersWindowStart: now,
    foundersPurchasedAt: null,
    distinctBuildVersionsSeen: [],
    gumaTapCount: 0,
    konamiTriggered: false,
    longestSingleSessionMessageCount: 0,
    firstInstallDate: now,
    modelChangedMidConversationCount: 0,
    reasoningModelUsedCount: 0,
  };
}

export function makeDefaultState(deviceId: string, now: string): BadgeState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    enabledAt: null,
    counters: makeDefaultCounters(now),
    unlocks: {},
    cosmetics: {},
    lastModified: now,
    deviceId,
  };
}

// ─── Migration ────────────────────────────────────────────────────────────────

/**
 * Merge persisted counters with defaults so new keys added after first save
 * are always defined (predicates assume full BadgeStateCounters shape).
 */
export function normalizeCounters(
  persisted: Partial<BadgeStateCounters> | undefined,
  fallbackNow: string,
): BadgeStateCounters {
  const defaults = makeDefaultCounters(fallbackNow);
  if (!persisted) return defaults;

  const merged: BadgeStateCounters = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof BadgeStateCounters)[]) {
    const val = persisted[key];
    if (val !== undefined) {
      merged[key] = val;
    }
  }
  return merged;
}

/**
 * Migrate a parsed state object from an older schema to the current one.
 * Add a new `case` for each future schema bump.
 */
export function migrateState(raw: BadgeState): BadgeState {
  const fallbackNow =
    raw.lastModified ??
    raw.counters?.firstInstallDate ??
    raw.counters?.foundersWindowStart ??
    new Date().toISOString();

  return {
    ...raw,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    counters: normalizeCounters(raw.counters, fallbackNow),
  };
}

// ─── Device ID ───────────────────────────────────────────────────────────────

const DEVICE_ID_KEY = 'clawboy-badge-device-id';

export async function getOrCreateBadgeDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  // Simple UUID-ish without crypto dependency to keep this module lightweight.
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

// ─── Load / save ──────────────────────────────────────────────────────────────

export async function loadBadgeState(): Promise<BadgeState | null> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BadgeState;
    if (!parsed || typeof parsed !== 'object') return null;
    return migrateState(parsed);
  } catch (err) {
    // Back up the corrupt blob so it's recoverable, then return null (safe default).
    if (raw) {
      const backupKey = `${STORAGE_KEY}.corrupt-${Date.now()}`;
      try {
        await AsyncStorage.setItem(backupKey, raw);
      } catch {
        // Best-effort; don't let backup failure block recovery.
      }
    }
    console.warn('[badges] loadBadgeState: corrupt state backed up and discarded.', err);
    return null;
  }
}

export async function saveBadgeState(state: BadgeState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Non-fatal — badge state is best-effort.
  }
}

// ─── Enable / disable ────────────────────────────────────────────────────────

/**
 * Enable the badge system. Sets enabledAt if not already set.
 * Returns the updated state (already saved).
 */
export async function enableBadges(state: BadgeState | null): Promise<BadgeState> {
  const now = new Date().toISOString();
  const deviceId = state?.deviceId ?? (await getOrCreateBadgeDeviceId());
  const base: BadgeState = state ?? makeDefaultState(deviceId, now);

  if (base.enabledAt !== null) return base;

  const updated: BadgeState = {
    ...base,
    enabledAt: now,
    lastModified: now,
  };
  await saveBadgeState(updated);
  return updated;
}

/**
 * Disable the badge system. Sets enabledAt to null but PRESERVES counters.
 * Returns the updated state (already saved).
 */
export async function disableBadges(state: BadgeState): Promise<BadgeState> {
  const now = new Date().toISOString();
  const updated: BadgeState = {
    ...state,
    enabledAt: null,
    lastModified: now,
  };
  await saveBadgeState(updated);
  return updated;
}

// ─── Counter helpers ─────────────────────────────────────────────────────────

/** Add to a set counter array, capped at COUNTER_SET_CAP unique values. */
export function addToSet(arr: string[], value: string): string[] {
  if (arr.includes(value)) return arr;
  const next = [...arr, value];
  return next.length > COUNTER_SET_CAP ? next.slice(-COUNTER_SET_CAP) : next;
}

/** Record a message date and update streak. Returns updated counters. */
export function recordMessageDate(
  counters: BadgeStateCounters,
  localDateKey: string, // YYYY-MM-DD
): BadgeStateCounters {
  if (counters.dailyMessageDates[localDateKey]) {
    // Date already recorded — streak unchanged.
    return counters;
  }

  // Add this date.
  const updated: Record<string, true> = { ...counters.dailyMessageDates, [localDateKey]: true };

  // Trim to last DAILY_DATES_RETENTION_DAYS.
  const keys = Object.keys(updated).sort();
  const trimmed: Record<string, true> = {};
  const startIdx = Math.max(0, keys.length - DAILY_DATES_RETENTION_DAYS);
  for (let i = startIdx; i < keys.length; i++) {
    const k = keys[i];
    if (k !== undefined) trimmed[k] = true;
  }

  // Recompute streak.
  const streak = computeCurrentStreak(trimmed, localDateKey);
  const newMax = Math.max(counters.consecutiveDayStreakMax, streak);

  return {
    ...counters,
    dailyMessageDates: trimmed,
    consecutiveDayStreakMax: newMax,
  };
}

/**
 * Compute the current consecutive-day streak ending on `today`.
 * Days are keyed as YYYY-MM-DD strings.
 */
export function computeCurrentStreak(
  dates: Record<string, true>,
  today: string,
): number {
  let count = 0;
  let current = today;
  while (dates[current]) {
    count++;
    current = subtractOneDay(current);
  }
  return count;
}

function subtractOneDay(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Prune modelsUsedTodayByDate to last N days relative to today. */
export function pruneModelsToday(
  record: Record<string, string[]>,
  today: string,
  retainDays: number,
): Record<string, string[]> {
  const cutoff = subtractDays(today, retainDays);
  const result: Record<string, string[]> = {};
  for (const [date, models] of Object.entries(record)) {
    if (date >= cutoff) result[date] = models;
  }
  return result;
}

function subtractDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Format a Date as a local YYYY-MM-DD string (not UTC).
 * Use this instead of toISOString().slice(0,10) which returns UTC date.
 */
export function formatLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
