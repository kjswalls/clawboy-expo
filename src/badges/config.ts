/**
 * Badge wave configuration.
 *
 * Bump ACTIVE_BADGE_WAVES to enable new waves without a full release cycle.
 * Wave 0 = pre-overhaul badges (always active; releaseWave undefined or 0).
 * Wave 1 = overhaul badges shipped with this rewrite.
 */

export const ACTIVE_BADGE_WAVES: ReadonlySet<number> = new Set([0, 1]);
