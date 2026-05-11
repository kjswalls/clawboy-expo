# Audit Findings — Plan 22: iOS Native Config & App Store Requirements

> **Auditor:** background agent (Opus tier)
> **Date:** 2026-05-11
> **Plan:** [22-ios-native-config.md](../22-ios-native-config.md)
> **Scope:** `ios/ClawBoy/Info.plist`, `ios/ClawBoy/ClawBoy.entitlements`, `ios/ClawBoy/PrivacyInfo.xcprivacy`, `ios/ClawBoy/AppDelegate.swift`, `ios/ClawBoy/Supporting/Expo.plist`, `ios/ClawBoy/Images.xcassets/`, `ios/Podfile`, `ios/Podfile.properties.json`, `ios/.gitignore`, `ios/ClawBoy.xcodeproj/project.pbxproj`, `app.json`, `eas.json`.
> **Status convention:** Every finding is `proposed` per plan §3 — native config changes require a new native build.

---

## 0. Summary

| Severity | Count |
|----------|-------|
| critical | 0 |
| high     | 3 |
| med      | 5 |
| low      | 4 |
| nit      | 3 |
| **Total**| **15** |

Auto-fixes applied: **0** (original audit). Wave 3 remediation applied ios-001, ios-002, ios-003 (option A), ios-004, ios-006, ios-007, ios-008, ios-009, ios-010, ios-011, ios-013, ios-014 — all changes committed; native rebuild required to validate. ios-005, ios-012, ios-015 informational — no action.

### Headline issues
1. **`PrivacyInfo.xcprivacy` declares no collected data types** despite the app collecting Email, User ID, and Purchase History (per `docs/legal/app-store-privacy-labels.md`). This is the Apple privacy manifest required since 2024-05-01, and it conflicts with the App Store Connect privacy label. → `ios-001` (high).
2. **`NSPhotoLibraryUsageDescription` in `app.json` is wrong** — it uses the "Save media…" copy meant for the *Add* permission, so the next `expo prebuild` will overwrite the correct read-access copy in `Info.plist` with a misleading description. → `ios-002` (high).
3. **`aps-environment` push entitlement and `expo-notifications` plugin are present but the app ships no push notification feature.** Apple §5.1.5 prohibits claiming capabilities you don't use. → `ios-003` (high).

---

## 1. Permission Matrix

| Permission key                          | In `Info.plist` | Description adequate                 | In `app.json` `expo.ios.infoPlist` | Matches between the two |
|-----------------------------------------|-----------------|--------------------------------------|------------------------------------|-------------------------|
| `NSCameraUsageDescription`              | ✅              | ✅                                   | ✅                                 | ⚠ wording differs ("gateway" vs "OpenClaw gateway") |
| `NSMicrophoneUsageDescription`          | ✅              | ✅                                   | ✅                                 | ✅                      |
| `NSPhotoLibraryUsageDescription`        | ✅              | ✅ (read-access copy)                | ✅ (but copy is **wrong** — same as Add) | ❌ `app.json` will overwrite Info.plist with the Add copy |
| `NSPhotoLibraryAddUsageDescription`     | ✅              | ✅                                   | ✅                                 | ✅                      |
| `NSSpeechRecognitionUsageDescription`   | ✅              | ✅                                   | ✅                                 | ✅                      |
| `NSFaceIDUsageDescription`              | ✅              | ⚠ default placeholder ("Allow `$(PRODUCT_NAME)` to access your Face ID biometric data.") | ❌ not declared | ⚠ added by `expo-secure-store` default plugin; app does not use `requireAuthentication`, so the string is functionally unused |
| `NSContactsUsageDescription`            | ❌ (not used)   | n/a                                  | ❌                                 | ✅ (correctly absent)   |
| `NSLocationWhenInUseUsageDescription`   | ❌ (not used)   | n/a                                  | ❌                                 | ✅ (correctly absent)   |
| `NSCalendarsUsageDescription`           | ❌ (not used)   | n/a                                  | ❌                                 | ✅ (correctly absent)   |
| `NSBluetoothAlwaysUsageDescription`     | ❌ (not used)   | n/a                                  | ❌                                 | ✅ (correctly absent)   |
| `NSHealthShareUsageDescription`         | ❌ (not used)   | n/a                                  | ❌                                 | ✅ (correctly absent)   |

> Source for the "in code" column: surveyed `src/` for `Camera`, `ImagePicker`, `MediaLibrary`, `expo-speech-recognition`, `LAContext`, `LocalAuthentication`, `requireAuthentication`, `Sentry`, etc. Only the permissions in rows marked ✅ are actually exercised.

### URL Schemes

| Scheme                          | Registered in `Info.plist`? | Referenced in code/config? | Notes |
|---------------------------------|------------------------------|----------------------------|-------|
| `clawboy`                       | ✅                           | ✅ (`clawboy://auth-callback` used by Supabase magic-link, Google OAuth, plus `supabase/config.toml` and `app.json` `scheme`) | OK |
| `com.sundaysoftworks.clawboy`   | ✅                           | ❌ (no `com.sundaysoftworks.clawboy://` anywhere in `src/`, `app/`, or `supabase/config.toml`) | Auto-added by Expo; unused — see `ios-009` |

---

## 2. Findings

### ios-001 — `PrivacyInfo.xcprivacy` omits all `NSPrivacyCollectedDataTypes`
- **Severity:** high
- **Status:** fixed — native rebuild required
- **File(s):** `ios/ClawBoy/PrivacyInfo.xcprivacy:43-44`
- **What I see:** `<key>NSPrivacyCollectedDataTypes</key><array/>` — empty.
- **Why this is a problem:** Apple privacy-manifest rules (required since 2024-05-01) say the app's own bundled `PrivacyInfo.xcprivacy` must declare data types the app's code collects. Per `docs/legal/app-store-privacy-labels.md` lines 22-29, 117-127, 134-140, ClawBoy *does* collect (when the user signs in or purchases):
  - Email Address (Supabase auth)
  - User ID (Supabase UUID + RevenueCat user ID)
  - Purchase History (entitlement tier persisted via Supabase)
  Even if Supabase and RevenueCat SDKs ship their own privacy manifests (aggregated via `apple.privacyManifestAggregationEnabled = true` in `ios/Podfile`), the app's own code makes those calls explicitly — Apple guidance is that the main bundle should still declare what *it* sends off-device. Apple's App Store Connect privacy nutrition label and the bundled `PrivacyInfo.xcprivacy` are expected to be consistent; today they are not.
- **Proposed fix (do not apply — requires new build):** Add the following entries to `NSPrivacyCollectedDataTypes` (in addition to whatever is already aggregated from third-party pods):

```xml
<key>NSPrivacyCollectedDataTypes</key>
<array>
  <dict>
    <key>NSPrivacyCollectedDataType</key>
    <string>NSPrivacyCollectedDataTypeEmailAddress</string>
    <key>NSPrivacyCollectedDataTypeLinked</key>
    <true/>
    <key>NSPrivacyCollectedDataTypeTracking</key>
    <false/>
    <key>NSPrivacyCollectedDataTypePurposes</key>
    <array>
      <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
    </array>
  </dict>
  <dict>
    <key>NSPrivacyCollectedDataType</key>
    <string>NSPrivacyCollectedDataTypeUserID</string>
    <key>NSPrivacyCollectedDataTypeLinked</key>
    <true/>
    <key>NSPrivacyCollectedDataTypeTracking</key>
    <false/>
    <key>NSPrivacyCollectedDataTypePurposes</key>
    <array>
      <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
    </array>
  </dict>
  <dict>
    <key>NSPrivacyCollectedDataType</key>
    <string>NSPrivacyCollectedDataTypePurchaseHistory</string>
    <key>NSPrivacyCollectedDataTypeLinked</key>
    <true/>
    <key>NSPrivacyCollectedDataTypeTracking</key>
    <false/>
    <key>NSPrivacyCollectedDataTypePurposes</key>
    <array>
      <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
    </array>
  </dict>
</array>
```

  Confirm with Apple's [Privacy Manifest collected-data-type identifiers](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_data_use_in_privacy_manifests) that the strings above are current.

---

### ios-002 — `NSPhotoLibraryUsageDescription` copy in `app.json` is wrong (same as Add description)
- **Severity:** high
- **Status:** fixed — native rebuild required
- **File(s):** `app.json:39`
- **What I see:**
  ```jsonc
  "NSPhotoLibraryAddUsageDescription": "Save media you receive from your agents to your photo library.",
  "NSPhotoLibraryUsageDescription":   "Save media you receive from your agents to your photo library."
  ```
  Both keys carry identical "Save media…" text in `app.json`. But `NSPhotoLibraryUsageDescription` is the **read** prompt (shown when the user picks an existing photo) and `NSPhotoLibraryAddUsageDescription` is the **write/save** prompt. The text in `app.json:39` is the Add copy.
  The current `ios/ClawBoy/Info.plist:65-66` has the correct read-access copy ("ClawBoy needs photo library access to attach images and videos you choose.") — that matches what `expo-image-picker` plugin sets (`app.json:73`). But `expo.ios.infoPlist` takes priority over plugin-supplied values, so the **next** `expo prebuild` will overwrite the correct copy with the wrong one.
- **Why this is a problem:** App Review §5.1.1(i) rejects apps whose permission strings don't describe the actual use. Telling the user "Save media…" while requesting *read* access is misleading and is a known rejection trigger.
- **Proposed fix (do not apply — requires regenerating Info.plist):** In `app.json`, change line 39 to the read-access copy and keep line 38 as the save copy:
  ```jsonc
  "NSPhotoLibraryAddUsageDescription": "Save media you receive from your agents to your photo library.",
  "NSPhotoLibraryUsageDescription":    "ClawBoy needs photo library access to attach images and videos you choose."
  ```
  Alternatively, remove both from `expo.ios.infoPlist` and rely on the `expo-image-picker` / `expo-media-library` plugin entries (`app.json:71-99`), which already have the correct copy.

---

### ios-003 — Push notification capability declared but never used (App Review §5.1.5 risk)
- **Severity:** high
- **Status:** fixed — native rebuild required (option A applied: expo-notifications uninstalled, plugin removed, aps-environment entitlement deleted)
- **File(s):** `ios/ClawBoy/ClawBoy.entitlements:5-6`, `app.json:77-82`
- **What I see:**
  - `ClawBoy.entitlements` declares `aps-environment` = `development`.
  - `app.json` registers the `expo-notifications` plugin with `mode: "development"`.
  - Searching `src/` and `app/`: no `Notifications.scheduleNotificationAsync`, no `Notifications.addNotificationReceivedListener`, no `Notifications.getDevicePushTokenAsync`, no `Notifications.requestPermissionsAsync`. The only matches for "Notifications" are the unrelated `stripSystemNotifications` text-cleaning util and a "Notifications" accessibility label on a settings panel that links out.
  - `docs/legal/app-store-privacy-labels.md:195` confirms push is a *future* feature ("If push notifications are added (see `docs/plans/push-notifications.md`)…").
- **Why this is a problem (two-part):**
  1. **§5.1.5 / App Review:** declaring an entitlement the app does not exercise can trigger reviewer questions and rejections. The `.cursorrules` checklist explicitly forbids "claim capabilities it doesn't use".
  2. **Production-build defect waiting to happen:** even if push *is* shipped in MVP, `mode: "development"` produces an entitlements file with `aps-environment = development`, which is not the value an App Store distribution build needs (`production`). EAS won't auto-flip it.
- **Proposed fix (do not apply — requires new build):** pick one of:
  - **(A) Remove push for MVP:** delete the `expo-notifications` plugin entry from `app.json` (lines 77-82); delete the `aps-environment` key from `ClawBoy.entitlements`; uninstall the package; re-prebuild. Push can be re-added in Phase 2 along with the actual feature.
  - **(B) Keep push, fix mode:** change `app.json:80` to `"mode": "production"` (this still creates a development entitlement for local dev-client builds because EAS swaps it based on profile, but the *App Store* build will get `production`). Ship at least one real `Notifications.*` call so the entitlement is justified, otherwise Apple may still question it.

---

### ios-004 — `eas.json` `ascApiKeyPath` contains a personal home-directory path
- **Severity:** med
- **Status:** fixed — native rebuild required
- **File(s):** `eas.json:38`
- **What I see:**
  ```jsonc
  "ascApiKeyPath": "/Users/kirby/Downloads/Code Projects/clawboy-expo/AuthKey_X67X7737ZG.p8",
  ```
- **Why this is a problem:**
  - **OSS-readiness:** the repo will be open-sourced; this path leaks the maintainer's macOS username and folder structure.
  - **Portability:** any other contributor running `eas submit` will fail because that path doesn't exist on their machine.
  - **Security adjacency:** while the `.p8` private key itself is outside the repo (it's in `~/Downloads/`), pairing the filename `AuthKey_X67X7737ZG.p8` with the visible `ascApiKeyId: "X67X7737ZG"` gives an attacker confirmation of which key file to look for if the maintainer's machine is ever compromised.
- **Proposed fix (do not apply — config change; submit is per-developer):** move ASC credentials to an EAS Secret (`eas secret:create --scope project --name ASC_API_KEY_BASE64 …`) and reference via `ascApiKey` block, **or** require the path via an environment variable, e.g. `"ascApiKeyPath": "$EAS_ASC_API_KEY_PATH"`, and document in `README.md`. The fields `appleTeamId`, `ascAppId`, `ascApiKeyId`, `ascApiKeyIssuerId` themselves are not secrets and may stay (they're discoverable from any App Store listing or developer.apple.com).

---

### ios-005 — `NSPrivacyCollectedDataTypes` of `PrivacyInfo.xcprivacy` should also list **Diagnostic Data** decision explicitly (consistency with legal doc)
- **Severity:** med
- **Status:** proposed
- **File(s):** `ios/ClawBoy/PrivacyInfo.xcprivacy:43-44`, cross-ref `docs/legal/app-store-privacy-labels.md:153-171`
- **What I see:** `PrivacyInfo.xcprivacy` declares no `NSPrivacyCollectedDataTypes`. `app-store-privacy-labels.md` says diagnostic data is *not* collected automatically (only via explicit user-submitted bug reports). That is consistent with declaring no diagnostic data type — but only if `infra/feedback-worker/` and `src/lib/feedback/` truly don't transmit any device-identifying telemetry off the user-initiated submit path.
- **Why this matters:** I cannot fully validate this from this audit's scope (feedback worker is plan 18). Cross-cutting validation needed before App Store submission.
- **Proposed fix:** during `X2-security-sweep`, confirm with plan 18 findings (`docs/audits/findings/18-feedback-worker-findings.md`, currently `in_progress`) that no auto-transmitted telemetry exists. If yes, no change to PrivacyInfo. If a passive crash/diagnostics path is found, append a `NSPrivacyCollectedDataTypeCrashData` or `NSPrivacyCollectedDataTypeDiagnosticData` entry as appropriate.

---

### ios-006 — `NSFaceIDUsageDescription` is the placeholder string and the API is not used
- **Severity:** med
- **Status:** fixed — native rebuild required
- **File(s):** `ios/ClawBoy/Info.plist:59-60`
- **What I see:**
  ```xml
  <key>NSFaceIDUsageDescription</key>
  <string>Allow $(PRODUCT_NAME) to access your Face ID biometric data.</string>
  ```
  Origin: `expo-secure-store/plugin/src/withSecureStore.ts` defaults `faceIDPermission` to a generic string. The app's code does not use `requireAuthentication: true` (`grep -r requireAuthentication src/` → 0 hits), no `LAContext`, no `expo-local-authentication` dependency.
- **Why this matters:** the description string is generic/placeholder-style (uses `$(PRODUCT_NAME)`), inconsistent with the polished, app-branded copy of the other permission descriptions. If Apple's reviewer asks "where does this app use Face ID?" we cannot point to live code.
- **Proposed fix (do not apply — config change):** in `app.json`, configure the `expo-secure-store` plugin to suppress the key:
  ```jsonc
  [
    "expo-secure-store",
    { "faceIDPermission": false }
  ]
  ```
  This causes `expo prebuild` to omit `NSFaceIDUsageDescription` entirely. If/when biometric-protected secure-store entries are added later, set this to a ClawBoy-branded string instead.

---

### ios-007 — `DEVELOPMENT_TEAM` hard-coded in `project.pbxproj` (OSS readiness)
- **Severity:** med
- **Status:** fixed — native rebuild required
- **File(s):** `ios/ClawBoy.xcodeproj/project.pbxproj:391, 424`
- **What I see:** `DEVELOPMENT_TEAM = "7GLMG5N9K8";` is checked in for both Debug and Release configurations.
- **Why this matters:**
  - **OSS:** fresh clones from contributors will fail to sign because their team ID is different. Standard guidance is to leave `DEVELOPMENT_TEAM = ""` in committed pbxproj and use `xcconfig` overrides or Xcode "Signing & Capabilities" workflow.
  - **Note:** Apple Team IDs are not secrets (they're embedded in every App Store binary), but they create friction for OSS contributors.
- **Proposed fix (do not apply — modifies pbxproj, requires new build):** either (a) remove the hard-coded `DEVELOPMENT_TEAM` and rely on a developer-local `xcconfig`, or (b) document in `README.md` that contributors need to override `DEVELOPMENT_TEAM` locally. Option (a) is cleaner. EAS Build still gets the team from the EAS credentials store, not pbxproj.

---

### ios-008 — Splash background is white but the app is forced to dark mode
- **Severity:** med
- **Status:** fixed — native rebuild required
- **File(s):** `app.json:23-27`, `ios/ClawBoy/Images.xcassets/SplashScreenBackground.colorset/Contents.json:4-13`, `ios/ClawBoy/SplashScreen.storyboard:3`
- **What I see:**
  - `app.json:22` `userInterfaceStyle: "dark"` + `Info.plist:97-98` `UIUserInterfaceStyle = "Dark"` → app launches in dark mode unconditionally.
  - `app.json:26` `splash.backgroundColor: "#FFFFFF"` → white.
  - `SplashScreenBackground.colorset/Contents.json` → `rgb(1,1,1)` white.
  - `SplashScreen.storyboard:3` `<device id="retina6_12" orientation="portrait" appearance="light"/>` — the storyboard's preview is also `light`.
- **Why this matters:** dark-mode users see a white flash on every cold launch, then the dark UI snaps in. This is a visible polish bug at the most prominent moment of the app. Apple HIG and reviewers don't reject for this, but it looks unfinished.
- **Proposed fix (do not apply — UI/asset change):** set `app.json` `splash.backgroundColor` to the dark base (e.g. `#0B0F19` or whatever `Colors.dark.background` resolves to from `src/constants/theme.ts`), regenerate `SplashScreenBackground.colorset`, and consider providing a `splash.dark.image` variant for the rare user who's forced light mode on the OS while the app is dark-only.

---

### ios-009 — Unused URL scheme `com.sundaysoftworks.clawboy` is registered
- **Severity:** low
- **Status:** fixed — native rebuild required
- **File(s):** `ios/ClawBoy/Info.plist:32-41`
- **What I see:** `CFBundleURLSchemes` lists both `clawboy` and `com.sundaysoftworks.clawboy`. The latter is never referenced anywhere in `src/`, `app/`, `infra/`, or `supabase/config.toml`. Only `clawboy://auth-callback` is used.
- **Why this matters:** unused URL schemes are noise and slightly enlarge the attack surface for URL-handler-confusion bugs. Expo's prebuild often adds a bundle-ID scheme by default for Google Sign-In flows that this app doesn't use (it uses the native Apple sheet + Supabase magic-link via the `clawboy` scheme).
- **Proposed fix (do not apply — Info.plist change requires new build):** remove the bundle-ID scheme from `CFBundleURLSchemes` so only `clawboy` remains. Confirm with `X2-security-sweep` that no OAuth provider (Google, GitHub, etc.) requires the bundle-ID scheme before removing.

---

### ios-010 — `NSCameraUsageDescription` wording differs between `app.json` and `Info.plist`
- **Severity:** low
- **Status:** fixed — native rebuild required
- **File(s):** `app.json:37`, `ios/ClawBoy/Info.plist:57-58`, `app.json:73-74` (expo-image-picker `cameraPermission`)
- **What I see:**
  - `app.json:37` (`expo.ios.infoPlist.NSCameraUsageDescription`): `"ClawBoy uses the camera to capture photos and videos to send to your OpenClaw gateway."`
  - `ios/ClawBoy/Info.plist:58`: `"ClawBoy uses the camera to capture photos and videos to send to your gateway."` (no "OpenClaw")
  - `app.json:74` (`expo-image-picker` plugin `cameraPermission`): `"ClawBoy uses the camera to capture photos and videos to send to your gateway."`
- **Why this matters:** drift between the source-of-truth (`app.json`) and the file that ships (`Info.plist`). Next `expo prebuild` will overwrite Info.plist with the `app.json` string. Minor wording inconsistency — not a rejection risk, but noise.
- **Proposed fix (do not apply):** pick one and use it in all three places. The shorter "gateway" string is cleaner since the user has just paired with their gateway and the brand "OpenClaw" is implicit. Recommend updating `app.json:37` to match the plugin string.

---

### ios-011 — `LSMinimumSystemVersion: "12.0"` in `Info.plist` is a macOS-only key (no-op on iOS)
- **Severity:** low
- **Status:** fixed — native rebuild required
- **File(s):** `ios/ClawBoy/Info.plist:46-47`
- **What I see:** `LSMinimumSystemVersion` is a macOS / Mac Catalyst key. iOS uses `MinimumOSVersion`, which Xcode generates automatically from the Xcode project's `IPHONEOS_DEPLOYMENT_TARGET` (currently `15.1`, see `project.pbxproj:372, 406, 477, 535`).
- **Why this matters:** harmless — iOS ignores it — but it's confusing and looks like a copy-paste error. App is not Mac Catalyst (`mac_catalyst_enabled => false` in Podfile:61).
- **Proposed fix (do not apply):** remove the key. Or, if the goal was to set the iOS minimum, set `IPHONEOS_DEPLOYMENT_TARGET` (already correctly `15.1`) and let Xcode write `MinimumOSVersion`.

---

### ios-012 — `AppIcon.appiconset` ships only the single 1024×1024 universal icon
- **Severity:** low
- **Status:** proposed
- **File(s):** `ios/ClawBoy/Images.xcassets/AppIcon.appiconset/Contents.json:2-9`
- **What I see:** one entry: `idiom: universal`, `platform: ios`, `size: 1024x1024`. This is Apple's "single-size" workflow available since Xcode 14 / iOS 17.
- **Why this matters:** for iOS deployment target ≥ 13 / Xcode ≥ 14 this is fine — Xcode auto-generates the smaller sizes at build time. ClawBoy targets iOS 15.1, so this works. Mentioning here only because some Apple submission paths still flag missing sizes if there's also an iPad-specific or Mac Catalyst variant requirement. Re-check before first TestFlight upload.
- **Proposed fix:** none if iOS 15.1+ target stays. If you want belt-and-suspenders, generate the legacy sizes (40/58/60/80/87/120/180) and update `Contents.json` to reference them.

---

### ios-013 — `eas.json` exposes `ascAppId`, `appleTeamId`, `ascApiKeyId`, `ascApiKeyIssuerId` (OSS surface)
- **Severity:** nit
- **Status:** fixed — native rebuild required
- **File(s):** `eas.json:36-40`
- **What I see:**
  ```jsonc
  "appleTeamId": "7GLMG5N9K8",
  "ascAppId": "6766195705",
  "ascApiKeyPath": "/Users/kirby/Downloads/Code Projects/clawboy-expo/AuthKey_X67X7737ZG.p8",
  "ascApiKeyId": "X67X7737ZG",
  "ascApiKeyIssuerId": "1f444654-1d34-4764-a97c-f839e6994282"
  ```
- **Why this matters:** none of these are secrets in the cryptographic sense (the `.p8` file is the secret, and it's outside the repo), but together they identify the maintainer's Apple developer account. Other contributors who fork the project will need their own values. Not a security issue, just an OSS-friendliness one. Tracked separately from `ios-004` because that finding deals with the path string; this one is about the four identifiers as a group.
- **Proposed fix (do not apply — coordination needed):** keep them in `eas.json` and document the substitution in the README, **or** move them to a `submit.production.ios.env` style EAS env-var lookup. Either is acceptable.

---

### ios-014 — `CFBundleVersion = "1"` is a static placeholder; OK only because `eas.json` uses `appVersionSource: "remote"`
- **Severity:** nit
- **Status:** fixed — native rebuild required
- **File(s):** `ios/ClawBoy/Info.plist:42-43`, `eas.json:4`
- **What I see:** `CFBundleVersion = "1"` in Info.plist; `eas.json` `cli.appVersionSource = "remote"` so EAS Build manages the actual build number and bumps it remotely.
- **Why this matters:** if `appVersionSource` is ever flipped to `"local"`, the static `"1"` would silently sneak into every submission, immediately rejected by App Store Connect for duplicate build numbers. Defensive concern only.
- **Proposed fix:** none required today. Add a one-line comment in `eas.json` noting that `CFBundleVersion` is overwritten remotely so the gotcha is visible to anyone who later edits this file.

---

### ios-015 — `Info.plist` `CFBundleShortVersionString` (`0.9.0`) and `app.json` `version` (`0.9.0`) are in sync, but `Expo.plist` `EXUpdatesRuntimeVersion` is also `0.9.0` — note the coupling for future bumps
- **Severity:** nit
- **Status:** proposed
- **File(s):** `ios/ClawBoy/Info.plist:28-29`, `app.json:6`, `ios/ClawBoy/Supporting/Expo.plist:41-42`
- **What I see:** all three are `0.9.0`. `app.json` uses `runtimeVersion.policy: "appVersion"` so they will move in lockstep on the next bump. Currently consistent.
- **Why this matters:** documenting the cross-file coupling so it's visible during release prep. No action.
- **Proposed fix:** none.

---

## 3. ATS, Encryption, and Entitlement Checks

| Check | Result | Notes |
|-------|--------|-------|
| `NSAppTransportSecurity.NSAllowsArbitraryLoads` | `false` ✅ | `Info.plist:50-56` — strict ATS, good. |
| `NSAppTransportSecurity.NSAllowsLocalNetworking` | `true` ✅ | Needed because users can self-host gateways on LAN. Documented OK. |
| `ITSAppUsesNonExemptEncryption` | `false` ✅ | `Info.plist:44-45` and `app.json:32`. App uses HTTPS/TLS (exempt) plus Ed25519 signing for authentication (exempt under EAR §740.17(a) — authentication is not "encryption" for export purposes). Setting `false` is correct. Re-confirm with legal before App Store submission. |
| Entitlements present and used | `aps-environment` ❌ (see `ios-003`), `com.apple.developer.applesignin` ✅ (used by `src/lib/supabase/auth.ts:34-53`) | Trim `aps-environment` until push ships. |
| `expo-secure-store` only for sensitive values | ✅ | `src/hooks/useServerConfig.tsx` uses `SecureStore` for auth tokens; `src/lib/feedback/devBypassToken.ts` likewise. `AsyncStorage` is reserved for non-sensitive prefs (out of scope here; covered by plans 02, 03, 14). |
| `Info.plist` has no API keys / tokens / private URLs | ✅ | Confirmed by visual scan. The `revenueCatApiKeyIos` and `supabaseAnonKey` live in `app.json:104-106` `expo.extra`, not `Info.plist`. Both are *publishable* / *anon* keys — see plan 14 findings for whether they should still be moved server-side. |

---

## 4. PrivacyInfo.xcprivacy Required-Reason API Audit

The bundled manifest declares four Required Reason API categories. All reason codes used are valid per Apple's published [Required Reason API list](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_use_of_required_reason_api):

| Category | Reasons | Apple meaning | Plausible source |
|----------|---------|---------------|------------------|
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `C617.1`, `0A2A.1`, `3B52.1` | Display, access metadata of files inside app/group/cloud containers, access metadata for files the user granted access to | React Native core / Expo file system access |
| `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` | Access user defaults for read/write info only accessible to the app | `AsyncStorage` / RN core / Expo |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `35F9.1` | Measure elapsed time between events within the app | RN core (perf measurement), Hermes runtime |
| `NSPrivacyAccessedAPICategoryDiskSpace` | `E174.1`, `85F4.1` | Check for sufficient disk space before writing files, display disk space to user | `expo-image` cache / `expo-media-library` / RN core |

No issues with the reason-code set itself. **Caveat:** the *completeness* depends on `apple.privacyManifestAggregationEnabled = true` in `ios/Podfile.properties.json` working as expected — when each third-party CocoaPod is rebuilt, its bundled `PrivacyInfo.xcprivacy` is merged. This audit cannot verify aggregation without running `pod install` and inspecting the built `.app`; treat as deferred to `X2-security-sweep` and `X4-deps-and-licenses`.

---

## 5. EAS Build Profile Audit

| Profile | Distribution | iOS config | Channel | Notes |
|---------|--------------|-----------|---------|-------|
| `development` | `internal` | `simulator: true`, dev client | `development` | OK. |
| `preview` | `internal` | `buildConfiguration: Release` | `preview` | OK. |
| `production` | (default → `store`) | `buildConfiguration: Release` | `production` | OK — but no explicit `distribution: "store"`. Defaults work; explicit is clearer. |

Submit profile `submit.production.ios` — see `ios-004` and `ios-013`.

---

## 6. Cross-References

- `docs/audits/findings/02-auth-pairing-findings.md` — auth scheme `clawboy://auth-callback` verified there; consistent with `Info.plist`.
- `docs/audits/findings/14-account-supabase-findings.md` — Supabase / RevenueCat data-collection inventory feeding `ios-001`.
- `docs/legal/app-store-privacy-labels.md` — App Store Connect privacy nutrition label source of truth.
- `docs/legal/privacy-policy.md` — public-facing policy; must remain consistent with both Connect labels and `PrivacyInfo.xcprivacy`.

---

## 7. Auto-fixes applied

None in original audit (plan §3 prohibited it). Wave 3 remediation applied all actionable findings (ios-001, ios-002, ios-003/A, ios-004, ios-006, ios-007, ios-008, ios-009, ios-010, ios-011, ios-013, ios-014). All status fields updated to `fixed — native rebuild required`.

---

## 8. Test impact

No tests run, no code modified. The affected files are not exercised by Jest.

---

## 9. Exit Criteria Self-Check

- [x] `docs/audits/findings/22-ios-native-config-findings.md` written
- [x] All permission strings checked and documented (see §1 Permission Matrix)
- [x] `PrivacyInfo.xcprivacy` presence and completeness documented (`ios-001`, §4)
- [x] `ITSAppUsesNonExemptEncryption` finding documented (§3 table)
- [x] No native files modified
- [x] Severity counts accurate (3 high / 5 med / 4 low / 3 nit / 0 critical = 15 total)
- [x] Row 22 in `docs/audits/README.md` will be flipped to `done` after this file is written
