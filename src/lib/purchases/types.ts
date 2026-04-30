import type { FounderTier } from '@/lib/supabase/types';

export type { FounderTier };

export type TipProductId = 'tip_small' | 'tip_medium' | 'tip_large';

export type PurchaseResult =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export interface FoundersTierMeta {
  readonly id: FounderTier;
  /** Store product ID (App Store / Play Console). */
  readonly productId: string;
  /** RevenueCat entitlement identifier. */
  readonly entitlementId: string;
  /** Human-readable label. */
  readonly label: string;
  /** Suggested placeholder price label shown while offerings load. */
  readonly defaultPriceLabel: string;
  /** Short marketing perks list shown in the tier card. */
  readonly perks: readonly string[];
}

export interface TipProductMeta {
  readonly id: TipProductId;
  /** Store product ID. */
  readonly productId: string;
  /** Short label for the button, e.g. "Small". */
  readonly label: string;
  /** Suggested placeholder price label. */
  readonly defaultPriceLabel: string;
}
