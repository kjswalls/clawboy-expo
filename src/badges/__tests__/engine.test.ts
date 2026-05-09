/**
 * engine.test.ts — pure predicate + evaluate() edge-case coverage.
 *
 * Edge cases per plan:
 *   - Night Owl: 00:00–03:59 local
 *   - Early Bird: < 06:00 (pro gated)
 *   - Witching Hour: exactly 11:11 minute
 *   - Streak consecutive days + gap reset
 *   - Shapeshifter: 5+ models same day
 *   - No double-unlock (one-shots)
 *   - No double-unlock (tracks: only when next tier exceeds prior)
 *   - Founders window: within 60d unlocks; day 61+ doesn't
 *   - Lean session ratio < 0.10
 *   - Free user can't unlock pro-gated badges
 *   - Free user respects freeTierMax for track badges
 *   - Pro user can unlock all non-founder badges
 *   - Founder user can unlock everything
 *   - F5 Keeper of the Keys chains on the other 6
 */

import { describe, test, expect } from '@jest/globals';
import { evaluate } from '../engine';
import { makeDefaultCounters } from '../store';
import type { BadgeStateCounters, BadgeState, BadgeEntitlementTier } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function noUnlocks(): BadgeState['unlocks'] {
  return {};
}

function makeCounters(overrides: Partial<BadgeStateCounters> = {}): BadgeStateCounters {
  return {
    ...makeDefaultCounters('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function evaluate_free(counters: BadgeStateCounters, unlocks: BadgeState['unlocks'] = {}, now = new Date('2026-01-05T12:00:00Z')) {
  return evaluate(counters, unlocks, { tier: 'free' }, now);
}

function evaluate_pro(counters: BadgeStateCounters, unlocks: BadgeState['unlocks'] = {}, now = new Date('2026-01-05T12:00:00Z')) {
  return evaluate(counters, unlocks, { tier: 'pro' }, now);
}

function evaluate_founder(counters: BadgeStateCounters, unlocks: BadgeState['unlocks'] = {}, now = new Date('2026-01-05T12:00:00Z')) {
  return evaluate(counters, unlocks, { tier: 'founder' }, now);
}

// ─── First Words ──────────────────────────────────────────────────────────────

test('firstWords unlocks on first message', () => {
  const c = makeCounters({ messagesSent: 1 });
  const { newUnlocks } = evaluate_free(c);
  expect(newUnlocks.some((u) => u.id === 'firstWords')).toBe(true);
});

test('firstWords does not unlock when 0 messages', () => {
  const c = makeCounters({ messagesSent: 0 });
  const { newUnlocks } = evaluate_free(c);
  expect(newUnlocks.some((u) => u.id === 'firstWords')).toBe(false);
});

test('firstWords does not double-unlock', () => {
  const c = makeCounters({ messagesSent: 5 });
  const existing = { firstWords: { unlockedAt: '2026-01-01T00:00:00.000Z', seen: true } };
  const { newUnlocks } = evaluate_free(c, existing);
  expect(newUnlocks.some((u) => u.id === 'firstWords')).toBe(false);
});

// ─── Night Owl (00:00–03:59) ──────────────────────────────────────────────────

describe('Night Owl', () => {
  test('unlocks at midnight (hour 0)', () => {
    const c = makeCounters({ messagesSent: 1, lastMessageLocalHour: 0 });
    expect(evaluate_free(c).newUnlocks.some((u) => u.id === 'nightOwl')).toBe(true);
  });

  test('unlocks at 03:59 (hour 3)', () => {
    const c = makeCounters({ messagesSent: 1, lastMessageLocalHour: 3 });
    expect(evaluate_free(c).newUnlocks.some((u) => u.id === 'nightOwl')).toBe(true);
  });

  test('does NOT unlock at 04:00 (hour 4)', () => {
    const c = makeCounters({ messagesSent: 1, lastMessageLocalHour: 4 });
    expect(evaluate_free(c).newUnlocks.some((u) => u.id === 'nightOwl')).toBe(false);
  });

  test('does NOT unlock when hour is null', () => {
    const c = makeCounters({ messagesSent: 1, lastMessageLocalHour: null });
    expect(evaluate_free(c).newUnlocks.some((u) => u.id === 'nightOwl')).toBe(false);
  });
});

// ─── Early Bird (< 06:00, pro-gated) ─────────────────────────────────────────

describe('Early Bird', () => {
  test('does NOT unlock for free user even at 05:00', () => {
    const c = makeCounters({ messagesSent: 1, lastMessageLocalHour: 5 });
    expect(evaluate_free(c).newUnlocks.some((u) => u.id === 'earlyBird')).toBe(false);
  });

  test('unlocks for pro user at 05:00', () => {
    const c = makeCounters({ messagesSent: 1, lastMessageLocalHour: 5 });
    expect(evaluate_pro(c).newUnlocks.some((u) => u.id === 'earlyBird')).toBe(true);
  });

  test('does NOT unlock for pro at 06:00', () => {
    const c = makeCounters({ messagesSent: 1, lastMessageLocalHour: 6 });
    expect(evaluate_pro(c).newUnlocks.some((u) => u.id === 'earlyBird')).toBe(false);
  });
});

// ─── Witching Hour (11:11 exactly) ────────────────────────────────────────────

describe('Witching Hour', () => {
  test('unlocks at exactly hour=11, minute=11', () => {
    const c = makeCounters({ messagesSent: 1, lastMessageLocalHour: 11, lastMessageLocalMinute: 11 });
    expect(evaluate_free(c).newUnlocks.some((u) => u.id === 'witchingHour')).toBe(true);
  });

  test('does NOT unlock at 11:10', () => {
    const c = makeCounters({ messagesSent: 1, lastMessageLocalHour: 11, lastMessageLocalMinute: 10 });
    expect(evaluate_free(c).newUnlocks.some((u) => u.id === 'witchingHour')).toBe(false);
  });

  test('does NOT unlock at 10:11', () => {
    const c = makeCounters({ messagesSent: 1, lastMessageLocalHour: 10, lastMessageLocalMinute: 11 });
    expect(evaluate_free(c).newUnlocks.some((u) => u.id === 'witchingHour')).toBe(false);
  });
});

// ─── Chatterbox track (free tiers 0-1, pro tiers 2-4) ────────────────────────

describe('Chatterbox', () => {
  test('free user unlocks tier 0 at 100 messages', () => {
    const c = makeCounters({ messagesSent: 100 });
    const { newUnlocks } = evaluate_free(c);
    const u = newUnlocks.find((x) => x.id === 'chatterbox');
    expect(u?.tier).toBe(0);
  });

  test('free user unlocks tier 1 at 500 messages', () => {
    const c = makeCounters({ messagesSent: 500 });
    const existing = { chatterbox: { unlockedAt: '2026-01-01T00:00:00.000Z', seen: true, tier: 0 } };
    const { newUnlocks } = evaluate_free(c, existing);
    const u = newUnlocks.find((x) => x.id === 'chatterbox');
    expect(u?.tier).toBe(1);
  });

  test('free user does NOT unlock tier 2 even at 1000 messages (freeTierMax=1)', () => {
    const c = makeCounters({ messagesSent: 1000 });
    const existing = { chatterbox: { unlockedAt: '2026-01-01T00:00:00.000Z', seen: true, tier: 1 } };
    const { newUnlocks } = evaluate_free(c, existing);
    expect(newUnlocks.some((x) => x.id === 'chatterbox')).toBe(false);
  });

  test('pro user unlocks tier 2 at 1000 messages', () => {
    const c = makeCounters({ messagesSent: 1000 });
    const existing = { chatterbox: { unlockedAt: '2026-01-01T00:00:00.000Z', seen: true, tier: 1 } };
    const { newUnlocks } = evaluate_pro(c, existing);
    const u = newUnlocks.find((x) => x.id === 'chatterbox');
    expect(u?.tier).toBe(2);
  });

  test('does not re-unlock an already-earned tier', () => {
    const c = makeCounters({ messagesSent: 500 });
    const existing = { chatterbox: { unlockedAt: '2026-01-01T00:00:00.000Z', seen: true, tier: 1 } };
    const { newUnlocks } = evaluate_free(c, existing);
    expect(newUnlocks.some((x) => x.id === 'chatterbox')).toBe(false);
  });
});

// ─── Streak Keeper ────────────────────────────────────────────────────────────

describe('Streak Keeper', () => {
  test('unlocks tier 0 at 3-day streak', () => {
    const c = makeCounters({ consecutiveDayStreakMax: 3 });
    const { newUnlocks } = evaluate_free(c);
    expect(newUnlocks.find((x) => x.id === 'streakKeeper')?.tier).toBe(0);
  });

  test('does not unlock if streak is 2', () => {
    const c = makeCounters({ consecutiveDayStreakMax: 2 });
    expect(evaluate_free(c).newUnlocks.some((x) => x.id === 'streakKeeper')).toBe(false);
  });

  test('free user is capped at tier 1 (7-day)', () => {
    const c = makeCounters({ consecutiveDayStreakMax: 30 });
    const existing = { streakKeeper: { unlockedAt: '2026-01-01T00:00:00.000Z', seen: true, tier: 1 } };
    expect(evaluate_free(c, existing).newUnlocks.some((x) => x.id === 'streakKeeper')).toBe(false);
  });

  test('pro user unlocks tier 2 at 30-day streak', () => {
    const c = makeCounters({ consecutiveDayStreakMax: 30 });
    const existing = { streakKeeper: { unlockedAt: '2026-01-01T00:00:00.000Z', seen: true, tier: 1 } };
    const { newUnlocks } = evaluate_pro(c, existing);
    expect(newUnlocks.find((x) => x.id === 'streakKeeper')?.tier).toBe(2);
  });
});

// ─── Shapeshifter (5+ models same day, pro-gated) ─────────────────────────────

describe('Shapeshifter', () => {
  test('unlocks for pro when 5 models used today', () => {
    const today = '2026-01-05';
    const c = makeCounters({
      modelsUsedTodayByDate: { [today]: ['a', 'b', 'c', 'd', 'e'] },
    });
    const now = new Date('2026-01-05T12:00:00Z');
    expect(evaluate_pro(c, {}, now).newUnlocks.some((u) => u.id === 'shapeshifter')).toBe(true);
  });

  test('does NOT unlock when only 4 models used today', () => {
    const today = '2026-01-05';
    const c = makeCounters({
      modelsUsedTodayByDate: { [today]: ['a', 'b', 'c', 'd'] },
    });
    const now = new Date('2026-01-05T12:00:00Z');
    expect(evaluate_pro(c, {}, now).newUnlocks.some((u) => u.id === 'shapeshifter')).toBe(false);
  });

  test('does NOT unlock for free user even with 5 models today', () => {
    const today = '2026-01-05';
    const c = makeCounters({
      modelsUsedTodayByDate: { [today]: ['a', 'b', 'c', 'd', 'e'] },
    });
    const now = new Date('2026-01-05T12:00:00Z');
    expect(evaluate_free(c, {}, now).newUnlocks.some((u) => u.id === 'shapeshifter')).toBe(false);
  });
});

// ─── Konami Code (easter egg, free) ───────────────────────────────────────────

test('konamiCode unlocks when konamiTriggered = true', () => {
  const c = makeCounters({ konamiTriggered: true });
  expect(evaluate_free(c).newUnlocks.some((u) => u.id === 'konamiCode')).toBe(true);
});

test('konamiCode does not unlock when konamiTriggered = false', () => {
  const c = makeCounters({ konamiTriggered: false });
  expect(evaluate_free(c).newUnlocks.some((u) => u.id === 'konamiCode')).toBe(false);
});

// ─── Found the Dragon (7 taps, easter egg, free) ──────────────────────────────

test('foundTheDragon unlocks when gumaTapCount >= 7', () => {
  const c = makeCounters({ gumaTapCount: 7 });
  expect(evaluate_free(c).newUnlocks.some((u) => u.id === 'foundTheDragon')).toBe(true);
});

test('foundTheDragon does not unlock at 6 taps', () => {
  const c = makeCounters({ gumaTapCount: 6 });
  expect(evaluate_free(c).newUnlocks.some((u) => u.id === 'foundTheDragon')).toBe(false);
});

// ─── Beta Tester (pre-v1, easter egg, free) ───────────────────────────────────

test('betaTester unlocks if any build version starts with 0', () => {
  const c = makeCounters({ distinctBuildVersionsSeen: ['0.9.1', '1.0.0'] });
  expect(evaluate_free(c).newUnlocks.some((u) => u.id === 'betaTester')).toBe(true);
});

test('betaTester does not unlock if all builds are v1+', () => {
  const c = makeCounters({ distinctBuildVersionsSeen: ['1.0.0', '1.1.0'] });
  expect(evaluate_free(c).newUnlocks.some((u) => u.id === 'betaTester')).toBe(false);
});

// ─── Founders window math ─────────────────────────────────────────────────────

describe('Founders window', () => {
  const WINDOW_START = '2026-01-01T00:00:00.000Z';

  const founderCounters = makeCounters({
    foundersWindowStart: WINDOW_START,
    foundersPurchasedAt: WINDOW_START,
    consecutiveDayStreakMax: 7,
    feedbackSubmittedCount: 1,
    distinctBuildVersionsSeen: ['1.0.0', '1.1.0', '1.2.0'],
  });

  test('foundersF1 unlocks within 60 days', () => {
    const now = new Date('2026-02-28T00:00:00Z'); // day 58
    expect(evaluate_founder(founderCounters, {}, now).newUnlocks.some((u) => u.id === 'foundersF1')).toBe(true);
  });

  test('foundersF1 does NOT unlock on day 61+', () => {
    const now = new Date('2026-03-04T00:00:00Z'); // day 62
    expect(evaluate_founder(founderCounters, {}, now).newUnlocks.some((u) => u.id === 'foundersF1')).toBe(false);
  });

  test('foundersF2 Day One unlocks when purchased within 7 days', () => {
    const purchasedAt = '2026-01-05T00:00:00.000Z';
    const c = { ...founderCounters, foundersPurchasedAt: purchasedAt };
    const now = new Date('2026-01-10T00:00:00Z');
    expect(evaluate_founder(c, {}, now).newUnlocks.some((u) => u.id === 'foundersF2')).toBe(true);
  });

  test('foundersF2 Day One does NOT unlock when purchased on day 8+', () => {
    const purchasedAt = '2026-01-10T00:00:00.000Z'; // day 9
    const c = { ...founderCounters, foundersPurchasedAt: purchasedAt };
    const now = new Date('2026-01-15T00:00:00Z');
    expect(evaluate_founder(c, {}, now).newUnlocks.some((u) => u.id === 'foundersF2')).toBe(false);
  });

  test('foundersF3 Genesis Streak unlocks with 7-day streak within window', () => {
    const now = new Date('2026-01-15T00:00:00Z');
    expect(evaluate_founder(founderCounters, {}, now).newUnlocks.some((u) => u.id === 'foundersF3')).toBe(true);
  });

  test('foundersF4 Co-Architect unlocks with feedback during window', () => {
    const now = new Date('2026-01-15T00:00:00Z');
    expect(evaluate_founder(founderCounters, {}, now).newUnlocks.some((u) => u.id === 'foundersF4')).toBe(true);
  });

  test('foundersF6 Patch Surfer unlocks with 3+ builds during window', () => {
    const now = new Date('2026-01-15T00:00:00Z');
    expect(evaluate_founder(founderCounters, {}, now).newUnlocks.some((u) => u.id === 'foundersF6')).toBe(true);
  });

  test('F5 Keeper of Keys unlocks when F1,F2,F3,F4,F6,F7 are all unlocked', () => {
    const ts = '2026-01-15T00:00:00.000Z';
    const allButF5: BadgeState['unlocks'] = {
      foundersF1: { unlockedAt: ts, seen: false },
      foundersF2: { unlockedAt: ts, seen: false },
      foundersF3: { unlockedAt: ts, seen: false },
      foundersF4: { unlockedAt: ts, seen: false },
      foundersF6: { unlockedAt: ts, seen: false },
      foundersF7: { unlockedAt: ts, seen: false },
    };
    const now = new Date(ts);
    const { newUnlocks } = evaluate_founder(founderCounters, allButF5, now);
    expect(newUnlocks.some((u) => u.id === 'foundersF5')).toBe(true);
  });

  test('F5 does NOT unlock when F7 is missing', () => {
    const ts = '2026-01-15T00:00:00.000Z';
    const missingF7: BadgeState['unlocks'] = {
      foundersF1: { unlockedAt: ts, seen: false },
      foundersF2: { unlockedAt: ts, seen: false },
      foundersF3: { unlockedAt: ts, seen: false },
      foundersF4: { unlockedAt: ts, seen: false },
      foundersF6: { unlockedAt: ts, seen: false },
      // F7 missing
    };
    expect(evaluate_founder(founderCounters, missingF7, new Date(ts)).newUnlocks.some((u) => u.id === 'foundersF5')).toBe(false);
  });

  test('founder badges do NOT unlock for pro user', () => {
    const now = new Date('2026-01-15T00:00:00Z');
    const result = evaluate_pro(founderCounters, {}, now);
    const founderIds = ['foundersF1', 'foundersF2', 'foundersF3', 'foundersF4', 'foundersF5', 'foundersF6', 'foundersF7'];
    const unlocked = result.newUnlocks.filter((u) => founderIds.includes(u.id));
    expect(unlocked).toHaveLength(0);
  });

  test('founder badges do NOT unlock for free user', () => {
    const now = new Date('2026-01-15T00:00:00Z');
    const result = evaluate_free(founderCounters, {}, now);
    const founderIds = ['foundersF1', 'foundersF2', 'foundersF3', 'foundersF4', 'foundersF5', 'foundersF6', 'foundersF7'];
    expect(result.newUnlocks.filter((u) => founderIds.includes(u.id))).toHaveLength(0);
  });
});

// ─── Tool Wielder (pro-gated) ─────────────────────────────────────────────────

test('toolWielder unlocks for pro when toolCallSuccessCount >= 1', () => {
  const c = makeCounters({ toolCallSuccessCount: 1 });
  expect(evaluate_pro(c).newUnlocks.some((u) => u.id === 'toolWielder')).toBe(true);
});

test('toolWielder does not unlock for free user', () => {
  const c = makeCounters({ toolCallSuccessCount: 1 });
  expect(evaluate_free(c).newUnlocks.some((u) => u.id === 'toolWielder')).toBe(false);
});

// ─── Patience (stop generation, pro-gated) ───────────────────────────────────

test('patience unlocks for pro when stopGenerationCount >= 1', () => {
  const c = makeCounters({ stopGenerationCount: 1 });
  expect(evaluate_pro(c).newUnlocks.some((u) => u.id === 'patience')).toBe(true);
});

// ─── Two-Faced (2 theme toggles, pro-gated) ───────────────────────────────────

test('twoFaced unlocks for pro when themeToggleCount >= 2', () => {
  const c = makeCounters({ themeToggleCount: 2 });
  expect(evaluate_pro(c).newUnlocks.some((u) => u.id === 'twoFaced')).toBe(true);
});

// ─── Multi-Homed (2+ servers, pro-gated) ─────────────────────────────────────

test('multiHomed unlocks for pro with 2+ profiles', () => {
  const c = makeCounters({ serverProfilesUsedSet: ['p1', 'p2'] });
  expect(evaluate_pro(c).newUnlocks.some((u) => u.id === 'multiHomed')).toBe(true);
});

// ─── Vox Populi (voice input, pro-gated) ─────────────────────────────────────

test('voxPopuli unlocks for pro with voice input', () => {
  const c = makeCounters({ voiceInputCount: 1 });
  expect(evaluate_pro(c).newUnlocks.some((u) => u.id === 'voxPopuli')).toBe(true);
});

// ─── Anniversary (1-year, pro-gated) ─────────────────────────────────────────

test('anniversary unlocks for pro after 365 days', () => {
  const installDate = '2025-01-05T00:00:00.000Z';
  const c = makeCounters({ firstInstallDate: installDate });
  const now = new Date('2026-01-05T12:00:00Z'); // 365 days later
  expect(evaluate_pro(c, {}, now).newUnlocks.some((u) => u.id === 'anniversary')).toBe(true);
});

test('anniversary does NOT unlock before 365 days', () => {
  const installDate = '2025-01-06T00:00:00.000Z';
  const c = makeCounters({ firstInstallDate: installDate });
  const now = new Date('2026-01-05T12:00:00Z'); // 364 days
  expect(evaluate_pro(c, {}, now).newUnlocks.some((u) => u.id === 'anniversary')).toBe(false);
});

// ─── Marathon (50 messages in session, pro-gated) ─────────────────────────────

test('marathon unlocks for pro at 50 session messages', () => {
  const c = makeCounters({ longestSingleSessionMessageCount: 50 });
  expect(evaluate_pro(c).newUnlocks.some((u) => u.id === 'marathon')).toBe(true);
});

test('marathon does not unlock at 49', () => {
  const c = makeCounters({ longestSingleSessionMessageCount: 49 });
  expect(evaluate_pro(c).newUnlocks.some((u) => u.id === 'marathon')).toBe(false);
});

// ─── F7 Full Circle (max any track badge within window) ───────────────────────

test('foundersF7 unlocks when chatterbox reaches max tier (tier 4)', () => {
  const WINDOW_START = '2026-01-01T00:00:00.000Z';
  const c = makeCounters({ foundersWindowStart: WINDOW_START, foundersPurchasedAt: WINDOW_START });
  const unlocks: BadgeState['unlocks'] = {
    chatterbox: { unlockedAt: '2026-01-10T00:00:00.000Z', seen: true, tier: 4 },
  };
  const now = new Date('2026-01-15T00:00:00Z');
  expect(evaluate_founder(c, unlocks, now).newUnlocks.some((u) => u.id === 'foundersF7')).toBe(true);
});

test('foundersF7 does NOT unlock if max tier (4) not reached', () => {
  const WINDOW_START = '2026-01-01T00:00:00.000Z';
  const c = makeCounters({ foundersWindowStart: WINDOW_START, foundersPurchasedAt: WINDOW_START });
  const unlocks: BadgeState['unlocks'] = {
    chatterbox: { unlockedAt: '2026-01-10T00:00:00.000Z', seen: true, tier: 3 },
  };
  const now = new Date('2026-01-15T00:00:00Z');
  expect(evaluate_founder(c, unlocks, now).newUnlocks.some((u) => u.id === 'foundersF7')).toBe(false);
});

// ─── F5 — requiresIds from definition ─────────────────────────────────────────

test('F5 unlocks when all 6 required founder badges are present', () => {
  const c = makeCounters({ foundersWindowStart: '2026-04-01T00:00:00.000Z' });
  const unlocks: BadgeState['unlocks'] = {
    foundersF1: { unlockedAt: '2026-04-02T00:00:00.000Z', seen: true },
    foundersF2: { unlockedAt: '2026-04-02T00:00:00.000Z', seen: true },
    foundersF3: { unlockedAt: '2026-04-02T00:00:00.000Z', seen: true },
    foundersF4: { unlockedAt: '2026-04-02T00:00:00.000Z', seen: true },
    foundersF6: { unlockedAt: '2026-04-02T00:00:00.000Z', seen: true },
    foundersF7: { unlockedAt: '2026-04-02T00:00:00.000Z', seen: true },
  };
  const now = new Date('2026-04-03T00:00:00.000Z');
  expect(evaluate_founder(c, unlocks, now).newUnlocks.some((u) => u.id === 'foundersF5')).toBe(true);
});

test('F5 does NOT unlock when any required badge is missing', () => {
  const c = makeCounters({ foundersWindowStart: '2026-04-01T00:00:00.000Z' });
  const unlocks: BadgeState['unlocks'] = {
    foundersF1: { unlockedAt: '2026-04-02T00:00:00.000Z', seen: true },
    foundersF2: { unlockedAt: '2026-04-02T00:00:00.000Z', seen: true },
    // missing F3, F4, F6, F7
  };
  const now = new Date('2026-04-03T00:00:00.000Z');
  expect(evaluate_founder(c, unlocks, now).newUnlocks.some((u) => u.id === 'foundersF5')).toBe(false);
});

// ─── Founders purchase → F1/F2 unlock ─────────────────────────────────────────

test('F1 unlocks when foundersPurchasedAt is set within window', () => {
  const windowStart = '2026-04-01T00:00:00.000Z';
  const c = makeCounters({
    foundersWindowStart: windowStart,
    foundersPurchasedAt: '2026-04-03T00:00:00.000Z',
    messagesSent: 1,
  });
  const now = new Date('2026-04-03T12:00:00.000Z');
  expect(evaluate_founder(c, {}, now).newUnlocks.some((u) => u.id === 'foundersF1')).toBe(true);
});

test('F1 does NOT unlock when foundersPurchasedAt is null', () => {
  const c = makeCounters({
    foundersWindowStart: '2026-04-01T00:00:00.000Z',
    foundersPurchasedAt: null,
    messagesSent: 1,
  });
  const now = new Date('2026-04-03T12:00:00.000Z');
  expect(evaluate_founder(c, {}, now).newUnlocks.some((u) => u.id === 'foundersF1')).toBe(false);
});
