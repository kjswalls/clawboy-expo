/**
 * All 34 badge definitions.
 *
 * Predicates return null until engine.ts evaluates them. They are pure functions
 * of (counters, unlocks, now) — no IO, no Date.now() calls, no globals.
 *
 * Tier layout:
 *   Free (9): firstWords, chatterbox(t1-2), streakKeeper(t1-2), nightOwl,
 *             sessionBuilder(t1), konamiCode, betaTester, witchingHour, foundTheDragon
 *   Pro/Founder (18): polyglot, slashMaster, curator, agentWhisperer, magpie,
 *             tokenmaxxer, leanMachine, earlyBird, deepThinker, speedDemon,
 *             shapeshifter, toolWielder, marathon, anniversary, twoFaced, patience,
 *             multiHomed, voxPopuli
 *             (plus upper tiers of chatterbox/streakKeeper/sessionBuilder)
 *   Founders (7): foundersF1–F7
 */

import type { BadgeDefinition, BadgeStateCounters, BadgeState } from './types';
import { MODELS_TODAY_RETENTION_DAYS } from './types';

// ─── Track helpers ────────────────────────────────────────────────────────────

/**
 * Returns the highest tier index (0-based) reached by `value` in `thresholds`,
 * or null if not even the first threshold is met.
 */
export function tierFromCount(
  value: number,
  thresholds: number[],
): { tier: number } | null {
  let reached = -1;
  for (let i = 0; i < thresholds.length; i++) {
    const threshold = thresholds[i];
    if (threshold !== undefined && value >= threshold) reached = i;
  }
  return reached >= 0 ? { tier: reached } : null;
}

/** Returns whether `now` is within the 60-day founders window. */
export function isWithinFoundersWindow(
  foundersWindowStart: string,
  now: Date,
): boolean {
  const start = new Date(foundersWindowStart).getTime();
  const elapsed = now.getTime() - start;
  return elapsed >= 0 && elapsed < 60 * 24 * 60 * 60 * 1000;
}

/** Returns whether `purchasedAt` is within the first 7 days of the window. */
export function isPurchasedDayOne(
  foundersWindowStart: string,
  purchasedAt: string | null,
): boolean {
  if (!purchasedAt) return false;
  const start = new Date(foundersWindowStart).getTime();
  const bought = new Date(purchasedAt).getTime();
  return bought >= start && bought - start < 7 * 24 * 60 * 60 * 1000;
}

// ─── Founders window: Day One cutoff (7 days from window start) ──────────────

/** Build version gate: Beta Tester is awarded for versions starting with 0. */
function isBetaVersion(version: string): boolean {
  return version.startsWith('0');
}

// ─── Badge definitions ────────────────────────────────────────────────────────

export const BADGE_DEFINITIONS: BadgeDefinition[] = [

  // ── Free tracks ─────────────────────────────────────────────────────────────

  {
    id: 'chatterbox',
    icon: '💬',
    name: 'Chatterbox',
    description: 'Send messages. Lots of them.',
    kind: 'track',
    gate: 'free',
    freeTierMax: 1, // 0-based; tiers[0]=100, tiers[1]=500 → free gets t0 and t1
    tiers: [100, 500, 1000, 5000, 25000],
    predicate: (c: BadgeStateCounters) =>
      tierFromCount(c.messagesSent, [100, 500, 1000, 5000, 25000]),
  },

  {
    id: 'streakKeeper',
    icon: '🔥',
    name: 'Streak Keeper',
    description: 'Keep a daily messaging streak going.',
    kind: 'track',
    gate: 'free',
    freeTierMax: 1, // tiers[0]=3d, tiers[1]=7d → free gets t0 and t1
    tiers: [3, 7, 30, 100, 365],
    predicate: (c: BadgeStateCounters) =>
      tierFromCount(c.consecutiveDayStreakMax, [3, 7, 30, 100, 365]),
  },

  {
    id: 'sessionBuilder',
    icon: '📂',
    name: 'Session Builder',
    description: 'Create sessions and build your workspace.',
    kind: 'track',
    gate: 'free',
    freeTierMax: 0, // tiers[0]=10 → free gets t0 only
    tiers: [10, 50, 200, 1000],
    predicate: (c: BadgeStateCounters) =>
      tierFromCount(c.sessionsStarted, [10, 50, 200, 1000]),
  },

  // ── Free one-shots ───────────────────────────────────────────────────────────

  {
    id: 'firstWords',
    icon: '🏅',
    name: 'First Words',
    description: 'Send your first message.',
    kind: 'oneshot',
    gate: 'free',
    predicate: (c: BadgeStateCounters) =>
      c.messagesSent >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'nightOwl',
    icon: '🌙',
    name: 'Night Owl',
    description: 'Send a message in the dead of night (midnight–4am).',
    kind: 'oneshot',
    gate: 'free',
    predicate: (c: BadgeStateCounters) => {
      const h = c.lastMessageLocalHour;
      return h !== null && h >= 0 && h < 4 ? { unlocked: true } : null;
    },
  },

  // ── Easter eggs (free, hidden) ───────────────────────────────────────────────

  {
    id: 'konamiCode',
    icon: '🕹️',
    name: 'Konami Code',
    description: '↑↑↓↓←→←→BA',
    kind: 'easter_egg',
    gate: 'free',
    hidden: true,
    predicate: (c: BadgeStateCounters) =>
      c.konamiTriggered ? { unlocked: true } : null,
  },

  {
    id: 'betaTester',
    icon: '📱',
    name: 'Beta Tester',
    description: 'You were here before v1.0.',
    kind: 'easter_egg',
    gate: 'free',
    hidden: true,
    predicate: (c: BadgeStateCounters) => {
      const hasPreV1 = c.distinctBuildVersionsSeen.some(isBetaVersion);
      return hasPreV1 ? { unlocked: true } : null;
    },
  },

  {
    id: 'witchingHour',
    icon: '⏰',
    name: 'Witching Hour',
    description: 'Send a message at exactly 11:11.',
    kind: 'easter_egg',
    gate: 'free',
    hidden: true,
    predicate: (c: BadgeStateCounters) => {
      const h = c.lastMessageLocalHour;
      const m = c.lastMessageLocalMinute;
      return h === 11 && m === 11 ? { unlocked: true } : null;
    },
  },

  {
    id: 'foundTheDragon',
    icon: '🐉',
    name: 'Found the Dragon',
    description: "You found the dragon. It was in the settings the whole time.",
    kind: 'easter_egg',
    gate: 'free',
    hidden: true,
    predicate: (c: BadgeStateCounters) =>
      c.gumaTapCount >= 7 ? { unlocked: true } : null,
  },

  // ── Pro/Founder tracks (full) ────────────────────────────────────────────────

  {
    id: 'polyglot',
    icon: '🦎',
    name: 'Polyglot',
    description: 'Try many different models.',
    kind: 'track',
    gate: 'pro',
    tiers: [3, 7, 15, 30],
    predicate: (c: BadgeStateCounters) =>
      tierFromCount(c.modelsUsedSet.length, [3, 7, 15, 30]),
  },

  {
    id: 'slashMaster',
    icon: '⚡',
    name: 'Slash Master',
    description: 'Master the slash command palette.',
    kind: 'track',
    gate: 'pro',
    tiers: [3, 5, 7],
    predicate: (c: BadgeStateCounters) =>
      tierFromCount(c.slashCommandIdsUsedSet.length, [3, 5, 7]),
  },

  {
    id: 'curator',
    icon: '📎',
    name: 'Curator',
    description: 'Send attachments.',
    kind: 'track',
    gate: 'pro',
    tiers: [10, 50, 250],
    predicate: (c: BadgeStateCounters) =>
      tierFromCount(c.attachmentsSentCount, [10, 50, 250]),
  },

  {
    id: 'agentWhisperer',
    icon: '🤖',
    name: 'Agent Whisperer',
    description: 'Work with many different agents.',
    kind: 'track',
    gate: 'pro',
    tiers: [2, 5, 10],
    predicate: (c: BadgeStateCounters) =>
      tierFromCount(c.agentIdsUsedSet.length, [2, 5, 10]),
  },

  {
    id: 'magpie',
    icon: '📋',
    name: 'Magpie',
    description: 'Copy from the clipboard often.',
    kind: 'track',
    gate: 'pro',
    tiers: [10, 50, 200],
    predicate: (c: BadgeStateCounters) =>
      tierFromCount(c.clipboardActionCount, [10, 50, 200]),
  },

  {
    id: 'tokenmaxxer',
    icon: '🪙',
    name: 'Tokenmaxxer',
    description: 'Fill the context window. Repeatedly.',
    kind: 'track',
    gate: 'pro',
    tiers: [1_000_000, 10_000_000, 100_000_000, 1_000_000_000],
    predicate: (c: BadgeStateCounters) =>
      tierFromCount(c.cumulativeContextUsed, [
        1_000_000,
        10_000_000,
        100_000_000,
        1_000_000_000,
      ]),
  },

  {
    id: 'leanMachine',
    icon: '📉',
    name: 'Lean Machine',
    description: 'Keep sessions under 10% of the context window.',
    kind: 'track',
    gate: 'pro',
    tiers: [1, 10, 50, 250],
    predicate: (c: BadgeStateCounters) =>
      tierFromCount(c.leanSessionsCount, [1, 10, 50, 250]),
  },

  // ── Pro/Founder one-shots ────────────────────────────────────────────────────

  {
    id: 'earlyBird',
    icon: '🌅',
    name: 'Early Bird',
    description: 'Send a message before 6am.',
    kind: 'oneshot',
    gate: 'pro',
    predicate: (c: BadgeStateCounters) => {
      const h = c.lastMessageLocalHour;
      return h !== null && h < 6 ? { unlocked: true } : null;
    },
  },

  {
    id: 'deepThinker',
    icon: '🧠',
    name: 'Deep Thinker',
    description: 'Use a reasoning model for the first time.',
    kind: 'oneshot',
    gate: 'pro',
    predicate: (c: BadgeStateCounters) =>
      c.reasoningModelUsedCount >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'speedDemon',
    icon: '⚡',
    name: 'Speed Demon',
    description: 'Switch models mid-conversation.',
    kind: 'oneshot',
    gate: 'pro',
    predicate: (c: BadgeStateCounters) =>
      c.modelChangedMidConversationCount >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'shapeshifter',
    icon: '🎭',
    name: 'Shapeshifter',
    description: 'Use 5+ different models in a single day.',
    kind: 'oneshot',
    gate: 'pro',
    predicate: (c: BadgeStateCounters, _u: BadgeState['unlocks'], now: Date) => {
      const today = now.toISOString().slice(0, 10);
      const models = c.modelsUsedTodayByDate[today] ?? [];
      return models.length >= 5 ? { unlocked: true } : null;
    },
  },

  {
    id: 'toolWielder',
    icon: '🛠️',
    name: 'Tool Wielder',
    description: 'Watch an agent use a tool successfully.',
    kind: 'oneshot',
    gate: 'pro',
    predicate: (c: BadgeStateCounters) =>
      c.toolCallSuccessCount >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'marathon',
    icon: '🌀',
    name: 'Marathon',
    description: 'Reach 50 messages in a single session.',
    kind: 'oneshot',
    gate: 'pro',
    predicate: (c: BadgeStateCounters) =>
      c.longestSingleSessionMessageCount >= 50 ? { unlocked: true } : null,
  },

  {
    id: 'anniversary',
    icon: '📅',
    name: 'Anniversary',
    description: "You've been using ClawBoy for a year.",
    kind: 'oneshot',
    gate: 'pro',
    predicate: (c: BadgeStateCounters, _u: BadgeState['unlocks'], now: Date) => {
      const install = new Date(c.firstInstallDate).getTime();
      const elapsed = now.getTime() - install;
      return elapsed >= 365 * 24 * 60 * 60 * 1000 ? { unlocked: true } : null;
    },
  },

  {
    id: 'twoFaced',
    icon: '☀️',
    name: 'Two-Faced',
    description: 'Toggle between light and dark mode.',
    kind: 'oneshot',
    gate: 'pro',
    predicate: (c: BadgeStateCounters) =>
      c.themeToggleCount >= 2 ? { unlocked: true } : null,
  },

  {
    id: 'patience',
    icon: '🛑',
    name: 'Patience',
    description: 'Stop a generation mid-stream.',
    kind: 'oneshot',
    gate: 'pro',
    predicate: (c: BadgeStateCounters) =>
      c.stopGenerationCount >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'multiHomed',
    icon: '🌐',
    name: 'Multi-Homed',
    description: 'Connect to 2 or more different gateways.',
    kind: 'oneshot',
    gate: 'pro',
    predicate: (c: BadgeStateCounters) =>
      c.serverProfilesUsedSet.length >= 2 ? { unlocked: true } : null,
  },

  {
    id: 'voxPopuli',
    icon: '🎙️',
    name: 'Vox Populi',
    description: 'Send a voice message.',
    kind: 'oneshot',
    gate: 'pro',
    predicate: (c: BadgeStateCounters) =>
      c.voiceInputCount >= 1 ? { unlocked: true } : null,
  },

  // ── Founders-exclusive ───────────────────────────────────────────────────────

  {
    id: 'foundersF1',
    icon: '🐉',
    name: 'Founders Badge',
    description: 'You backed ClawBoy from the very beginning.',
    kind: 'founders',
    gate: 'founder',
    predicate: (c: BadgeStateCounters, _u: BadgeState['unlocks'], now: Date) =>
      c.foundersPurchasedAt !== null && isWithinFoundersWindow(c.foundersWindowStart, now)
        ? { unlocked: true }
        : null,
  },

  {
    id: 'foundersF2',
    icon: '⏳',
    name: 'Day One',
    description: 'Purchased within the first 7 days of the Founders Edition window.',
    kind: 'founders',
    gate: 'founder',
    predicate: (c: BadgeStateCounters, _u: BadgeState['unlocks'], now: Date) =>
      isPurchasedDayOne(c.foundersWindowStart, c.foundersPurchasedAt) &&
      isWithinFoundersWindow(c.foundersWindowStart, now)
        ? { unlocked: true }
        : null,
  },

  {
    id: 'foundersF3',
    icon: '🌟',
    name: 'Genesis Streak',
    description: 'Maintained a 7-day streak before day 60.',
    kind: 'founders',
    gate: 'founder',
    predicate: (c: BadgeStateCounters, _u: BadgeState['unlocks'], now: Date) =>
      c.consecutiveDayStreakMax >= 7 && isWithinFoundersWindow(c.foundersWindowStart, now)
        ? { unlocked: true }
        : null,
  },

  {
    id: 'foundersF4',
    icon: '🏗️',
    name: 'Co-Architect',
    description: 'Submitted feedback at least once during the Founders window.',
    kind: 'founders',
    gate: 'founder',
    predicate: (c: BadgeStateCounters, _u: BadgeState['unlocks'], now: Date) =>
      c.feedbackSubmittedCount >= 1 && isWithinFoundersWindow(c.foundersWindowStart, now)
        ? { unlocked: true }
        : null,
  },

  {
    id: 'foundersF5',
    icon: '🗝️',
    name: 'Keeper of the Keys',
    description: 'Earned all other Founders badges.',
    kind: 'founders',
    gate: 'founder',
    requiresIds: ['foundersF1', 'foundersF2', 'foundersF3', 'foundersF4', 'foundersF6', 'foundersF7'],
    predicate: (
      _c: BadgeStateCounters,
      u: BadgeState['unlocks'],
      now: Date,
      def?: BadgeDefinition,
    ) => {
      // F5 doesn't need to be within window — the other badges' window checks prevent
      // them from firing after day 60, so F5 can't be earned late anyway.
      void now;
      // Use requiresIds from the definition (single source of truth).
      const required: string[] = def?.requiresIds ?? ['foundersF1', 'foundersF2', 'foundersF3', 'foundersF4', 'foundersF6', 'foundersF7'];
      return required.every((id) => u[id]?.unlockedAt) ? { unlocked: true } : null;
    },
  },

  {
    id: 'foundersF6',
    icon: '🔨',
    name: 'Patch Surfer',
    description: 'Used ClawBoy across 3 or more distinct build versions during the Founders window.',
    kind: 'founders',
    gate: 'founder',
    predicate: (c: BadgeStateCounters, _u: BadgeState['unlocks'], now: Date) =>
      c.distinctBuildVersionsSeen.length >= 3 && isWithinFoundersWindow(c.foundersWindowStart, now)
        ? { unlocked: true }
        : null,
  },

  {
    id: 'foundersF7',
    icon: '🔄',
    name: 'Full Circle',
    description: 'Maxed out any one track badge before day 60.',
    kind: 'founders',
    gate: 'founder',
    predicate: (c: BadgeStateCounters, u: BadgeState['unlocks'], now: Date) => {
      if (!isWithinFoundersWindow(c.foundersWindowStart, now)) return null;
      // Track badge IDs whose max tier is checked — derived from their definitions
      // via BADGE_BY_ID at call time (populated after module evaluation).
      const trackIds = [
        'chatterbox', 'streakKeeper', 'sessionBuilder',
        'polyglot', 'slashMaster', 'curator',
        'agentWhisperer', 'magpie', 'tokenmaxxer', 'leanMachine',
      ];
      for (const id of trackIds) {
        const rec = u[id];
        if (!rec || rec.tier === undefined) continue;
        // Lazy-import via the module-level BADGE_BY_ID to avoid forward-reference.
        // BADGE_BY_ID is populated from this same BADGE_DEFINITIONS array after
        // module evaluation, so it is available by the time predicates run.
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const def = BADGE_BY_ID_REF[id];
        if (!def?.tiers) continue;
        const maxTierIdx = def.tiers.length - 1;
        if (rec.tier >= maxTierIdx) return { unlocked: true };
      }
      return null;
    },
  },
];

/** Lookup map for O(1) access by badge ID. */
export const BADGE_BY_ID: Record<string, BadgeDefinition> = Object.fromEntries(
  BADGE_DEFINITIONS.map((b) => [b.id, b]),
);

/**
 * Internal ref used by F7's predicate to look up sibling badge tiers without
 * a circular import. Populated immediately after BADGE_BY_ID is built.
 * @internal
 */
const BADGE_BY_ID_REF: Record<string, BadgeDefinition> = BADGE_BY_ID;

// Suppress unused import warning for MODELS_TODAY_RETENTION_DAYS — used by tracker.ts
void MODELS_TODAY_RETENTION_DAYS;
