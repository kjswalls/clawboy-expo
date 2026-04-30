import type { FoundersTierMeta, TipProductMeta } from './types';

/**
 * Single source of truth for all purchasable products in ClawBoy.
 *
 * Product IDs here MUST exactly match what is configured in:
 *   - App Store Connect (non-consumable Founders; consumable tips)
 *   - Google Play Console (managed / consumable products)
 *   - RevenueCat dashboard (products attached to entitlements or standalone)
 *
 * Tier ordering is significant — higher index = higher tier.
 */
export const FOUNDERS_TIERS: readonly FoundersTierMeta[] = [
  {
    id: 'founder_bronze',
    productId: 'clawboy.founders.bronze',
    entitlementId: 'founders_bronze',
    label: 'Bronze',
    defaultPriceLabel: '$4.99',
    perks: [
      'Bronze Founder badge on your profile',
      'Exclusive bronze accent color',
      'Original Founder recognition',
    ],
  },
  {
    id: 'founder_silver',
    productId: 'clawboy.founders.silver',
    entitlementId: 'founders_silver',
    label: 'Silver',
    defaultPriceLabel: '$14.99',
    perks: [
      'Everything in Bronze',
      'Silver Founder badge',
      'Two exclusive dark themes',
      'Custom accent color picker',
    ],
  },
  {
    id: 'founder_gold',
    productId: 'clawboy.founders.gold',
    entitlementId: 'founders_gold',
    label: 'Gold',
    defaultPriceLabel: '$49.99',
    perks: [
      'Everything in Silver',
      'Gold Founder badge',
      'All exclusive themes unlocked',
      'Full accent color palette',
      'Early access to new features',
    ],
  },
] as const;

export const TIP_PRODUCTS: readonly TipProductMeta[] = [
  {
    id: 'tip_small',
    productId: 'clawboy.tip.small',
    label: 'Small',
    defaultPriceLabel: '$0.99',
  },
  {
    id: 'tip_medium',
    productId: 'clawboy.tip.medium',
    label: 'Medium',
    defaultPriceLabel: '$2.99',
  },
  {
    id: 'tip_large',
    productId: 'clawboy.tip.large',
    label: 'Large',
    defaultPriceLabel: '$4.99',
  },
] as const;

/** RevenueCat offering identifier that bundles all Founders packages. */
export const FOUNDERS_OFFERING_ID = 'founders';

/** RevenueCat offering identifier that bundles all tip packages. */
export const TIPS_OFFERING_ID = 'tips';

/**
 * Map from RevenueCat entitlementId → FounderTier.
 * Used by the webhook and PurchasesContext to resolve tiers.
 */
export const ENTITLEMENT_TO_TIER: Record<string, import('./types').FounderTier> = {
  founders_bronze: 'founder_bronze',
  founders_silver: 'founder_silver',
  founders_gold: 'founder_gold',
};

/**
 * Tier precedence — returns the highest owned Founders tier given a set of
 * active RevenueCat entitlement identifiers.
 */
export function resolveFounderTier(activeEntitlementIds: string[]): import('./types').FounderTier {
  const set = new Set(activeEntitlementIds);
  if (set.has('founders_gold')) return 'founder_gold';
  if (set.has('founders_silver')) return 'founder_silver';
  if (set.has('founders_bronze')) return 'founder_bronze';
  return 'free';
}
