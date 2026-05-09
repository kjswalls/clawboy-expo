/**
 * Badge system types.
 *
 * Privacy constraints (enforced at call sites — never relax these):
 *   - No message content, clipboard content, file content, URLs, or filenames.
 *   - Only counts, IDs, booleans, local hour buckets, and timestamps.
 */

// ─── Tier gating ─────────────────────────────────────────────────────────────

/** Resolved from RC + Supabase combined (paid wins). */
export type BadgeEntitlementTier = 'free' | 'pro' | 'founder';

// ─── Badge IDs ────────────────────────────────────────────────────────────────

export type BadgeId =
  // Free tracks (partial — upper tiers need Pro/Founder)
  | 'chatterbox'
  | 'streakKeeper'
  | 'sessionBuilder'
  // Free one-shots
  | 'firstWords'
  | 'nightOwl'
  // Easter eggs (hidden until earned)
  | 'konamiCode'
  | 'betaTester'
  | 'witchingHour'
  | 'foundTheDragon'
  // Pro/Founder tracks (full)
  | 'polyglot'
  | 'slashMaster'
  | 'curator'
  | 'agentWhisperer'
  | 'magpie'
  | 'tokenmaxxer'
  | 'leanMachine'
  // Pro/Founder one-shots
  | 'earlyBird'
  | 'deepThinker'
  | 'speedDemon'
  | 'shapeshifter'
  | 'toolWielder'
  | 'marathon'
  | 'anniversary'
  | 'twoFaced'
  | 'patience'
  | 'multiHomed'
  | 'voxPopuli'
  // Founders-exclusive (7)
  | 'foundersF1'
  | 'foundersF2'
  | 'foundersF3'
  | 'foundersF4'
  | 'foundersF5'
  | 'foundersF6'
  | 'foundersF7';

// ─── Badge definition ────────────────────────────────────────────────────────

export type BadgeKind = 'track' | 'oneshot' | 'easter_egg' | 'founders';

export interface BadgeDefinition {
  id: BadgeId;
  /** Display emoji — swap to art URL later by changing BadgeCard render fn. */
  icon: string;
  name: string;
  description: string;
  kind: BadgeKind;
  /**
   * Who can earn this badge.
   * 'free'    — any user
   * 'pro'     — pro or founder tier
   * 'founder' — founder tier only
   */
  gate: 'free' | 'pro' | 'founder';
  /**
   * For track badges with partial free access: the highest tier index (0-based)
   * a free user can reach. Not set for non-track badges.
   */
  freeTierMax?: number;
  /**
   * Track tiers — numeric thresholds. When set, the badge has N levels.
   * `unlocks[id].tier` holds the last unlocked tier index (0-based).
   */
  tiers?: number[];
  /**
   * Predicate to evaluate. Returns null if not yet earned, or an object with
   * `unlocked: true` (one-shots/founders) or `tier: number` (track badges).
   *
   * Arguments:
   *   c  — current counters
   *   u  — current unlock map (for chained checks, e.g. F5)
   *   now — injected time (never call Date.now() inside)
   */
  predicate: (
    c: BadgeStateCounters,
    u: BadgeState['unlocks'],
    now: Date,
    /** The badge definition itself — lets predicates reference requiresIds without inline duplication. */
    def?: BadgeDefinition,
  ) => { unlocked: true } | { tier: number } | null;
  /** Easter egg badges are hidden in the shelf until earned. */
  hidden?: boolean;
  /** Used for F5 Keeper of the Keys chained check. */
  requiresIds?: BadgeId[];
}

// ─── Counter set caps ────────────────────────────────────────────────────────

/** Max items kept in each Set counter before capping (to bound JSON size). */
export const COUNTER_SET_CAP = 100;

/** Days to retain in modelsUsedTodayByDate. */
export const MODELS_TODAY_RETENTION_DAYS = 7;

/** Days to retain in dailyMessageDates. */
export const DAILY_DATES_RETENTION_DAYS = 400;

// ─── Counters ─────────────────────────────────────────────────────────────────

export interface BadgeStateCounters {
  // Messages
  messagesSent: number;
  /** Local hour (0-23) of the most-recently-sent message. */
  lastMessageLocalHour: number | null;
  /** Local minute (0-59) of the most-recently-sent message. */
  lastMessageLocalMinute: number | null;

  // Sessions
  sessionsStarted: number;
  /** Model IDs used across all sessions. Capped at COUNTER_SET_CAP. */
  modelsUsedSet: string[];
  /** Model IDs used per local YYYY-MM-DD date. Retained for MODELS_TODAY_RETENTION_DAYS. */
  modelsUsedTodayByDate: Record<string, string[]>;

  // Slash commands
  /** Command IDs used. Capped at COUNTER_SET_CAP. */
  slashCommandIdsUsedSet: string[];

  // Attachments
  attachmentsSentCount: number;
  voiceInputCount: number;

  // Agents
  /** Agent IDs used. Capped at COUNTER_SET_CAP. */
  agentIdsUsedSet: string[];

  // Misc interactions
  clipboardActionCount: number;
  themeToggleCount: number;
  stopGenerationCount: number;
  /** Profile IDs used. Capped at COUNTER_SET_CAP. */
  serverProfilesUsedSet: string[];

  // Tool calls
  toolCallSuccessCount: number;

  // Streak
  /**
   * Local YYYY-MM-DD dates on which at least one message was sent.
   * Capped to DAILY_DATES_RETENTION_DAYS most-recent.
   */
  dailyMessageDates: Record<string, true>;
  consecutiveDayStreakMax: number;

  // Lean machine
  /** Sessions where peak context ratio was < 10%. */
  leanSessionsCount: number;

  // Context
  cumulativeContextUsed: number;

  // Feedback
  feedbackSubmittedCount: number;

  // Founders window + identity
  /** ISO8601 timestamp of first app launch — also the founders window start. */
  foundersWindowStart: string;
  /** ISO8601 timestamp of original IAP purchase (if any). */
  foundersPurchasedAt: string | null;

  // Build tracking
  /** Build versions seen. Capped at COUNTER_SET_CAP. */
  distinctBuildVersionsSeen: string[];

  // Easter eggs
  gumaTapCount: number;
  konamiTriggered: boolean;

  // Marathon — max messages in a single session (tracked live)
  longestSingleSessionMessageCount: number;

  /** ISO8601 of first install. Same as foundersWindowStart on initial write. */
  firstInstallDate: string;
  /** Times model was changed mid-conversation (with messages already sent). */
  modelChangedMidConversationCount: number;
  /** Times a reasoning/thinking model was selected. */
  reasoningModelUsedCount: number;
}

// ─── Badge state ─────────────────────────────────────────────────────────────

export interface BadgeUnlockRecord {
  unlockedAt: string; // ISO8601
  seen: boolean;
  /** For track badges: index of the highest tier unlocked (0-based). */
  tier?: number;
}

export interface BadgeState {
  schemaVersion: number;
  /** ISO8601 when the user opted in; null = not opted in. */
  enabledAt: string | null;
  counters: BadgeStateCounters;
  unlocks: Record<string, BadgeUnlockRecord>;
  cosmetics: {
    activeFrame?: string;
    /** User-pinned badge IDs to display on AccountCard (max 3). */
    displayedBadges?: string[];
  };
  lastModified: string; // ISO8601
  deviceId: string;
}

// ─── Engine output ────────────────────────────────────────────────────────────

export interface NewUnlock {
  id: BadgeId;
  unlockedAt: string;
  /** For track badges: the tier index just reached (0-based). */
  tier?: number;
}

export interface EngineResult {
  newUnlocks: NewUnlock[];
}
