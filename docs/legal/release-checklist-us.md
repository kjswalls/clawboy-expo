# ClawBoy — U.S. App Store Release Checklist

*Last updated: May 10, 2026*
*Complete every item before submitting to TestFlight or App Store review.*

---

## Phase 1 — Code & Build

- [ ] **`npm test` passes** — `npm run pretest && npm test` green locally and on CI.
- [ ] **EAS production build config complete** — `eas.json` production profile has `distribution: "store"` and `credentialsSource: "remote"`. Run `eas build --platform ios --profile production` (do not submit yet) to confirm the build compiles cleanly.
- [ ] **`expo-notifications` mode set to `production`** — change `"mode": "development"` → `"mode": "production"` in the `expo-notifications` plugin block of `app.json` before the production build. (Leave as `development` for TestFlight builds during internal testing.)
- [ ] **RevenueCat API keys** — swap `revenueCatApiKeyIos` from the `test_*` key to the live production key in `app.json` `extra` before the release build. Never commit the live key; store it as an EAS secret.
- [ ] **`app.json` version / build number** — `expo.version` matches the intended release semver; `expo.ios.buildNumber` is incremented from the previous submission. Both must match what App Store Connect expects.
- [ ] **OTA update URL** — `expo.updates.url` points to the production EAS Update channel, not dev/staging.
- [ ] **Code-signing certificate** — `certs/certificate.pem` is the production signing cert. The `codeSigningMetadata` block in `app.json` matches.

---

## Phase 2 — Privacy Manifest (`PrivacyInfo.xcprivacy`)

Apple requires a privacy manifest in every iOS app as of Spring 2024.

- [ ] Run `npx expo prebuild --platform ios` to materialise the `ios/` directory.
- [ ] Create or verify `ios/ClawBoy/PrivacyInfo.xcprivacy` contains:
  - `NSPrivacyTracking`: `false`
  - `NSPrivacyTrackingDomains`: empty array `[]`
  - `NSPrivacyCollectedDataTypes`: documents all data types collected per `docs/legal/app-store-privacy-labels.md`.
  - `NSPrivacyAccessedAPITypes`: required-reason APIs the app or its dependencies access:
    - `NSPrivacyAccessedAPICategoryUserDefaults` (AsyncStorage, Expo SecureStore) — reason: `CA92.1` (app functionality)
    - `NSPrivacyAccessedAPICategoryFileTimestamp` (expo-file-system) — reason: `C617.1` (app functionality)
    - `NSPrivacyAccessedAPICategorySystemBootTime` (react-native-reanimated) — reason: `35F9.1` (app functionality)
    - `NSPrivacyAccessedAPICategoryDiskSpace` (expo-file-system) — reason: `E174.1` (app functionality)
- [ ] Verify third-party SDK privacy manifests are present: RevenueCat, Expo Image, Expo SecureStore, Reanimated all ship their own manifests — Xcode will bundle them automatically from their pods. Run `Xcode → Product → Archive` and inspect the generated privacy report to confirm no missing manifest warnings.

---

## Phase 3 — Export Compliance

- [ ] `ITSAppUsesNonExemptEncryption` is set to `false` in `app.json` `ios.infoPlist`. See `docs/legal/export-compliance.md` for the full justification. This is the correct value — all encryption used (Ed25519 auth signing, AES-256-GCM chat-cache, TLS) is standard or authentication-only and exempt under EAR §740.17(b)(1).
- [ ] When App Store Connect prompts "Does your app use encryption beyond what Apple provides?", answer **No** and select "Exempt" for all applicable categories. This is consistent with the `ITSAppUsesNonExemptEncryption=false` declaration.

---

## Phase 4 — App Store Connect Setup

### Privacy labels
- [ ] Navigate to App Store Connect → Your App → App Privacy → Data Types.
- [ ] Enter labels exactly as specified in `docs/legal/app-store-privacy-labels.md`. Summary:
  - Email Address — **Yes, collected**, linked to identity, App Functionality (if user signs in).
  - User ID — **Yes, collected**, linked to identity, App Functionality (if user signs in).
  - Purchase History — **Yes, collected**, linked to identity, App Functionality (if user purchases).
  - All other categories — **Not Collected**.

### Privacy policy URL
- [ ] Publish `docs/legal/privacy-policy.md` at a stable public URL (e.g. `https://clawboy.app/privacy` or `https://sundaysoftworks.com/clawboy/privacy`). This URL is required; App Store Connect will reject submissions without it.
- [ ] Enter the URL in App Store Connect → App Information → Privacy Policy URL.

### Terms of Service URL
- [ ] Publish `docs/legal/terms.md` at a stable public URL (e.g. `https://clawboy.app/terms`).
- [ ] Enter the URL in App Store Connect → App Information → Terms of Service URL.

### Age rating
- [ ] Complete the age rating questionnaire. Expected outcome: **17+** due to "Unrestricted Web Access" (user-configured gateway can return any content) and/or "Infrequent/Mild" for user-controlled content. Do not understate the rating.

### Pricing & Availability
- [ ] **Deselect mainland China** from the list of available territories. See `docs/legal/cn-readiness/00-overview.md` for China strategy. Also deselect OFAC-restricted markets: **Iran, North Korea, Syria, Cuba**, and the **Crimea region** — required by U.S. law regardless of App Store policy. Keep **Hong Kong, Taiwan, Macau, Singapore** available (zh-Hans locale serves these markets).

---

## Phase 5 — App Review Compliance

### Account deletion (Guideline 5.1.1(v))
- [ ] Verify "Delete Account" is reachable in ≤2 taps from the main Settings screen (Settings → Account → Delete Account). The path exists in `AccountSettingsScreen.tsx`. Confirm it presents a clear confirmation dialog and the deletion is immediate (not delayed or hidden behind support contact).

### IAP Restore Purchases (Guideline 3.1.1)
- [ ] Verify "Restore Purchases" button is visible and functional on the purchases/account screen even when the user is not signed in. Confirm it shows feedback (loading indicator) and a success/failure message.

### Sign in with Apple parity (Guideline 4.8)
- [ ] Apple sign-in must be offered on equal visual footing as Google sign-in. In `SignInSheet.tsx`, confirm Apple is the first option and not visually de-emphasized.

### Demo mode for App Review
- [ ] Ensure the onboarding screen offers a visible "Try Demo Mode" entry point. The `DemoOpenClawClient` exists in `src/lib/demo/`. Reviewers must be able to exercise all core chat/session features without a live gateway. If the demo entry is not on the empty/onboarding state already, add a clearly labeled button.
- [ ] Prepare App Store Connect Review Notes (use `docs/legal/app-review-notes.md` as the source text).

### Review credentials (optional, belt-and-suspenders)
- [ ] Optionally create a dedicated reviewer gateway account + long-lived token at a URL that will remain accessible during review. Include credentials in the Review Notes if demo mode is insufficient to demonstrate all features.

---

## Phase 6 — Assets

- [ ] App icon (`assets/icon.png`): 1024×1024 px, RGB, no alpha channel, no rounded corners, no text smaller than 12 pt equivalent, no "App Store" badge or Apple logo.
- [ ] Adaptive icon (`assets/adaptive-icon.png`): foreground centered, sufficient safe-zone margin so it looks correct in all shapes (circle, squircle, teardrop).
- [ ] Splash screen (`assets/splash-icon.png`): present, correct dimensions for Expo SDK 55, background color matches `app.json` splash `backgroundColor` (`#0F1219`).
- [ ] Screenshots: prepare at minimum one set for **iPhone 6.7"** (required) and **iPad Pro 13"** (required if `supportsTablet: true`). Screenshots must show real content, not placeholder UI.

---

## Phase 7 — TestFlight Distribution

- [ ] Internal TestFlight build submitted and approved (no review, 1–2 hours).
- [ ] At least one internal tester has exercised: onboarding, connect to gateway, send/receive chat, session creation, settings, purchases (sandbox), account deletion.
- [ ] No crash on cold start, no crash on first-time onboarding, no crash on network loss.
- [ ] External TestFlight review submitted if needed (Apple review ~1–3 days). Use `docs/legal/app-review-notes.md` as review notes.

---

## Phase 8 — App Store Submission

- [ ] Final EAS production build uploaded via `eas submit --platform ios --profile production` or uploaded manually in App Store Connect.
- [ ] App Store listing copy: app name, subtitle, description, keywords, support URL filled in.
- [ ] What's New text: reflect contents of the latest entry in `CHANGELOG.md`.
- [ ] Submit for review. Monitor for expedited review rejection reasons (see `docs/legal/app-review-notes.md` for pre-empts).

---

## Post-Launch

- [ ] Publish `PrivacyInfo.xcprivacy` tracking opt-out responder if Apple adds new requirements.
- [ ] Monitor for `ITMS-9xxxx` compliance emails from Apple — respond within the stated deadline.
- [ ] When push notifications are enabled (Phase 2), add **Device ID** (push token) to the App Privacy labels.
- [ ] Before any China mainland launch, complete ALL items in `docs/legal/cn-readiness/00-overview.md`.
