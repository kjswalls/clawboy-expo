/**
 * Tier color palette for track badges displayed in the account card pip row.
 * Index maps to BadgeDisplayRecord.unlock.tier (0-based).
 */

export const BADGE_TIER_COLORS = [
  '#CD7F32', // bronze   (tier 0)
  '#C0C0C0', // silver   (tier 1)
  '#FFD700', // gold     (tier 2)
  '#E5E4E2', // platinum (tier 3)
  '#B9F2FF', // diamond  (tier 4)
] as const;

/**
 * Returns the tier color for the given zero-based tier index, or `fallback`
 * when the badge has no tier (one-shots, uneaarned, etc.).
 */
export function getBadgeTierColor(tierIndex: number | undefined, fallback: string): string {
  if (tierIndex === undefined || tierIndex < 0) return fallback;
  return BADGE_TIER_COLORS[Math.min(tierIndex, BADGE_TIER_COLORS.length - 1)] ?? fallback;
}
