/**
 * All badge definitions.
 *
 * Wave 0  = pre-overhaul badges (releaseWave: 0 or undefined — always active)
 * Wave 1  = overhaul additions (releaseWave: 1)
 *
 * Predicates return null until engine.ts evaluates them. They are pure functions
 * of (counters, unlocks, now) — no IO, no Date.now() calls, no globals.
 */

import type { BadgeDefinition, BadgeId, BadgeStateCounters, BadgeState } from './types';
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

/** Build version gate: Beta Tester is awarded for versions starting with 0. */
function isBetaVersion(version: string): boolean {
  return version.startsWith('0');
}

/**
 * Returns true if a badge is fully earned (oneshot unlocked or track at max tier).
 * Used by completionist/magnumOpus predicates.
 */
function isFullyEarned(
  id: BadgeId,
  u: BadgeState['unlocks'],
  defs: BadgeDefinition[],
): boolean {
  const def = defs.find((d) => d.id === id);
  const rec = u[id];
  if (!rec?.unlockedAt) return false;
  if (def?.tiers) return rec.tier === def.tiers.length - 1;
  return true;
}

/** New Year midnight check (local time). */
function isNewYearMidnight(localHour: number | null, localMinute: number | null, now: Date): boolean {
  if (localHour !== 0 || localMinute !== 0) return false;
  const m = now.getMonth(); // 0-based; Jan = 0
  const d = now.getDate();
  return m === 0 && d === 1;
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
    releaseWave: 0,
    freeTierMax: 1,
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
    releaseWave: 0,
    freeTierMax: 1,
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
    releaseWave: 0,
    freeTierMax: 0,
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
    releaseWave: 0,
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
    releaseWave: 0,
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
    releaseWave: 0,
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
    releaseWave: 0,
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
    releaseWave: 0,
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
    releaseWave: 0,
    predicate: (c: BadgeStateCounters) =>
      c.gumaTapCount >= 7 ? { unlocked: true } : null,
  },

  // ── Easter eggs — wave 1 ─────────────────────────────────────────────────────

  {
    id: 'detective',
    icon: '🕵️',
    name: 'Detective',
    description: 'Pause the gateway log stream mid-flow.',
    kind: 'easter_egg',
    gate: 'free',
    hidden: true,
    releaseWave: 1,
    predicate: (c: BadgeStateCounters) =>
      c.logsPausedCount >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'nevermind',
    icon: '🙅',
    name: 'Nevermind',
    description: 'Clear the chat input without sending.',
    kind: 'easter_egg',
    gate: 'free',
    hidden: true,
    releaseWave: 1,
    predicate: (c: BadgeStateCounters) =>
      c.inputClearedCount >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'sentinel',
    icon: '🛡️',
    name: 'Sentinel',
    description: 'Expand a privacy or security card on the About page.',
    kind: 'easter_egg',
    gate: 'free',
    hidden: true,
    releaseWave: 1,
    predicate: (c: BadgeStateCounters) =>
      c.privacyExpandedCount >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'gruntBirthdayParty',
    icon: '🎂',
    name: 'Grunt Birthday Party',
    description: 'Tap the fake "Submit" button on the Inline Reply Controls preview.',
    kind: 'easter_egg',
    gate: 'free',
    hidden: true,
    releaseWave: 1,
    predicate: (c: BadgeStateCounters) =>
      c.fakeSubmitTappedCount >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'marketing',
    icon: '📣',
    name: 'Marketing',
    description: 'Follow the link in the settings footer to sundaysoftworks.com.',
    kind: 'easter_egg',
    gate: 'free',
    hidden: true,
    releaseWave: 1,
    predicate: (c: BadgeStateCounters) =>
      c.footerLinkTappedCount >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'leet',
    icon: '💻',
    name: '1337',
    description: 'Send your 1337th message — or one exactly 1337 characters long.',
    kind: 'easter_egg',
    gate: 'free',
    hidden: true,
    releaseWave: 1,
    predicate: (c: BadgeStateCounters) =>
      c.messagesSent === 1337 || c.lastMessageLength === 1337 ? { unlocked: true } : null,
  },

  {
    id: 'inspectorGadget',
    icon: '🎩',
    name: 'Inspector Gadget',
    description: 'Triple-tap the chat header title to peek at session internals.',
    kind: 'easter_egg',
    gate: 'free',
    hidden: true,
    releaseWave: 1,
    predicate: (c: BadgeStateCounters) =>
      c.chatHeaderTripleTappedCount >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'punctual',
    icon: '🎉',
    name: 'Punctual',
    description: "Send a message at the stroke of midnight on New Year's Eve, or on the app's birthday.",
    kind: 'easter_egg',
    gate: 'free',
    hidden: true,
    releaseWave: 1,
    predicate: (c: BadgeStateCounters, _u: BadgeState['unlocks'], now: Date) =>
      isNewYearMidnight(c.lastMessageLocalHour, c.lastMessageLocalMinute, now) ? { unlocked: true } : null,
  },

  {
    id: 'curiosityKilledTheClaw',
    icon: '🦞',
    name: 'Curiosity Killed the Claw',
    description: 'Discover every other easter egg.',
    kind: 'easter_egg',
    gate: 'free',
    hidden: true,
    releaseWave: 1,
    requiresIds: [
      'konamiCode', 'betaTester', 'witchingHour', 'foundTheDragon',
      'detective', 'nevermind', 'sentinel', 'gruntBirthdayParty',
      'marketing', 'leet', 'inspectorGadget', 'punctual',
    ],
    predicate: (
      _c: BadgeStateCounters,
      u: BadgeState['unlocks'],
      _now: Date,
      def?: BadgeDefinition,
    ) => {
      const required: string[] = def?.requiresIds ?? [];
      return required.every((id) => u[id]?.unlockedAt) ? { unlocked: true } : null;
    },
  },

  // ── Free tracks — session ops (wave 1) ───────────────────────────────────────

  {
    id: 'curator',
    icon: '📌',
    name: 'Curator',
    description: 'Pin sessions for quick access.',
    kind: 'track',
    gate: 'free',
    releaseWave: 1,
    tiers: [1, 5, 20],
    predicate: (c: BadgeStateCounters) =>
      tierFromCount(c.sessionsPinnedCount, [1, 5, 20]),
  },

  {
    id: 'springCleaner',
    icon: '🧹',
    name: 'Spring Cleaner',
    description: 'Delete old sessions.',
    kind: 'track',
    gate: 'free',
    releaseWave: 1,
    tiers: [10, 100, 1000],
    predicate: (c: BadgeStateCounters) =>
      tierFromCount(c.sessionsDeletedCount, [10, 100, 1000]),
  },

  // ── Free one-shots — session ops (wave 1) ────────────────────────────────────

  {
    id: 'namegiver',
    icon: '✏️',
    name: 'Namegiver',
    description: 'Rename a session for the first time.',
    kind: 'oneshot',
    gate: 'free',
    releaseWave: 1,
    predicate: (c: BadgeStateCounters) =>
      c.sessionsRenamedCount >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'nuketown',
    icon: '☢️',
    name: 'Nuketown',
    description: 'Clear ALL sessions in one go.',
    kind: 'oneshot',
    gate: 'free',
    releaseWave: 1,
    predicate: (c: BadgeStateCounters) =>
      c.sessionsBulkClearedCount >= 1 ? { unlocked: true } : null,
  },

  // ── Free one-shots — feature discovery (wave 1) ──────────────────────────────

  {
    id: 'interiorDesign',
    icon: '🎨',
    name: 'Interior Design',
    description: 'Try different theme variants.',
    kind: 'track',
    gate: 'free',
    releaseWave: 1,
    tiers: [2, 5],
    predicate: (c: BadgeStateCounters) =>
      tierFromCount(c.themeVariantsUsedSet.length, [2, 5]),
  },

  {
    id: 'bleedingEdge',
    icon: '🩸',
    name: 'Bleeding Edge',
    description: 'Manually check for app updates.',
    kind: 'oneshot',
    gate: 'free',
    releaseWave: 1,
    predicate: (c: BadgeStateCounters) =>
      c.updateChecksCount >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'tongueTwister',
    icon: '👅',
    name: 'Tongue Twister',
    description: 'Listen to the test voice phrase.',
    kind: 'oneshot',
    gate: 'free',
    releaseWave: 1,
    predicate: (c: BadgeStateCounters) =>
      c.voiceTestedCount >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'silenceFiend',
    icon: '🤫',
    name: 'Silence, Fiend!',
    description: 'Stop a response audio mid-playback with the media stop button.',
    kind: 'oneshot',
    gate: 'free',
    releaseWave: 1,
    predicate: (c: BadgeStateCounters) =>
      c.audioStoppedCount >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'coPilot',
    icon: '✈️',
    name: 'Co-Pilot',
    description: 'Submit a bug report or feature request.',
    kind: 'oneshot',
    gate: 'free',
    releaseWave: 1,
    predicate: (c: BadgeStateCounters) =>
      c.feedbackSubmittedCount >= 1 ? { unlocked: true } : null,
  },

  // ── Pro/Founder tracks (full) — wave 0 ───────────────────────────────────────

  {
    id: 'polyglot',
    icon: '🦎',
    name: 'Polyglot',
    description: 'Try many different models.',
    kind: 'track',
    gate: 'pro',
    releaseWave: 0,
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
    releaseWave: 0,
    tiers: [3, 5, 7],
    predicate: (c: BadgeStateCounters) =>
      tierFromCount(c.slashCommandIdsUsedSet.length, [3, 5, 7]),
  },

  {
    id: 'packRat',
    icon: '📎',
    name: 'Pack Rat',
    description: 'Attach files, photos, or media. A growing collection.',
    kind: 'track',
    gate: 'pro',
    releaseWave: 0,
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
    releaseWave: 0,
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
    releaseWave: 0,
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
    releaseWave: 0,
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
    releaseWave: 0,
    tiers: [1, 10, 50, 250],
    predicate: (c: BadgeStateCounters) =>
      tierFromCount(c.leanSessionsCount, [1, 10, 50, 250]),
  },

  // ── Pro/Founder tracks — logs power-user (wave 1) ────────────────────────────

  {
    id: 'sleuth',
    icon: '🔎',
    name: 'Sleuth',
    description: 'Filter gateway logs by level.',
    kind: 'track',
    gate: 'free',
    releaseWave: 1,
    tiers: [1, 3, 4],
    predicate: (c: BadgeStateCounters) =>
      tierFromCount(c.logFiltersAppliedSet.length, [1, 3, 4]),
  },

  {
    id: 'bugHunter',
    icon: '🐛',
    name: 'Bug Hunter',
    description: 'Search gateway logs.',
    kind: 'track',
    gate: 'free',
    releaseWave: 1,
    tiers: [1, 10, 50],
    predicate: (c: BadgeStateCounters) =>
      tierFromCount(c.logSearchesCount, [1, 10, 50]),
  },

  // ── Pro/Founder one-shots — wave 0 ───────────────────────────────────────────

  {
    id: 'earlyBird',
    icon: '🌅',
    name: 'Early Bird',
    description: 'Send a message before 6am.',
    kind: 'oneshot',
    gate: 'pro',
    releaseWave: 0,
    predicate: (c: BadgeStateCounters) => {
      const h = c.lastMessageLocalHour;
      return h !== null && h < 6 ? { unlocked: true } : null;
    },
  },

  {
    id: 'speedDemon',
    icon: '⚡',
    name: 'Speed Demon',
    description: 'Switch models mid-conversation.',
    kind: 'oneshot',
    gate: 'pro',
    releaseWave: 0,
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
    releaseWave: 0,
    predicate: (c: BadgeStateCounters, _u: BadgeState['unlocks'], now: Date) => {
      const today = now.toISOString().slice(0, 10);
      const models = c.modelsUsedTodayByDate[today] ?? [];
      return models.length >= 5 ? { unlocked: true } : null;
    },
  },

  // ── Pro/Founder one-shots — wave 1 ───────────────────────────────────────────

  {
    id: 'inspector',
    icon: '🔍',
    name: 'Inspector',
    description: "Expand a tool call or internal card to peek inside an agent's work.",
    kind: 'oneshot',
    gate: 'pro',
    releaseWave: 1,
    predicate: (c: BadgeStateCounters) =>
      c.cardExpandedCount >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'marathon',
    icon: '🌀',
    name: 'Marathon',
    description: 'Reach 50 messages in a single session.',
    kind: 'oneshot',
    gate: 'pro',
    releaseWave: 0,
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
    releaseWave: 0,
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
    releaseWave: 0,
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
    releaseWave: 0,
    predicate: (c: BadgeStateCounters) =>
      c.stopGenerationCount >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'summerHome',
    icon: '🌐',
    name: 'Summer Home',
    description: 'Connect to 2 or more different gateways.',
    kind: 'oneshot',
    gate: 'pro',
    releaseWave: 0,
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
    releaseWave: 0,
    predicate: (c: BadgeStateCounters) =>
      c.voiceInputCount >= 1 ? { unlocked: true } : null,
  },

  {
    id: 'codeReview',
    icon: '📝',
    name: 'Code Review',
    description: 'Send a reply with inline annotations attached.',
    kind: 'oneshot',
    gate: 'pro',
    releaseWave: 1,
    predicate: (c: BadgeStateCounters) =>
      c.annotatedRepliesSentCount >= 1 ? { unlocked: true } : null,
  },

  // ── Meta-badges — completionist / magnumOpus (wave 1) ────────────────────────

  {
    id: 'completionist',
    icon: '🏆',
    name: 'Completionist',
    description: 'Earn every free-tier non-secret badge.',
    kind: 'track',
    gate: 'free',
    releaseWave: 1,
    waves: [[
      'firstWords', 'nightOwl', 'chatterbox', 'streakKeeper', 'sessionBuilder',
      'curator', 'springCleaner', 'namegiver', 'nuketown',
      'sleuth', 'bugHunter',
      'interiorDesign', 'bleedingEdge', 'tongueTwister', 'silenceFiend', 'coPilot',
    ]],
    tiers: [0],
    predicate: (
      c: BadgeStateCounters,
      u: BadgeState['unlocks'],
      _now: Date,
      def?: BadgeDefinition,
    ) => {
      const waveSets = def?.waves ?? [];
      let highest = -1;
      for (let i = 0; i < waveSets.length; i++) {
        const waveIds = waveSets[i];
        if (waveIds === undefined) break;
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        if (waveIds.every((id) => isFullyEarned(id, u, BADGE_DEFINITIONS))) {
          highest = i;
        } else {
          break; // tiers are cumulative
        }
      }
      return highest >= 0 ? { tier: highest } : null;
    },
  },

  {
    id: 'magnumOpus',
    icon: '🎼',
    name: 'Magnum Opus',
    description: 'Earn every pro-tier non-secret badge.',
    kind: 'track',
    gate: 'pro',
    releaseWave: 1,
    waves: [[
      'polyglot', 'slashMaster', 'packRat', 'agentWhisperer', 'magpie',
      'tokenmaxxer', 'leanMachine',
      'earlyBird', 'speedDemon', 'shapeshifter', 'inspector',
      'marathon', 'anniversary', 'twoFaced', 'patience', 'summerHome', 'voxPopuli', 'codeReview',
    ]],
    tiers: [0],
    predicate: (
      c: BadgeStateCounters,
      u: BadgeState['unlocks'],
      _now: Date,
      def?: BadgeDefinition,
    ) => {
      const waveSets = def?.waves ?? [];
      let highest = -1;
      for (let i = 0; i < waveSets.length; i++) {
        const waveIds = waveSets[i];
        if (waveIds === undefined) break;
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        if (waveIds.every((id) => isFullyEarned(id, u, BADGE_DEFINITIONS))) {
          highest = i;
        } else {
          break;
        }
      }
      return highest >= 0 ? { tier: highest } : null;
    },
  },

  // ── Founders-exclusive ───────────────────────────────────────────────────────

  {
    id: 'foundersF1',
    icon: '🐉',
    name: 'Founders Badge',
    description: 'You backed ClawBoy from the very beginning.',
    kind: 'founders',
    gate: 'founder',
    releaseWave: 0,
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
    releaseWave: 0,
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
    releaseWave: 0,
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
    releaseWave: 0,
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
    releaseWave: 0,
    requiresIds: ['foundersF1', 'foundersF2', 'foundersF3', 'foundersF4', 'foundersF6', 'foundersF7'],
    predicate: (
      _c: BadgeStateCounters,
      u: BadgeState['unlocks'],
      now: Date,
      def?: BadgeDefinition,
    ) => {
      void now;
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
    releaseWave: 0,
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
    releaseWave: 0,
    predicate: (c: BadgeStateCounters, u: BadgeState['unlocks'], now: Date) => {
      if (!isWithinFoundersWindow(c.foundersWindowStart, now)) return null;
      const trackIds = [
        'chatterbox', 'streakKeeper', 'sessionBuilder',
        'polyglot', 'slashMaster', 'packRat',
        'agentWhisperer', 'magpie', 'tokenmaxxer', 'leanMachine',
      ];
      for (const id of trackIds) {
        const rec = u[id];
        if (!rec || rec.tier === undefined) continue;
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
