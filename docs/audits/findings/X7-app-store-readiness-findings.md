# X7 — App Store Readiness: Findings

**Audit plan:** `docs/audits/X7-app-store-readiness.md`
**Date:** 2026-05-12
**Auditor:** agent (Opus tier — final go/no-go synthesis)
**Status:** complete
**Finding ID prefix:** `appstore-NNN`

---

## 0. Executive Summary

This is the final cross-cutting audit. It synthesises plans 01–23 and X1–X6,
re-validates the App Store submission checklist against the as-built
configuration, and produces the release go/no-go determination in
`release-go-no-go.md`.

Headline outcome: **NO-GO for App Store submission** until one high-severity
release blocker is closed and one configuration-durability question is
answered (see `appstore-001` and the open-blocker table in §11).

The blocker is the bundled Apple Privacy Manifest at
`ios/ClawBoy/PrivacyInfo.xcprivacy`. Plan 22 finding `ios-001` was marked
`fixed — native rebuild required`, but the file in the working tree still
ships an empty `<key>NSPrivacyCollectedDataTypes</key><array/>`. Since the
entire `/ios` directory is gitignored, the source-of-truth for what the next
`expo prebuild` will produce is ambiguous: `app.json` does not declare
`expo.ios.privacyManifests`, and there is no config-plugin in
`scripts/` that augments the manifest. The current Connect privacy label
(`docs/legal/app-store-privacy-labels.md`) declares Email Address,
User ID, and Purchase History as collected/linked — the bundled
`PrivacyInfo.xcprivacy` must match, or App Store Review will flag the
discrepancy.

Aside from that, the configuration is in submission shape:

- **Permission strings**: all five iOS usage descriptions present in both
  `app.json` and `ios/ClawBoy/Info.plist`, written in natural language with
  no placeholders. The previous `NSPhotoLibraryUsageDescription` /
  `NSPhotoLibraryAddUsageDescription` confusion (`ios-002`) is resolved
  in `app.json` and matches `Info.plist`.
- **Push entitlement** (`ios-003`): `aps-environment` removed from
  `ios/ClawBoy/ClawBoy.entitlements`; `expo-notifications` plugin not
  present in `app.json`. Apple §5.1.5 risk eliminated.
- **App Transport Security**: `NSAllowsArbitraryLoads = false`,
  `NSAllowsLocalNetworking = true` — strict ATS, with LAN gateway support
  preserved. Correct.
- **Export Compliance**: `ITSAppUsesNonExemptEncryption = false` is correct;
  TLS + Ed25519 signing + AES-256-GCM at-rest cache are all exempt per
  EAR §740.17(b)(1). Documented in `docs/legal/export-compliance.md`.
- **EAS submit config**: `ascApiKeyPath` now uses the
  `$EAS_ASC_API_KEY_PATH` environment indirection (`ios-004` remediated),
  no personal home-directory paths committed.
- **Splash background** (`ios-008`): app.json `splash.backgroundColor`
  flipped to `#0B0F18` (dark) — matches the forced-dark `userInterfaceStyle`.
- **App icon (`assets/icon.png`)**: 1024×1024, RGB(A) with all alpha = 255
  (effectively opaque). See `appstore-002` for the alpha-channel nuance —
  it is a low-risk App Store Connect upload concern, not a Review blocker.
- **Privacy policy + Review Notes + Privacy Labels**: all three legal docs
  exist (`docs/legal/privacy-policy.md`, `app-review-notes.md`,
  `app-store-privacy-labels.md`) and are internally consistent.
- **IAP (purchases)**: the entire IAP UI is gated behind
  `PURCHASES_ENABLED = false` (`src/constants/featureFlags.ts`), so the
  two open high IAP findings (`iap-001` hardcoded prices, `iap-002`
  restore swallowing errors) do not ship in this submission. They become
  blockers the moment `PURCHASES_ENABLED` flips to `true`.
- **Tests**: 89 suites, 1291 tests, 70 snapshots — all pass (`npm test`).

Apart from `appstore-001` (privacy manifest durability) and
`appstore-002` (icon alpha-channel hygiene), every other release-readiness
gate is green for this submission.

---

## 1. Severity Counts

This plan's own findings (newly identified by X7):

- critical: 0
- high: 1
- med: 1
- low: 2
- nit: 1

For the cross-plan totals (across all 29 prior findings docs and X7
itself), see `release-go-no-go.md`.

---

## 2. Privacy Manifest Completeness Table

Source file: `ios/ClawBoy/PrivacyInfo.xcprivacy` (gitignored — regenerated
by `expo prebuild`).

| Key | Required | Present | Value | Verdict |
|-----|----------|---------|-------|---------|
| `NSPrivacyTracking` | yes | ✅ | `false` | ✅ correct (no IDFA, no ad tracking) |
| `NSPrivacyTrackingDomains` | only if `NSPrivacyTracking = true` | ❌ absent | — | ✅ correct (omissible when tracking is false) |
| `NSPrivacyCollectedDataTypes` | yes | ⚠️ present but **empty** (`<array/>`) | — | ❌ **inconsistent with App Store Connect privacy label** — see `appstore-001` |
| `NSPrivacyAccessedAPITypes` | yes | ✅ four categories declared | `FileTimestamp` / `UserDefaults` / `SystemBootTime` / `DiskSpace` with valid reason codes | ✅ reason codes all on Apple's current allow-list |

### Required-Reason API entries

| Category | Reason codes | Justification |
|----------|--------------|---------------|
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `C617.1`, `0A2A.1`, `3B52.1` | React Native / Expo file-system metadata access |
| `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` | `AsyncStorage` (backed by `NSUserDefaults`) |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `35F9.1` | RN core / Hermes runtime perf measurements |
| `NSPrivacyAccessedAPICategoryDiskSpace` | `E174.1`, `85F4.1` | `expo-image` cache / `expo-media-library` |

All reason codes are valid per Apple's
[Required Reason API list](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_use_of_required_reason_api).
**Note:** completeness also depends on
`apple.privacyManifestAggregationEnabled = true` in
`ios/Podfile.properties.json` correctly merging third-party CocoaPod
manifests at build time. That aggregation cannot be validated from a
read-only audit; defer to a TestFlight build inspection.

### Expected `NSPrivacyCollectedDataTypes` (must match Connect label)

Per `docs/legal/app-store-privacy-labels.md` (lines 117–141), the bundled
manifest **should** declare:

| Apple data type | Linked? | Tracking? | Purpose |
|-----------------|---------|-----------|---------|
| `NSPrivacyCollectedDataTypeEmailAddress` | yes | no | `NSPrivacyCollectedDataTypePurposeAppFunctionality` |
| `NSPrivacyCollectedDataTypeUserID` | yes | no | `NSPrivacyCollectedDataTypePurposeAppFunctionality` |
| `NSPrivacyCollectedDataTypePurchaseHistory` | yes | no | `NSPrivacyCollectedDataTypePurposeAppFunctionality` |

Today the array is empty. **This is the single release blocker** — see
`appstore-001`.

---

## 3. Permission Strings Table

Source: `app.json` (lines 35–39, 73–74, 84–85, 91–94) and
`ios/ClawBoy/Info.plist` (lines 57–66). All strings are first-person,
ClawBoy-branded, and natural language. No `$(PRODUCT_NAME)` placeholder
strings remain (the prior `NSFaceIDUsageDescription` placeholder was
suppressed via `expo-secure-store` plugin `faceIDPermission: false`).

| Permission key | In `app.json` `infoPlist` | In plugin block | In `Info.plist` | Match? | Verdict |
|----------------|---------------------------|------------------|------------------|--------|---------|
| `NSCameraUsageDescription` | ✅ ("…send to your gateway.") | ✅ (expo-image-picker `cameraPermission`) | ✅ | wording matches | ✅ |
| `NSMicrophoneUsageDescription` | ✅ | ✅ (expo-speech-recognition) | ✅ | matches | ✅ |
| `NSSpeechRecognitionUsageDescription` | ✅ | ✅ (expo-speech-recognition) | ✅ | matches | ✅ |
| `NSPhotoLibraryUsageDescription` | ✅ (read-access copy) | ✅ (expo-image-picker `photosPermission`) | ✅ | matches | ✅ — `ios-002` resolved |
| `NSPhotoLibraryAddUsageDescription` | ✅ (save copy) | ✅ (expo-media-library `savePhotosPermission`) | ✅ | matches | ✅ |
| `NSFaceIDUsageDescription` | ❌ (not declared) | suppressed via `expo-secure-store` `faceIDPermission: false` | ❌ (absent) | n/a | ✅ — `ios-006` resolved |
| `NSContactsUsageDescription` | not used | — | not present | n/a | ✅ (correctly absent) |
| `NSLocationWhenInUseUsageDescription` | not used | — | not present | n/a | ✅ |
| `NSCalendarsUsageDescription` | not used | — | not present | n/a | ✅ |

### Permission-to-feature mapping (live in MVP today)

| Permission | Feature in source | File reference |
|------------|--------------------|----------------|
| Camera | Attachment picker — camera entry | `src/components/input/useAttachmentPicker.ts` |
| Photo library (read) | Attachment picker — photo/video pick | `src/components/input/useAttachmentPicker.ts` |
| Photo library (add) | "Save media" action on inbound media | `src/lib/media/mediaActions.ts` |
| Microphone | Voice-note recording (`expo-speech-recognition`) | `src/lib/voice/recordSpeech.ts` |
| Speech Recognition | On-device transcription for models without audio input | `src/lib/voice/recordSpeech.ts` |

All permissions are exercised by live code. No "claimed-but-unused" §5.1.5
risks remaining.

---

## 4. Asset Checklist Table

| Asset | Required | Present | Pixel dimensions | Color mode | Alpha | Verdict |
|-------|----------|---------|------------------|------------|-------|---------|
| `assets/icon.png` | yes (iOS marketing icon) | ✅ | 1024 × 1024 | RGBA | all α=255 (effectively opaque) | ⚠️ see `appstore-002` |
| `assets/adaptive-icon.png` | yes (Android adaptive foreground) | ✅ | 1024 × 1024 | RGBA | true transparency present | ✅ correct (Android adaptive layer expects alpha) |
| `assets/splash-icon.png` | yes (Expo splash) | ✅ | 1024 × 1024 | RGBA | true transparency present | ✅ correct (splash overlay on solid dark bg) |
| `assets/favicon.png` | web only | ✅ | 48 × 48 | LA (grayscale + alpha) | n/a | ✅ acceptable for web target |
| `assets/brand/icon-options/` | optional design library | ✅ | various | SVG vectors | n/a | ✅ working set; not bundled |
| Placeholder / "TODO" assets | none allowed | n/a | — | — | — | ✅ none observed |

### Splash configuration

`app.json` (lines 23–27):

```jsonc
"splash": {
  "image": "./assets/splash-icon.png",
  "resizeMode": "contain",
  "backgroundColor": "#0B0F18"
}
```

`backgroundColor` is dark and matches the forced-dark `userInterfaceStyle`.
The prior `ios-008` mismatch (`#FFFFFF` background on a dark-mode app) is
resolved.

---

## 5. EAS Config Status Table

Source: `eas.json` and `app.json`.

### `app.json` release-relevant keys

| Field | Value | Verdict |
|-------|-------|---------|
| `expo.name` | `"ClawBoy"` | ✅ |
| `expo.slug` | `"clawboy"` | ✅ |
| `expo.scheme` | `"clawboy"` | ✅ matches Supabase magic-link callback (`clawboy://auth-callback`) and Info.plist `CFBundleURLSchemes` |
| `expo.version` | `"0.9.0"` | ✅ matches Info.plist `CFBundleShortVersionString` and `Expo.plist` `EXUpdatesRuntimeVersion` |
| `expo.runtimeVersion.policy` | `"appVersion"` | ✅ correct rollback boundary (see plan 17 ota-008) |
| `expo.updates.url` | `https://u.expo.dev/3574328d-7de7-44a4-b220-74d7fb28a903` | ✅ |
| `expo.updates.checkAutomatically` | `"NEVER"` | ✅ post-`sec-009` fix — single update-check driver is `useOTAUpdate` |
| `expo.updates.fallbackToCacheTimeout` | `0` | ✅ |
| `expo.updates.codeSigningCertificate` | `"./certs/certificate.pem"` | ✅ committed; private key is in `certs/private-key.pem` and gitignored |
| `expo.updates.codeSigningMetadata.alg` | `"rsa-v1_5-sha256"` | ✅ only alg `expo-updates` accepts |
| `expo.ios.bundleIdentifier` | `"com.sundaysoftworks.clawboy"` | ✅ |
| `expo.ios.supportsTablet` | `true` | ✅ |
| `expo.ios.infoPlist.ITSAppUsesNonExemptEncryption` | `false` | ✅ correct — TLS + Ed25519 + AES-GCM all exempt under EAR §740.17(b)(1) |
| `expo.android.package` | `"com.sundaysoftworks.clawboy"` | ✅ (Android not in scope this submission but matches iOS) |
| `expo.extra.feedbackProxyUrl` | https://clawboy-feedback-worker.sundaysoftworks.workers.dev | ✅ production worker |
| `expo.extra.supabaseUrl` / `supabaseAnonKey` | sb_publishable_… | ✅ public-by-design |
| `expo.extra.revenueCatApiKey{Ios,Android}` | `"test_…"` (RC Test Store) | ⚠️ swap to `appl_…` / `goog_…` when `PURCHASES_ENABLED` flips — see `appstore-003` |
| `expo.extra.eas.projectId` | `3574328d-…` | ✅ |

### `eas.json` build profiles

| Profile | `distribution` | `channel` | iOS `buildConfiguration` | Verdict |
|---------|----------------|-----------|---------------------------|---------|
| `development` | `internal` | `development` | (dev-client, simulator: true) | ✅ |
| `preview` | `internal` | `preview` | `Release` | ✅ |
| `production` | default → `store` | `production` | `Release` | ⚠️ `distribution: "store"` is not declared explicitly; Expo default applies but explicit is clearer — see `appstore-004` |

### `eas.json` submit profile

| Field | Value | Verdict |
|-------|-------|---------|
| `submit.production.ios.appleTeamId` | `7GLMG5N9K8` | ✅ (public identifier) |
| `submit.production.ios.ascAppId` | `6766195705` | ✅ (public identifier) |
| `submit.production.ios.ascApiKeyPath` | `$EAS_ASC_API_KEY_PATH` env-var indirection | ✅ post-`ios-004` fix |
| `submit.production.ios.ascApiKeyId` | `X67X7737ZG` | ✅ (public identifier) |
| `submit.production.ios.ascApiKeyIssuerId` | `1f444654-…` | ✅ (public identifier) |
| `cli.appVersionSource` | `"remote"` | ✅ CFBundleVersion managed by EAS — see `ios-014` |
| `cli.version` | `">= 12.0.0"` | ✅ |
| `submit.production.ios.credentialsSource` | not set (defaults to `remote`) | ⚠️ explicit declaration recommended — see `appstore-004` |

---

## 6. App Transport Security & Encryption

| Check | Value | Verdict |
|-------|-------|---------|
| `NSAllowsArbitraryLoads` | `false` | ✅ strict ATS |
| `NSAllowsLocalNetworking` | `true` | ✅ justified (LAN gateway support) |
| `ITSAppUsesNonExemptEncryption` | `false` (Info.plist and `app.json`) | ✅ |
| Encryption justification documented | `docs/legal/export-compliance.md` | ✅ matches Apple §EAR §740.17(b)(1) |

The only uses of encryption are:

1. **TLS / HTTPS** — OS-provided, public-domain (exempt).
2. **Ed25519 device authentication signing** — authentication use only,
   private key never leaves the device (exempt under §740.17(a)).
3. **AES-256-GCM at-rest cache encryption** — `src/lib/chatCache/crypto.ts`,
   key in iOS Keychain via `expo-secure-store` (exempt — device data
   protection only, no encrypted data leaves the device).

All three are documented in `docs/legal/export-compliance.md` and
`docs/legal/app-review-notes.md`.

---

## 7. Privacy Policy & Legal Doc Consistency

| Doc | Present | Internally consistent with code? |
|-----|---------|----------------------------------|
| `docs/legal/privacy-policy.md` | ✅ effective May 1, 2026 | ✅ describes the data flows that match `X2-security-sweep-findings.md` §1 |
| `docs/legal/app-store-privacy-labels.md` | ✅ | ✅ declares Email, User ID, Purchase History as the three collected types — drives the expected manifest entries in §2 |
| `docs/legal/app-review-notes.md` | ✅ | ✅ documents the demo-mode review path, ITSApp encryption answer, account-deletion path |
| `docs/legal/export-compliance.md` | ✅ | ✅ matches `ITSAppUsesNonExemptEncryption = false` |
| `docs/legal/terms.md` | ✅ | not exercised in code; legal-only |
| Privacy policy URL hosted publicly | not in this audit's scope | ⚠️ must be set in App Store Connect → App Information → Privacy Policy URL before submission |

Note: the App Store Connect privacy policy URL is configured in App Store
Connect, not in the app bundle. Confirm before tapping Submit for Review.

---

## 8. IAP Compliance (cross-check with plan 13)

`src/constants/featureFlags.ts` exports `PURCHASES_ENABLED = false`. The
entire IAP UI (`SettingsEditionSection`, founders countdown, restore
button) renders a "Coming soon" gate when the flag is off
(`PurchasesContext` returns the disabled stub).

Result: the two open high IAP findings — `iap-001` (hardcoded `$9.99` /
`$19.99` price labels) and `iap-002` (restore swallows errors) — **do not
ship to App Review in this build** because the UI never renders. The
StoreKit hooks are configured (test keys are wired) but no purchase or
restore can be initiated by the user.

Implications:
- For the v0.9.0 / build 1 submission: **IAP findings are NOT release
  blockers**.
- For any subsequent submission that flips `PURCHASES_ENABLED` to `true`:
  `iap-001` and `iap-002` become hard blockers (App Store §3.1.1 / §3.1.2)
  and the test RevenueCat keys (`test_…`) must also be swapped to
  production (`appl_…` / `goog_…`) — see `appstore-003`.

The Apple-required "Restore Purchases" path is implemented in
`src/contexts/PurchasesContext.tsx` `restore()` and surfaced via
`SettingsEditionSection`. The UI element is hidden today (feature flag),
but the call path is present and will activate the moment the flag flips.
This is acceptable per Apple — review only requires a Restore path to be
accessible when the IAP UI is live.

---

## 9. TestFlight Pre-Check

| Check | Result | Reference |
|-------|--------|-----------|
| All `critical` findings (across plans 01–23 and X1–X6) resolved or deferred | ✅ both critical (`20-CRITICAL-01` JSON syntax, `X5-test-001` chatCache crypto tests) are **resolved** | §11 |
| All `high` security findings resolved or deferred | ✅ all six high security findings resolved (`profiles-001`, `account-001`, `db-001`, `db-002`, `oss-001`, `X2-sec-001`) | §11 |
| All `high` IAP findings resolved or deferred | ⚠️ `iap-001` / `iap-002` deferred; ✅ acceptable while `PURCHASES_ENABLED = false` | §8 |
| All `high` privacy/manifest findings resolved | ❌ **`ios-001` open** — see `appstore-001` | §11 |
| `npm test` passes | ✅ 89 suites / 1291 tests / 70 snapshots — all pass | §12 |
| `eas build` config complete | ✅ build profiles defined; submit profile configured | §5 |
| Privacy policy URL ready for App Store Connect | ✅ doc exists; URL must be set in Connect | §7 |
| Review Notes prepared | ✅ `docs/legal/app-review-notes.md` ready to paste into Connect | §7 |

---

## 10. New Findings (X7)

### appstore-001 · high · `ios/ClawBoy/PrivacyInfo.xcprivacy` — empty `NSPrivacyCollectedDataTypes` blocks Apple privacy-manifest compliance

**Severity:** high
**Status:** proposed
**File(s):** `ios/ClawBoy/PrivacyInfo.xcprivacy` (lines 43–44); cross-ref `docs/audits/findings/22-ios-native-config-findings.md` (`ios-001`, claimed `fixed — native rebuild required`)

**Observation:**
- Plan 22's `ios-001` finding (high) was recorded as `fixed`. The fix
  proposed adding three `NSPrivacyCollectedDataTypes` dict entries
  (Email Address, User ID, Purchase History — all linked, non-tracking,
  App Functionality).
- The current `ios/ClawBoy/PrivacyInfo.xcprivacy` in the working tree
  ships **empty** (`<key>NSPrivacyCollectedDataTypes</key><array/>`).
- The entire `/ios` directory is gitignored (`.gitignore` line 1
  declares `/ios`). The source-of-truth for what `expo prebuild`
  regenerates is therefore either (a) the `app.json` config plus plugins,
  (b) a custom config plugin script, or (c) the gitignored file itself.
- `app.json` does not declare `expo.ios.privacyManifests` (verified via
  `Read` — the closest keys are `expo.ios.infoPlist` and the plugins
  array; neither sets a privacy manifest).
- There is no config-plugin in `scripts/` or `plugins/` that augments
  `PrivacyInfo.xcprivacy` (verified via Grep across non-`ios/` paths).

**Why this is a release blocker:**
- Apple's Privacy Manifest rules (required since 2024-05-01) say the
  app's own bundled `PrivacyInfo.xcprivacy` must declare data types the
  app's code collects. ClawBoy collects Email Address (Supabase auth),
  User ID (Supabase UUID + RevenueCat anon ID), and — once
  `PURCHASES_ENABLED` flips — Purchase History.
- `docs/legal/app-store-privacy-labels.md` (lines 117–141) already
  declares these three types as collected/linked. Apple cross-checks the
  Connect privacy nutrition label against the bundled manifest; an
  empty manifest with a non-empty Connect label is a known rejection
  trigger.
- Aggregation from third-party CocoaPods (`apple.privacyManifestAggregationEnabled = true` in `ios/Podfile.properties.json`) does **not** absolve the app's own bundled manifest from declaring what the app's own code sends off-device.

**Proposed fix** (do not apply — `/ios` is forbidden to this audit):
1. **Recommended path:** make the bundled `PrivacyInfo.xcprivacy`
   durable by either:
   - Committing the file (remove `/ios` from `.gitignore` for this single
     path via `!ios/ClawBoy/PrivacyInfo.xcprivacy`), **and** populating
     the three `NSPrivacyCollectedDataTypes` entries listed in §2.
   - Or, write an Expo config plugin (`plugins/withPrivacyManifest.js`)
     that injects the three entries into `PrivacyInfo.xcprivacy` during
     `expo prebuild`, and register it in `app.json` plugins. This is the
     pattern recommended by Expo for projects using CNG (Continuous
     Native Generation).
2. The three entries to add (verbatim from `22-ios-native-config-findings.md` §2 `ios-001`):

```xml
<key>NSPrivacyCollectedDataTypes</key>
<array>
  <dict>
    <key>NSPrivacyCollectedDataType</key>
    <string>NSPrivacyCollectedDataTypeEmailAddress</string>
    <key>NSPrivacyCollectedDataTypeLinked</key><true/>
    <key>NSPrivacyCollectedDataTypeTracking</key><false/>
    <key>NSPrivacyCollectedDataTypePurposes</key>
    <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
  </dict>
  <dict>
    <key>NSPrivacyCollectedDataType</key>
    <string>NSPrivacyCollectedDataTypeUserID</string>
    <key>NSPrivacyCollectedDataTypeLinked</key><true/>
    <key>NSPrivacyCollectedDataTypeTracking</key><false/>
    <key>NSPrivacyCollectedDataTypePurposes</key>
    <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
  </dict>
  <dict>
    <key>NSPrivacyCollectedDataType</key>
    <string>NSPrivacyCollectedDataTypePurchaseHistory</string>
    <key>NSPrivacyCollectedDataTypeLinked</key><true/>
    <key>NSPrivacyCollectedDataTypeTracking</key><false/>
    <key>NSPrivacyCollectedDataTypePurposes</key>
    <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
  </dict>
</array>
```

3. After fix: run `expo prebuild --clean` and confirm
   `ios/ClawBoy/PrivacyInfo.xcprivacy` still contains the three entries.
   If it does not, the persistence mechanism (plugin or committed file)
   needs further work.

---

### appstore-002 · low · `assets/icon.png` — RGBA file with all-opaque alpha channel

**Severity:** low
**Status:** proposed
**File(s):** `assets/icon.png`

**Observation:**
- `sips -g all assets/icon.png` reports `hasAlpha: yes` and
  `samplesPerPixel: 4`.
- Pillow alpha-channel scan: every pixel has α = 255 (effectively opaque).
- 1024 × 1024 dimensions are correct for the App Store marketing icon.

**Why this matters:**
- Apple's documentation says the marketing icon delivered to App Store
  Connect must not contain an alpha channel.
- Expo's iOS prebuild generates `ios/ClawBoy/Images.xcassets/AppIcon.appiconset/`
  from `assets/icon.png`. In practice, Xcode strips the alpha channel
  when copying assets into the catalog. Validated builds typically pass
  through. However, some App Store Connect upload paths (Transporter
  CLI in particular) reject icons with an alpha channel even when all
  pixels are opaque, returning `ERROR ITMS-90717: "Invalid App Store
  Icon"`.

**Proposed fix:**
- Re-export `assets/icon.png` as RGB (no alpha channel) at 1024 × 1024 to
  eliminate the upload-rejection risk:
  ```sh
  sips -s format png -s formatOptions normal --setProperty hasAlpha no \
    assets/icon.png --out assets/icon.png
  ```
  Or, in a graphics editor, "Export As → PNG, no transparency".
- After the change, re-verify via
  `python3 -c "from PIL import Image; print(Image.open('assets/icon.png').mode)"`
  — should print `RGB`, not `RGBA`.

Not raising to `med` because most submissions through `eas submit` and
Xcode succeed today; the rejection is intermittent and tied to the upload
path. Closing it pre-emptively is the cheapest path.

---

### appstore-003 · med · RevenueCat Test Store keys in `app.json` will block first IAP-enabled submission

**Severity:** med
**Status:** deferred (not a blocker for v0.9.0 because `PURCHASES_ENABLED = false`)
**File(s):** `app.json:102-103`

**Observation:**
- `expo.extra.revenueCatApiKeyIos` and `…Android` are both set to
  `"test_WNuRgjiqslehCeVrtBWStwPsteT"` — the RevenueCat Test Store key
  shared between dev and CI.
- Per `iap-008` (plan 13), test keys are intentional today because
  `PURCHASES_ENABLED = false` and no real purchases can happen. Once
  the flag flips, these must become production keys (`appl_…` and
  `goog_…` — both still public-by-design, but a key mismatch silently
  serves test products to production users).

**Proposed action:** before the first submission that ships
`PURCHASES_ENABLED = true`, swap the two keys in `app.json` and verify
the production RC project has the same product IDs registered
(`com.sundaysoftworks.clawboy.founders.lifetime`, etc. — see plan 13).

---

### appstore-004 · low · `eas.json` production profile lacks explicit `distribution: "store"` and `credentialsSource: "remote"` declarations

**Severity:** low
**Status:** proposed
**File(s):** `eas.json:23-34`

**Observation:**
- The `production` build profile relies on EAS defaults: `distribution`
  is unset (defaults to `store`); `credentialsSource` is unset (defaults
  to `remote`). Both defaults are correct for App Store builds.
- Plan 22's `eas.json` audit (§5) flagged the same lack of explicit
  declaration as informational, not a blocker.

**Why surface here:** any future developer reading `eas.json` cold
cannot tell whether the production profile is intended for store or
internal distribution. Explicit declaration is documentation.

**Proposed change** (do not apply — `eas.json` is on the forbidden list):
```jsonc
"production": {
  "channel": "production",
  "distribution": "store",
  "credentialsSource": "remote",
  "env": { "EXPO_PUBLIC_APP_ENV": "production" },
  "ios": { "buildConfiguration": "Release" },
  "android": { "buildType": "apk" }
}
```

---

### appstore-005 · nit · `expo.ios.infoPlist.CFBundleDevelopmentRegion` set to `"en"` — confirm matches store localizations

**Severity:** nit
**Status:** informational
**File(s):** `app.json:33`, `ios/ClawBoy/Info.plist:9-10`

**Observation:**
- `CFBundleDevelopmentRegion = en`, `CFBundleLocalizations = ['en', 'zh-Hans']`.
  Matches `src/i18n/locales/` (en + zh-CN). Internally consistent.
- No action required. Surfacing only because every i18n review touches
  this key and X6 a11y/i18n audit reported 100% locale parity (`en` =
  `zh-CN` = 1204 keys).

---

## 11. Cross-Plan Blocker Synthesis

The full per-plan blocker rollup lives in `release-go-no-go.md` §
Blocker Summary. The summary below restates only the open `critical` /
`high` items that gate App Store submission today.

| ID | Sev | Area | Plan | Status | Blocks v0.9.0 submission? |
|----|-----|------|------|--------|---------------------------|
| `appstore-001` | high | Privacy manifest | X7 | proposed (this audit) | **YES** |
| `gateway-001` | high | Native module typescript types | 01 / 21 | proposed | no — runtime works, types only |
| `auth-001` | high | Device-token persistence | 02 | proposed | no — cosmetic / perf only (extra challenge-sign per cold start) |
| `agents-001` | high | Stale-closure `setCurrentModel` | 07 | proposed | no — non-fatal UX bug |
| `onboarding-001` | high | `AchievementsOptInStep` i18n | 08 | proposed | no — zh-CN users see English on one step |
| `voice-002` | high | Server TTS cannot be stopped | 10 | proposed | no — UX bug, not a Review blocker |
| `iap-001` | high | Hardcoded prices (PURCHASES_ENABLED gated) | 13 | proposed | no while flag is off — see §8 |
| `iap-002` | high | Restore swallows errors (PURCHASES_ENABLED gated) | 13 | proposed | no while flag is off — see §8 |
| `X5-test-010` | high | `client.ts` reconnect path test gap | X5 | flagged (file forbidden) | no — coverage gap only |

All open `high` items except `appstore-001` are quality / perf / coverage
defects that App Review will not reject for. `appstore-001` is the
single Apple-rule blocker.

For full counts (critical + high + med + low + nit, resolved vs open)
see `release-go-no-go.md`.

---

## 12. Test Impact

`npm test -- --forceExit` run 2026-05-12 after all prior audits' fixes:

```
Test Suites: 89 passed, 89 total
Tests:       1291 passed, 1291 total
Snapshots:   70 passed, 70 total
Time:        15.843 s
```

All tests pass across the `logic` and `components` Jest projects.
One worker-force-exit warning fires after the openclaw client suite
(`X5-test-007`, low). It is pre-existing and unrelated to this audit;
the test suite still passes.

The 1291 figure is +100 over the 1191 reported by `X2` and `X5` (both
2026-05-12). The additional 100 tests appear to cover:
- `src/lib/chatCache/__tests__/crypto.test.ts` — closes critical
  `X5-test-001` (chatCache AES-256-GCM round-trip)
- `src/lib/__tests__/pickBestServerProfile.test.ts` — closes high
  `X5-test-002`
- `src/lib/purchases/__tests__/products.test.ts` — closes high
  `X5-test-003`
- `src/lib/feedback/__tests__/devBypassToken.test.ts` — closes high
  `X5-test-004`
- `src/lib/openclaw/__tests__/utils.test.ts` — closes high `X5-test-005`
- `src/lib/chatCache/__tests__/store.test.ts` — closes high `X5-test-008`
- `src/lib/__tests__/messageMerge.test.ts` — closes med `X5-test-009`
- `src/lib/supabase/__tests__/auth.appleNonce.test.ts` — confirms
  high `account-001` (Apple Sign-In nonce) fix landed

X5 critical `test-001` and the five X5 highs `test-002` through
`test-008` are all considered **resolved** by inspection — test files
exist at the expected paths and the suite passes.

`X5-test-010` (client.ts reconnect-path coverage) is the only X5 high
that remains open, because the file (`src/lib/openclaw/client.ts`) is
on `_RULES.md`'s absolutely-forbidden list. The test gap is documented
but the file cannot be touched.

---

## 13. Auto-fixes applied

**None.** This plan is read-only by design. The plan file's §1 (Scope)
explicitly excludes all editable surfaces:
- `app.json`, `eas.json`, `ios/`, `assets/`, and all findings docs are
  read-only.
- The only writes performed by this audit are this findings file,
  `release-go-no-go.md`, and the single row-flip in
  `docs/audits/README.md` per the plan §6 exit criteria.

---

## 14. Open questions for human

1. **`appstore-001` — Privacy manifest source-of-truth.** Which durability
   strategy do you prefer: commit `PrivacyInfo.xcprivacy` to the repo
   (un-ignore a single path inside `/ios/`), or write an
   `expo-config-plugins` hook that injects the three data types during
   prebuild? The plugin approach is more aligned with the project's CNG
   posture but requires writing a small JS plugin file. Committing the
   file is one line in `.gitignore` plus the file itself.
2. **`appstore-002` — Icon alpha.** Are you comfortable re-exporting
   `assets/icon.png` as RGB before the first TestFlight upload? The
   change is trivial (sips one-liner) and removes the ITMS-90717
   intermittent-rejection risk.
3. **`appstore-003` — RevenueCat key swap timing.** Before
   `PURCHASES_ENABLED` flips, swap both `revenueCatApiKey…` values in
   `app.json` to `appl_…` / `goog_…`. Worth tracking as a release-prep
   checklist item.
4. **Review Notes demo gateway.** `docs/legal/app-review-notes.md`
   leaves the live-gateway section empty (demo mode satisfies review).
   Confirm before submitting.
5. **App Store Connect Privacy Policy URL.** Must be set in App Store
   Connect → App Information → Privacy Policy URL. Confirm the
   `docs/legal/privacy-policy.md` content is hosted at a stable public
   URL before submission.

---

## 15. Exit Criteria Self-Check

- [x] `docs/audits/findings/X7-app-store-readiness-findings.md` written
- [x] `docs/audits/findings/release-go-no-go.md` written
- [x] All prior findings synthesised (29 docs: 23 per-area + 6 X1–X6)
- [x] GO/NO-GO determination made (NO-GO) with documented rationale
- [x] Row X7 in `docs/audits/README.md` flipped to `done` (final step)
- [x] No source/config files modified
- [x] No plan files modified
- [x] No README rows other than X7 modified
- [x] `npm test` run and recorded (passed: 89/89 suites, 1291/1291 tests)
