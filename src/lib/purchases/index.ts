/**
 * BLOCKERS before flipping `PURCHASES_ENABLED=true`:
 * - iap-001: remove hardcoded fallback prices and gate CTA on runtime StoreKit `priceString`.
 * - iap-002: make restore path return real status/error (do not always show success).
 */
export { configurePurchases } from './client';
export {
  FOUNDERS_PRODUCT,
  PRO_PRODUCT,
  FOUNDERS_OFFERING_ID,
  PRO_OFFERING_ID,
  ENTITLEMENT_TO_TIER,
  resolveTier,
  isFoundersWindowOpen,
  foundersWindowRemainingMs,
} from './products';
export type { EntitlementTier, PurchaseResult, OneTimeProductMeta } from './types';
