/**
 * App-wide feature flags. Toggle these to enable/disable major surfaces
 * without ripping code out. Keep them as plain `const` so the bundler
 * dead-code-eliminates the disabled branches in production builds.
 */

/** RevenueCat IAP + Founders Edition / Pro purchase UI. */
export const PURCHASES_ENABLED = false;
