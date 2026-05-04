import type { EntitlementTier } from '@/lib/supabase/types';

export type { EntitlementTier };

export type PurchaseResult =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export interface OneTimeProductMeta {
  /** Internal tier ID — matches entitlement row tier value. */
  readonly id: EntitlementTier;
  /** Store product ID (App Store / Play Console). */
  readonly productId: string;
  /** RevenueCat entitlement identifier. */
  readonly entitlementId: string;
  /** Human-readable label. */
  readonly label: string;
  /** Suggested placeholder price label shown while offerings load. */
  readonly defaultPriceLabel: string;
  /** Short marketing perks list shown on the purchase card. */
  readonly perks: readonly string[];
}
