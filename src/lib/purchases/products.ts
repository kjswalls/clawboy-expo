import type { EntitlementTier } from './types';
import type { OneTimeProductMeta } from './types';

/**
 * Single source of truth for all purchasable products in ClawBoy.
 *
 * Product IDs here MUST exactly match what is configured in:
 *   - App Store Connect (non-consumable)
 *   - Google Play Console (managed products)
 *   - RevenueCat dashboard (products attached to entitlements)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Products
// ─────────────────────────────────────────────────────────────────────────────

/** Founders Edition — $9.99, available days 1-60 only. */
export const FOUNDERS_PRODUCT: OneTimeProductMeta = {
  id: 'founder',
  productId: 'clawboy.founders',
  entitlementId: 'founder',
  label: 'Founders Edition',
  defaultPriceLabel: '$9.99',
  perks: [
    'Founders Badge (premium OG art — never sold again)',
    '5 Founders-exclusive achievement badges with animated frames',
    '3 exclusive app icons',
    '2 exclusive chat themes',
    'Founders sound pack',
    'Custom typing indicator animations (3 variants)',
    'Profile card customization',
    'Curated prompt template library',
    'Lifetime free access to ALL future cosmetic packs',
    'One-time purchase — no subscription',
  ],
} as const;

/** ClawBoy Pro — $19.99, available day 61+. */
export const PRO_PRODUCT: OneTimeProductMeta = {
  id: 'pro',
  productId: 'clawboy.pro',
  entitlementId: 'pro',
  label: 'ClawBoy Pro',
  defaultPriceLabel: '$19.99',
  perks: [
    '3 exclusive app icons',
    '2 exclusive chat themes',
    'Pro sound pack',
    'Custom typing indicator animations (3 variants)',
    'Profile card customization',
    'Curated prompt template library',
    'One-time purchase — no subscription',
  ],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// RevenueCat offering IDs
// ─────────────────────────────────────────────────────────────────────────────

/** RevenueCat offering identifier for the Founders package. */
export const FOUNDERS_OFFERING_ID = 'founders';

/** RevenueCat offering identifier for the Pro package. */
export const PRO_OFFERING_ID = 'pro';

// ─────────────────────────────────────────────────────────────────────────────
// Entitlement resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map from RevenueCat entitlementId → EntitlementTier.
 * Used by the webhook and PurchasesContext to resolve tier from RC data.
 */
export const ENTITLEMENT_TO_TIER: Record<string, EntitlementTier> = {
  founder: 'founder',
  pro: 'pro',
};

/**
 * Returns the highest owned tier given a set of active RC entitlement IDs.
 * Founders beats Pro beats free.
 */
export function resolveTier(activeEntitlementIds: string[]): EntitlementTier {
  const set = new Set(activeEntitlementIds);
  if (set.has('founder')) return 'founder';
  if (set.has('pro')) return 'pro';
  return 'free';
}

// ─────────────────────────────────────────────────────────────────────────────
// Founders window helpers
// ─────────────────────────────────────────────────────────────────────────────

const FOUNDERS_WINDOW_DURATION_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

/**
 * Returns true if the Founders Edition purchase window is currently open.
 * Window = [launchAt, launchAt + 60 days).
 * Returns false if launchAt is null (not yet loaded).
 */
export function isFoundersWindowOpen(launchAt: Date | null, now: Date = new Date()): boolean {
  if (!launchAt) return false;
  const windowEnd = new Date(launchAt.getTime() + FOUNDERS_WINDOW_DURATION_MS);
  return now >= launchAt && now < windowEnd;
}

/**
 * Returns milliseconds remaining in the Founders window, clamped to >= 0.
 * Returns 0 if launchAt is null or the window has closed.
 */
export function foundersWindowRemainingMs(launchAt: Date | null, now: Date = new Date()): number {
  if (!launchAt) return 0;
  const windowEnd = new Date(launchAt.getTime() + FOUNDERS_WINDOW_DURATION_MS);
  return Math.max(0, windowEnd.getTime() - now.getTime());
}
