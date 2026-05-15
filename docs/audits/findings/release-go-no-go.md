# Release Go / No-Go

Date: 2026-05-12  
Errata: 2026-05-13 — [IAP deferred launch — privacy alignment](#errata-2026-05-13--iap-deferred-launch-privacy-alignment)  
Status: **CONDITIONAL GO**

> Rationale (2026-05-12): one Apple-rule release blocker (`appstore-001` —
> bundled `PrivacyInfo.xcprivacy` shipped an empty
> `NSPrivacyCollectedDataTypes` array, contradicting the Connect privacy
> nutrition label). **Errata 2026-05-13:** the launch submission **does
> not** declare Purchase History in Connect or the app manifest (IAP is
> off while `PURCHASES_ENABLED` is `false`). `expo.ios.privacyManifests` in
> `app.json` now declares **Email Address** and **User ID** only, and
> `ios/ClawBoy/PrivacyInfo.xcprivacy` is updated to match. Re-run
> `npx expo prebuild --platform ios` before shipping so the gitignored
> `ios/` tree stays in sync. Remaining optional cleanup: **`appstore-002`**
> — re-export `assets/icon.png` as RGB before upload.

---

## Errata (2026-05-13) — IAP-deferred launch privacy alignment

The original X7 synthesis assumed **three** collected data types in both
App Store Connect and `PrivacyInfo.xcprivacy` (including **Purchase
History**) because IAP was treated as imminent. The product plan changed:
**the first App Store build ships with `PURCHASES_ENABLED = false`**
(RevenueCat is never configured).

Implications:

| Surface | Original X7 assumption | Launch (IAP deferred) |
|---------|------------------------|------------------------|
| Connect App Privacy | Email, User ID, Purchase History collected (when applicable) | Email + User ID only; **Purchase History → Data Not Collected** |
| `NSPrivacyCollectedDataTypes` | Three plist dict entries | **Two** entries (Email, User ID). Add Purchase History when IAP ships — see `docs/legal/iap-post-launch-checklist.md` |
| `appstore-001` | Empty manifest vs three-type label | **Resolved for launch** by `expo.ios.privacyManifests` in `app.json` + matching `PrivacyInfo.xcprivacy` |

---

## Blocker Summary (must be zero for GO)

Only `critical` or `high` items that gate the v0.9.0 submission appear
here. Feature-flag-gated and quality-only items are listed in
`X7-app-store-readiness-findings.md` §11.

| ID | Sev | Area | Summary | Status |
|----|-----|------|---------|--------|
| `appstore-001` | high | iOS privacy manifest | ~~Empty `NSPrivacyCollectedDataTypes` vs Connect.~~ **Launch path closed 2026-05-13:** `app.json` → `expo.ios.privacyManifests` declares Email + User ID; `Purchase History` removed from launch Connect expectations. Regenerate `ios/` via prebuild before archive; add third type + Connect row when enabling IAP. | resolved (launch) |

Total open **Apple-rule** blockers for the IAP-off launch: **0**.

---

## Total Severity Counts (across all 30 findings docs)

Source counts are taken from `docs/audits/README.md` and validated
against each plan's `## Severity Counts` / `## Summary` section. Where a
plan's audit doc and the README disagreed, the audit doc was treated as
authoritative.

- critical: **2** (resolved: 2 | open: 0)
- high: **23** (resolved: 15 | open: 8)
- med: **64** (resolved: ~30 | open: ~34 — see note)
- low: **121** (resolved: ~25 | open: ~96 — see note)
- nit: **78** (resolved: ~10 | open: ~68 — see note)

**Note on med/low/nit "resolved" counts:** the resolved/open split for
med/low/nit is approximate. Many findings docs do not consistently
record per-item status; the rollup above counts items explicitly marked
`fixed` (and items whose remediation is independently visible in the
working tree — e.g. `useMemo` wrappers in `AccountContext`, the new
Zod schemas module, the Wave 3 Supabase migration, the auth-callback
parser extraction). When in doubt the item is counted as `open`. None
of the open med/low/nit items individually gate the release.

### Critical (2 resolved, 0 open)

1. `20-CRITICAL-01` — `en/common.json` malformed JSON — **fixed** (plan 20).
2. `X5-test-001` — `chatCache/crypto.ts` no encryption round-trip tests
   — **resolved** (`src/lib/chatCache/__tests__/crypto.test.ts` now exists
   and passes; X5 itself recorded the gap as `proposed`).

### High (15 resolved, 7 open)

**Resolved** (15):

- `appstore-001` (X7) — privacy manifest collected-data types; **closed for IAP-off launch** 2026-05-13 via `expo.ios.privacyManifests` in `app.json` (two types; Purchase History deferred).

- `profiles-001` (plan 03) — SPKI in AsyncStorage → SecureStore migration. Fixed in X2.
- `account-001` (plan 14) — Apple Sign-In nonce. Fixed (auth.ts now uses `digestStringAsync`).
- `db-001` (plan 23) — Missing GRANTs on v2 Supabase tables. Fixed via Wave 3 migration.
- `db-002` (plan 23) — `SECURITY DEFINER` `SET search_path` missing. Fixed via Wave 3 migration.
- `20-HIGH-01` (plan 20) — `contrastForeground()` 3-digit hex bug. Fixed.
- `demo-001` (plan 16) — same `en/common.json` JSON syntax as 20-CRITICAL-01. Fixed.
- `oss-001` (X1) — `reference/` gitignore. Fixed.
- `ios-002` (plan 22) — `NSPhotoLibraryUsageDescription` copy. Fixed in `app.json`.
- `ios-003` (plan 22) — `aps-environment` push entitlement. Fixed (entitlement removed, plugin removed).
- `X2-sec-001` — WebSocket frame validation (Zod). Fixed.
- `perf-001` (X3) — `AccountContext` value `useMemo`. Fixed.
- `perf-003` (X3) — `useConnection` controller `useMemo`. Fixed.
- `X5-test-002` through `X5-test-005` and `X5-test-008` (5 highs) — test files now exist for all five modules.

**Open** (8):

- `gateway-001` (plan 01 / 21) — `expo-pinned-websocket` TypeScript types misaligned with current `expo-modules-core`. Runtime works; types are wrong. Not a Review blocker.
- `auth-001` (plan 02) — gateway-issued `deviceToken` never persisted; challenge-sign cost paid on every cold start. Perf / UX only.
- `agents-001` (plan 07) — stale-closure `setCurrentModel`. Non-fatal UX bug.
- `onboarding-001` (plan 08) — `AchievementsOptInStep.tsx` zero i18n coverage. zh-CN users see English on one step.
- `voice-002` (plan 10) — `stopSpeaking()` cannot stop server-side TTS because the one-shot `AudioPlayer` is not retained. UX bug.
- `iap-001` (plan 13) — hardcoded `$9.99` / `$19.99` price labels. **Gated** — `PURCHASES_ENABLED = false`; will become a blocker when the flag flips.
- `iap-002` (plan 13) — `restore()` swallows errors. **Gated** — same flag.
- `X5-test-010` (X5) — `openclaw/client.ts` reconnect / backoff path uncovered. Coverage gap on a forbidden file.

---

## Test Status

- Command: `npm test -- --forceExit`
- Run date: 2026-05-12
- Result: **PASS**
- Test Suites: **89 passed / 89 total**
- Tests: **1291 passed / 1291 total**
- Snapshots: **70 passed / 70 total**
- Duration: ~16 s
- Warning: one Jest force-exit (`X5-test-007`, low — timer leak in
  `openclaw-client.test.ts`). Pre-existing; does not affect correctness.

### Coverage (from X5 audit, 2026-05-12 — no fresh coverage run in X7)

- Lines: 60.55%
- Statements: 58.98%
- Functions: 52.46%
- Branches: 46.68%

Coverage is below the typical 70% / 60% bar. **Not a release blocker** —
the gaps are documented in `X5-test-coverage-findings.md`; the surfaces
that gate App Store policy (purchases, auth, secure storage) all have
either targeted unit tests or end-to-end coverage via the openclaw
client suite.

---

## App Store Requirements

| Requirement | Status | Notes |
|-------------|--------|-------|
| Privacy manifest present | **PRESENT** | `ios/ClawBoy/PrivacyInfo.xcprivacy` exists |
| Privacy manifest complete (`NSPrivacyCollectedDataTypes`) | **YES** (launch) | Two types (Email, User ID) via `app.json` `expo.ios.privacyManifests`; add Purchase History when IAP ships |
| `NSPrivacyTracking` correctly set | YES | `false` |
| `NSPrivacyAccessedAPITypes` complete | YES | 4 categories, all reason codes valid |
| All permissions described | YES | Camera, Microphone, Photo Library (read), Photo Library (add), Speech Recognition |
| All permission strings natural-language | YES | No `$(PRODUCT_NAME)` placeholders |
| All permissions exercised by code | YES | No claimed-but-unused capabilities |
| Push entitlement removed | YES | `aps-environment` deleted; `expo-notifications` plugin removed |
| App Transport Security | YES | `NSAllowsArbitraryLoads = false`; `NSAllowsLocalNetworking = true` justified |
| Export compliance: `ITSAppUsesNonExemptEncryption = NO`, justified | YES | TLS + Ed25519 + AES-256-GCM all exempt per EAR §740.17(b)(1); documented in `docs/legal/export-compliance.md` |
| IAP "Restore Purchases" path present | PRESENT | `PurchasesContext.restore()` exists; UI gated by `PURCHASES_ENABLED = false` (Apple does not require visible restore while IAP is hidden) |
| No hardcoded prices visible to user | YES (today) | `iap-001` exists but gated by `PURCHASES_ENABLED` |
| Subscription terms displayed | N/A this build | No purchase UI shipping |
| Privacy policy URL ready | READY (in repo) / NEEDS SETUP (in App Store Connect) | `docs/legal/privacy-policy.md` exists; URL must be set in Connect → App Information |
| Account-deletion path | PRESENT | Settings → Account → Delete Account (documented in Review Notes) |
| Demo mode for reviewer (no gateway required) | PRESENT | `docs/legal/app-review-notes.md` documents the demo-mode review path |
| App icon dimensions | 1024 × 1024 | ✅ |
| App icon transparency | RGBA with all-α=255 (effectively opaque) | ⚠️ recommend re-export as RGB — see `appstore-002` |
| Splash background matches forced color scheme | YES | `#0B0F18` dark, matches `userInterfaceStyle: "dark"` |
| EAS build profile complete | YES | `production` profile present in `eas.json`; explicit `distribution: "store"` recommended (`appstore-004`) |
| EAS submit profile complete | YES | `ascApiKeyPath` via `$EAS_ASC_API_KEY_PATH` env-var indirection |
| Bundle identifier set | YES | `com.sundaysoftworks.clawboy` |
| Apple Team ID | `7GLMG5N9K8` (public, in `eas.json`) | ✅ |
| App Store Connect app ID | `6766195705` (in `eas.json`) | ✅ |
| Code-signing certificate for OTA updates | PRESENT | `certs/certificate.pem` committed; `certs/private-key.pem` correctly gitignored |
| OTA update channel | `production` | ✅ |
| Runtime version policy | `appVersion` | ✅ correct rollback boundary |

---

## Recommended Fix Order (before TestFlight build)

The list is intentionally short — only the items that block submission
or are trivial cleanups worth landing in the same pass.

1. **`appstore-001` — Privacy manifest** (**resolved for IAP-off launch**, 2026-05-13)
   - Source of truth: `app.json` → `expo.ios.privacyManifests` (includes
     required-reason APIs + **two** collected types for launch).
   - Before `eas build`, run `npx expo prebuild --platform ios` so the
     gitignored `ios/` tree matches config (or rely on EAS remote build
     prebuild).
   - **When enabling IAP:** add `NSPrivacyCollectedDataTypePurchaseHistory`
     to the same block and update Connect — see
     `docs/legal/iap-post-launch-checklist.md`.
2. **`appstore-002` — Icon RGB re-export** (low, recommended)
   - `sips -s format png -s formatOptions normal --setProperty hasAlpha no assets/icon.png --out assets/icon.png`
   - Verify `python3 -c "from PIL import Image; print(Image.open('assets/icon.png').mode)"` prints `RGB`.
3. **App Store Connect setup** (config-only, no code change)
   - Set Privacy Policy URL in App Store Connect → App Information.
   - Set the Connect privacy nutrition label per
     `docs/legal/app-store-privacy-labels.md` (**launch** = Email + User ID
     only; Purchase History **not** collected).
   - Paste `docs/legal/app-review-notes.md` Review Notes block into
     App Review Information.
   - Confirm `EAS_ASC_API_KEY_PATH` is set in the submission environment.
4. **`appstore-004` — Explicit `distribution: "store"` and `credentialsSource: "remote"`** (low, optional)
   - Cosmetic; the defaults work, but explicit is clearer.
5. **(Optional)** Re-run `npm test` once more right before
   `eas build --platform ios --profile production` to confirm a clean
   slate.

The build itself (`eas build --platform ios --profile production`) is
**not** in scope for this audit; the audit only validates that the
build can be produced from a complete config.

---

## Open Deferrals

Items the team has explicitly chosen not to fix for this submission.
None of them gate Apple Review for v0.9.0.

| ID | Sev | Reason | Owner |
|----|-----|--------|-------|
| `iap-001` | high | UI gated by `PURCHASES_ENABLED = false` — does not ship to App Review. Becomes a blocker the moment the flag flips. | Owner (purchases) |
| `iap-002` | high | Same gating as `iap-001`. | Owner (purchases) |
| `appstore-003` | med | RevenueCat Test Store keys (`test_…`) in `app.json` — acceptable while `PURCHASES_ENABLED = false`. Swap to `appl_…` / `goog_…` before first IAP-enabled submission. | Owner (purchases) |
| `gateway-001` | high | TypeScript-types-only drift in `expo-pinned-websocket`. Native runtime contract unchanged. File is in `_RULES.md` forbidden list. | Owner (native module / plan 21) |
| `auth-001` | high | `deviceToken` persistence not wired; only impact is a per-cold-start challenge-sign. File is `_RULES.md` absolutely-forbidden (`device-identity.ts`). | Owner (auth) |
| `agents-001` | high | Stale-closure `setCurrentModel` — non-fatal UX bug. | Owner (agents/models) |
| `onboarding-001` | high | `AchievementsOptInStep.tsx` i18n missing — zh-CN users see English on one onboarding step. | Owner (onboarding / i18n) |
| `voice-002` | high | Server TTS one-shot player cannot be stopped. UX defect, not a Review blocker. | Owner (voice) |
| `X5-test-010` | high | `openclaw/client.ts` reconnect/backoff path coverage. File on absolutely-forbidden list — flag only. | Owner (gateway) |
| `X4-deps-001` | med | `markdown-it` ReDoS (GHSA-38c4-r59v-3vqw) — no upstream fix in `@ronradtke/react-native-markdown-display`. Monitor; vendor only if a malicious-markdown scenario emerges before a release fix lands. | Owner (deps) |
| Various low / nit items across plans 01–23 | low / nit | Cosmetic, perf, OSS-readiness improvements; none gate review. | Owners per plan |
