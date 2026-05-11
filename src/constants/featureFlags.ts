/**
 * App-wide feature flags. Toggle these to enable/disable major surfaces
 * without ripping code out. Keep them as plain `const` so the bundler
 * dead-code-eliminates the disabled branches in production builds.
 */

import { APP_REGION } from '@/constants/region';

/**
 * RevenueCat IAP + Founders Edition / Pro purchase UI.
 *
 * When this is false (v0.9.x launch): all purchase CTAs are replaced with
 * "coming soon" info cards, and the v0.x grandfather entitlement is a no-op.
 *
 * When this is true: the grandfather entitlement in useEntitlements() will
 * automatically grant 'pro' to any Apple ID whose originalApplicationVersion
 * starts with "0". See docs/iap-grandfathering.md before changing this flag.
 */
export const PURCHASES_ENABLED = false;

// ---------------------------------------------------------------------------
// Region-gated flags (China App Store readiness)
// All flags below are `true` (unrestricted) in the global build.
// A future CN build (APP_REGION === 'cn') activates PRC-compliance behavior.
// See docs/legal/cn-readiness/ for the full compliance context per flag.
// ---------------------------------------------------------------------------

/**
 * Whether users can enter arbitrary gateway URLs in the server-add flow.
 * Disabled in the CN build — only pre-approved vendored gateways are offered.
 * See docs/legal/cn-readiness/03-gateway-policy.md.
 */
export const ALLOW_CUSTOM_GATEWAY_URLS: boolean = APP_REGION !== 'cn';

/**
 * Whether Apple / Google / magic-link third-party sign-in is offered.
 * Disabled in the CN build — replaced by phone+SMS and WeChat/Alipay.
 * See docs/legal/cn-readiness/05-real-name-auth.md.
 */
export const ALLOW_THIRD_PARTY_SIGNIN: boolean = APP_REGION !== 'cn';

/**
 * Whether the real-name / phone-OTP authentication flow is shown.
 * Only active in the CN build per PRC 实名制 requirements.
 * See docs/legal/cn-readiness/05-real-name-auth.md.
 */
export const REQUIRE_REAL_NAME_AUTH: boolean = APP_REGION === 'cn';

/**
 * Whether the onMessageSegment content moderation hook runs an active filter.
 * False in the global build (no-op pass-through). True in the CN build.
 * See docs/legal/cn-readiness/04-content-moderation.md.
 */
export const ENABLE_CONTENT_MODERATION: boolean = APP_REGION === 'cn';
