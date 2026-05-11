# IAP Grandfathering Posture

> **Audience:** engineering and product. Read before making any change that moves features behind a paywall.
>
> **Last updated:** 2026-05-10 (v0.9.0 launch baseline)

---

## 1. What is currently free in v0.9.x — the contractual floor

Everything below is available to every user with zero IAP in v0.9.x. This list is the baseline that must remain free for any user who downloaded v0.9.x, even after paid tiers are introduced.

| Feature | Status |
|---|---|
| Connect to any number of OpenClaw gateways | Free |
| Send/receive chat messages, streaming, tool calls | Free |
| Attachments, voice input | Free |
| Sessions, agents, models — full access | Free |
| Multiple saved server profiles | Free |
| Slash command palette | Free |
| Theme toggle (dark/light) | Free |
| Account sign-in (Supabase) | Free |
| Free-tier badges: chatterbox (t0–t1), streakKeeper (t0–t1), sessionBuilder (t0), firstWords, nightOwl | Free forever |
| Easter-egg badges: konamiCode, betaTester, witchingHour, foundTheDragon | Free forever |

**Rule:** adding a paywall that removes any row from this table for an existing v0.9.x downloader is an App Store rejection risk (Guideline 3.1.2 / 3.1.5). Don't do it.

---

## 2. What we are protected from — badges specifically

All pro-tier and Founders badges have been gated behind `PURCHASES_ENABLED = false` since the first line of code. They have **never** been earnable in any public App Store build. Introducing a badge paywall in v1.0+ does not remove previously-free functionality; it gates content that was never reachable. The 9 free badges and 4 easter eggs listed above stay free forever.

---

## 3. Business-model questions — direct answers

### Can we change the App Store download price from free to paid in v1.0+?

Yes. Apple allows price changes at any time via App Store Connect. The change applies only to new downloaders. Existing v0.9.x users retain their free copy and can re-download via Purchase History tied to their Apple ID forever. No in-app code change needed.

### Can we introduce a free trial + one-time IAP unlock for premium features?

Yes, with one hard constraint.

**IAP patterns Apple supports:**
- Non-consumable IAP for a permanent unlock (cleanest for "buy once, use forever")
- Auto-renewable subscription with a free intro period (required if you want recurring revenue)

**The constraint:** anything free in v0.9.x must stay free for v0.9.x users in v1.0+. Paywalling "send messages" or "connect to a gateway" for existing downloaders is a rejection risk. Two safe paths:

1. **Easiest:** put the paywall only on net-new features added in v1.0+ (e.g. cloud sync, push notifications, voice TTS, encrypted chat cache, advanced agents). The v0.9 free surface never shrinks.

2. **Belt-and-braces (already implemented):** the v0.x grandfather entitlement (see §4) automatically grants `pro` to any Apple ID that first downloaded a v0.x build, once `PURCHASES_ENABLED` is flipped on. This means you can safely paywall core features in v1.0+ without worrying about which users downloaded v0.9 — they're automatically covered.

---

## 4. The receipt-based v0.x grandfather entitlement

### How it works

Apple's App Store receipt contains an `originalApplicationVersion` field: the first version of the app ever downloaded by this Apple ID. It persists across reinstalls, device upgrades, and restores — anything tied to the same Apple ID.

`PurchasesContext` now reads this field via RevenueCat's `CustomerInfo.originalApplicationVersion` and exposes `isV0Grandfather: boolean` on the context. The value is `true` when the field starts with `"0"` (i.e. any v0.x build). `useEntitlements()` in `src/badges/hooks.ts` folds this into the effective badge tier:

```
if (PURCHASES_ENABLED && baseTier === 'free' && isV0Grandfather) → 'pro'
```

**Today (`PURCHASES_ENABLED = false`):** the grandfather signal is a dead code path — everyone resolves to `free`. No user-visible effect.

**When `PURCHASES_ENABLED` is flipped on:** every Apple ID that first downloaded a v0.x build silently inherits `pro`-level badge access without any purchase or user action.

### Caveats

- **TestFlight / sandbox always returns `"1.0"`** for `originalApplicationVersion`, regardless of the actual installed version. The grandfather flag is only meaningful on public App Store receipts. For local testing, mock `originalApplicationVersion` in the RevenueCat dev environment or add a debug override.
- **Receipt may be absent on the very first launch** before the App Store delivers it. `isV0Grandfather` starts `false` and updates asynchronously via `addCustomerInfoUpdateListener`. Do not gate synchronous UI on this value.
- **Grandfathers get `pro`, not `founder`.** Founders Edition is a separate purchase product with its own limited-window semantics. No grandfather entitlement unlocks Founders badges.
- **Grandfathering covers badge access.** Whether grandfathers also get future paid app features (cloud sync, push, etc.) is a product decision to make when those features ship. The `pro` tier is the current signal — expand its scope as needed.

### Privacy and tracking analysis

- **Not tracking.** Apple's ATT definition of "tracking" is linking your data with *other companies'* apps for advertising or sharing with data brokers. Reading `originalApplicationVersion` is first-party data used solely for your own entitlement logic. No ATT prompt required.
- **No new privacy manifest disclosure.** RevenueCat's bundled `PrivacyManifest.xcprivacy` already covers App Store receipt access. `ios/ClawBoy/PrivacyInfo.xcprivacy` does not need updating.
- **No new privacy policy clause.** No new category of data is collected. The receipt field is already implicit in "account and app usage data" clauses. Verify on the next scheduled privacy policy update; no urgent revision needed.

---

## 5. Before submitting v0.9 to App Store Connect

- [ ] Confirm the §1 feature inventory matches the submitted build — do a final pass if any last-minute features were added or removed.
- [ ] Ensure all locked-state UI is honest: `?` for pro-locked, 🔒 for founders-locked. No copy that promises "free if you do X."
- [ ] Do not use "free forever" in App Store metadata, App Store description, or in-app copy — preserve future pricing flexibility.
- [ ] Audit all in-app text mentioning "Pro" or "Founders" — none of it should promise pricing. The "coming soon" copy is safe.
- [ ] Decide positioning: is v0.9 a full soft-launch with the same feature surface as v1.0, or a pre-1.0 with intentionally reduced functionality? Document the answer here before submission.

---

## 6. Optional: server-side grandfather authority

The receipt-based approach is sufficient for the v0.9 → v1.0 grandfathering use case. If you later need cross-device authority for the grandfather flag (e.g. to display entitlement state on a web dashboard, or to grant access on platforms without a receipt), add a `first_seen_version` column to the Supabase `profiles` table and capture it on first sign-in.

The local signal `distinctBuildVersionsSeen.some(v => v.startsWith('0'))` in the badge counters is already a perfect candidate — but it lives in `AsyncStorage` only and is not suitable as a trusted entitlement source on its own. File as a separate plan when needed.
