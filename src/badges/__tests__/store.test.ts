/**
 * store.test.ts — AsyncStorage round-trip, migration, deviceId stability,
 * streak computation, set capping, enable/disable.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadBadgeState,
  saveBadgeState,
  makeDefaultState,
  makeDefaultCounters,
  migrateState,
  normalizeCounters,
  enableBadges,
  disableBadges,
  addToSet,
  recordMessageDate,
  computeCurrentStreak,
  getOrCreateBadgeDeviceId,
  formatLocalDateKey,
  CURRENT_SCHEMA_VERSION,
} from '../store';
import { COUNTER_SET_CAP } from '../types';

// Cast AsyncStorage mock for test control
const mockAS = AsyncStorage as unknown as {
  getItem: jest.MockedFunction<typeof AsyncStorage.getItem>;
  setItem: jest.MockedFunction<typeof AsyncStorage.setItem>;
  removeItem: jest.MockedFunction<typeof AsyncStorage.removeItem>;
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── makeDefaultState ─────────────────────────────────────────────────────────

test('makeDefaultState returns schemaVersion 1 with enabledAt null', () => {
  const s = makeDefaultState('device-1', '2026-01-01T00:00:00.000Z');
  expect(s.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  expect(s.enabledAt).toBeNull();
  expect(s.deviceId).toBe('device-1');
  expect(s.counters.messagesSent).toBe(0);
  expect(s.counters.foundersWindowStart).toBe('2026-01-01T00:00:00.000Z');
});

// ─── saveBadgeState / loadBadgeState ─────────────────────────────────────────

test('saveBadgeState serialises to AsyncStorage', async () => {
  const state = makeDefaultState('dev', '2026-01-01T00:00:00.000Z');
  await saveBadgeState(state);
  expect(mockAS.setItem).toHaveBeenCalledWith(
    'clawboy-badges-v1',
    expect.stringContaining('"schemaVersion":1'),
  );
});

test('loadBadgeState returns null when nothing stored', async () => {
  mockAS.getItem.mockResolvedValueOnce(null);
  const s = await loadBadgeState();
  expect(s).toBeNull();
});

test('loadBadgeState round-trips state', async () => {
  const state = makeDefaultState('dev-rt', '2026-03-01T00:00:00.000Z');
  state.enabledAt = '2026-03-01T01:00:00.000Z';
  const json = JSON.stringify(state);
  mockAS.getItem.mockResolvedValueOnce(json);
  const loaded = await loadBadgeState();
  expect(loaded).not.toBeNull();
  expect(loaded?.deviceId).toBe('dev-rt');
  expect(loaded?.enabledAt).toBe('2026-03-01T01:00:00.000Z');
});

test('loadBadgeState returns null for malformed JSON', async () => {
  mockAS.getItem.mockResolvedValueOnce('{not valid json}}}');
  const s = await loadBadgeState();
  expect(s).toBeNull();
});

// ─── migrateState ─────────────────────────────────────────────────────────────

test('migrateState on current version is identity', () => {
  const state = makeDefaultState('dev', '2026-01-01T00:00:00.000Z');
  const migrated = migrateState(state);
  expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  expect(migrated.deviceId).toBe('dev');
});

test('migrateState backfills counters added after first save', () => {
  const state = makeDefaultState('dev', '2026-01-01T00:00:00.000Z');
  const stale = { ...state.counters } as Partial<typeof state.counters>;
  delete stale.themeVariantsUsedSet;
  delete stale.logFiltersAppliedSet;
  delete stale.voiceTestedCount;
  delete stale.annotatedRepliesSentCount;
  delete stale.updateChecksCount;
  delete stale.audioStoppedCount;

  const migrated = migrateState({
    ...state,
    counters: stale as typeof state.counters,
  });

  expect(migrated.counters.themeVariantsUsedSet).toEqual([]);
  expect(migrated.counters.logFiltersAppliedSet).toEqual([]);
  expect(migrated.counters.voiceTestedCount).toBe(0);
  expect(migrated.counters.annotatedRepliesSentCount).toBe(0);
  expect(migrated.counters.messagesSent).toBe(state.counters.messagesSent);
});

test('normalizeCounters preserves existing values', () => {
  const defaults = makeDefaultCounters('2026-01-01T00:00:00.000Z');
  const normalized = normalizeCounters(
    { ...defaults, themeVariantsUsedSet: ['dark', 'light'], messagesSent: 42 },
    '2026-01-01T00:00:00.000Z',
  );
  expect(normalized.themeVariantsUsedSet).toEqual(['dark', 'light']);
  expect(normalized.messagesSent).toBe(42);
});

// ─── getOrCreateBadgeDeviceId ─────────────────────────────────────────────────

test('getOrCreateBadgeDeviceId returns existing ID if stored', async () => {
  mockAS.getItem.mockResolvedValueOnce('my-device-id');
  const id = await getOrCreateBadgeDeviceId();
  expect(id).toBe('my-device-id');
  expect(mockAS.setItem).not.toHaveBeenCalled();
});

test('getOrCreateBadgeDeviceId creates and stores ID if missing', async () => {
  mockAS.getItem.mockResolvedValueOnce(null);
  mockAS.setItem.mockResolvedValueOnce(undefined);
  const id = await getOrCreateBadgeDeviceId();
  expect(typeof id).toBe('string');
  expect(id.length).toBeGreaterThan(5);
  expect(mockAS.setItem).toHaveBeenCalledWith('clawboy-badge-device-id', id);
});

// ─── enableBadges / disableBadges ─────────────────────────────────────────────

test('enableBadges sets enabledAt on null state', async () => {
  mockAS.getItem.mockResolvedValueOnce('my-device-id');
  mockAS.setItem.mockResolvedValue(undefined);
  const updated = await enableBadges(null);
  expect(updated.enabledAt).not.toBeNull();
  expect(mockAS.setItem).toHaveBeenCalled();
});

test('enableBadges is idempotent when already enabled', async () => {
  const state = makeDefaultState('dev', '2026-01-01T00:00:00.000Z');
  state.enabledAt = '2026-01-01T00:00:00.000Z';
  mockAS.setItem.mockResolvedValue(undefined);
  const updated = await enableBadges(state);
  expect(updated.enabledAt).toBe('2026-01-01T00:00:00.000Z'); // unchanged
});

test('disableBadges sets enabledAt to null but preserves counters', async () => {
  const state = makeDefaultState('dev', '2026-01-01T00:00:00.000Z');
  state.enabledAt = '2026-01-01T00:00:00.000Z';
  state.counters.messagesSent = 42;
  mockAS.setItem.mockResolvedValue(undefined);
  const updated = await disableBadges(state);
  expect(updated.enabledAt).toBeNull();
  expect(updated.counters.messagesSent).toBe(42); // preserved
});

// ─── addToSet ─────────────────────────────────────────────────────────────────

test('addToSet adds new value', () => {
  const result = addToSet(['a', 'b'], 'c');
  expect(result).toEqual(['a', 'b', 'c']);
});

test('addToSet ignores duplicates', () => {
  const result = addToSet(['a', 'b'], 'a');
  expect(result).toEqual(['a', 'b']);
});

test('addToSet caps at COUNTER_SET_CAP', () => {
  const arr = Array.from({ length: COUNTER_SET_CAP }, (_, i) => `item-${i}`);
  const result = addToSet(arr, 'new-item');
  expect(result.length).toBe(COUNTER_SET_CAP);
  expect(result[result.length - 1]).toBe('new-item');
});

// ─── recordMessageDate / computeCurrentStreak ─────────────────────────────────

test('computeCurrentStreak returns 1 for single date', () => {
  const dates: Record<string, true> = { '2026-01-05': true };
  expect(computeCurrentStreak(dates, '2026-01-05')).toBe(1);
});

test('computeCurrentStreak returns 3 for 3 consecutive days', () => {
  const dates: Record<string, true> = {
    '2026-01-03': true,
    '2026-01-04': true,
    '2026-01-05': true,
  };
  expect(computeCurrentStreak(dates, '2026-01-05')).toBe(3);
});

test('computeCurrentStreak resets on gap', () => {
  const dates: Record<string, true> = {
    '2026-01-01': true,
    '2026-01-02': true,
    // gap on 01-03
    '2026-01-04': true,
    '2026-01-05': true,
  };
  expect(computeCurrentStreak(dates, '2026-01-05')).toBe(2);
});

test('recordMessageDate updates streak max', () => {
  const counters = makeDefaultCounters('2026-01-01T00:00:00.000Z');
  const c1 = recordMessageDate(counters, '2026-01-03');
  const c2 = recordMessageDate(c1, '2026-01-04');
  const c3 = recordMessageDate(c2, '2026-01-05');
  expect(c3.consecutiveDayStreakMax).toBe(3);
  expect(c3.dailyMessageDates['2026-01-05']).toBe(true);
});

test('recordMessageDate is idempotent for same date', () => {
  const counters = makeDefaultCounters('2026-01-01T00:00:00.000Z');
  const c1 = recordMessageDate(counters, '2026-01-05');
  const c2 = recordMessageDate(c1, '2026-01-05');
  expect(c2).toBe(c1); // same reference — no change
});

// ─── formatLocalDateKey ───────────────────────────────────────────────────────

test('formatLocalDateKey returns YYYY-MM-DD using local calendar fields', () => {
  // Create a Date that is 2026-05-08 in local time, regardless of system timezone.
  const d = new Date(2026, 4, 8); // month is 0-indexed
  const key = formatLocalDateKey(d);
  expect(key).toBe('2026-05-08');
});

test('formatLocalDateKey pads month and day with leading zeros', () => {
  const d = new Date(2026, 0, 9); // Jan 9
  expect(formatLocalDateKey(d)).toBe('2026-01-09');
});

// ─── Timezone streak edge: local midnight does not double-count ────────────────

test('streak does not increment when local date key is the same as previous', () => {
  // Simulate two messages on the same local day (e.g., 11pm and 11:59pm same day).
  const counters = makeDefaultCounters('2026-01-01T00:00:00.000Z');
  const c1 = recordMessageDate(counters, '2026-05-08');
  const c2 = recordMessageDate(c1, '2026-05-08'); // same local date
  expect(c2).toBe(c1); // idempotent — no streak change
  expect(c2.consecutiveDayStreakMax).toBe(1);
});

test('streak increments correctly across consecutive local days', () => {
  const counters = makeDefaultCounters('2026-01-01T00:00:00.000Z');
  const c1 = recordMessageDate(counters, '2026-05-07');
  const c2 = recordMessageDate(c1, '2026-05-08'); // next local day
  expect(c2.consecutiveDayStreakMax).toBe(2);
});

test('streak resets after a gap of more than one day', () => {
  const counters = makeDefaultCounters('2026-01-01T00:00:00.000Z');
  const c1 = recordMessageDate(counters, '2026-05-06');
  const c2 = recordMessageDate(c1, '2026-05-06'); // same day, idempotent
  const c3 = recordMessageDate(c2, '2026-05-08'); // gap — May 7 was missed
  expect(c3.consecutiveDayStreakMax).toBe(1); // streak restarted
});

// ─── Corrupt state backup ─────────────────────────────────────────────────────

test('loadBadgeState backs up corrupt blob and returns null', async () => {
  const mockSet = jest.fn().mockResolvedValue(undefined);
  (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('not valid json {{{');
  (AsyncStorage.setItem as jest.Mock).mockImplementation(mockSet);

  const result = await loadBadgeState();
  expect(result).toBeNull();
  // A backup key should have been written.
  expect(mockSet).toHaveBeenCalledWith(
    expect.stringMatching(/clawboy-badges-v1\.corrupt-\d+/),
    'not valid json {{{',
  );
});
