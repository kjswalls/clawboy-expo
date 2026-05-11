/**
 * Build-time region identifier.
 *
 * Set via the EAS build environment variable `EXPO_PUBLIC_REGION`:
 *   - Unset or 'global' → global (U.S. / international) build. Default.
 *   - 'cn' → mainland China build. Activates PRC-compliance feature flags.
 *
 * Usage:
 *   import { APP_REGION } from '@/constants/region';
 *   if (APP_REGION === 'cn') { ... }
 *
 * All region-gated feature flag values live in `src/constants/featureFlags.ts`.
 * Do not scatter raw APP_REGION checks across the codebase — prefer the flags.
 */

export type AppRegion = 'global' | 'cn';

/**
 * The build region, derived from `EXPO_PUBLIC_REGION` at bundle time.
 * Bundler dead-code-eliminates branches for the non-active region.
 */
export const APP_REGION: AppRegion =
  (process.env.EXPO_PUBLIC_REGION as AppRegion | undefined) === 'cn' ? 'cn' : 'global';
