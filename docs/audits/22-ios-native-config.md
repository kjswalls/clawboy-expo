# Audit Plan: iOS Native Config & App Store Requirements

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/22-ios-native-config-findings.md`.
> **All files in this plan are READ-ONLY for analysis.** Do NOT modify any native config file.
> Do NOT modify this plan file.

---

## 1. Scope

```
ios/ClawBoy/ (READ ONLY — plist files, entitlements, native source headers)
app.json (READ ONLY)
eas.json (READ ONLY)
```

Key files to check:
- `ios/ClawBoy/Info.plist` — permissions, ATS, URL schemes
- `ios/ClawBoy/ClawBoy.entitlements` — entitlements
- `ios/ClawBoy/PrivacyInfo.xcprivacy` — Apple privacy manifest (required since May 2024)
- `app.json` — Expo config (permissions, scheme, splash, etc.)
- `eas.json` — build profiles

## 2. Out of Scope

- `ios/Pods/` — do not read
- `ios/build/` — do not read
- All `src/` files not listed
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. [Apple Privacy Manifest requirements](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files) — required since May 1, 2024
2. [App Store Review Guidelines §5.1 (Privacy)](https://developer.apple.com/app-store/review/guidelines/#privacy)
3. [Required Reason APIs list](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_use_of_required_reason_api)
4. `.cursorrules` — **Security** rules
5. `docs/audits/_CHECKLIST.md`
6. `docs/audits/_RULES.md`

> All findings are `proposed` — config changes require a new native build.

## 4. Concern Checklist

### Correctness

- [ ] `Info.plist` usage description strings are present and accurate for every permission the app requests:
  - [ ] `NSCameraUsageDescription` (camera for photo attachments)
  - [ ] `NSMicrophoneUsageDescription` (microphone for voice input)
  - [ ] `NSPhotoLibraryUsageDescription` (photo library read)
  - [ ] `NSPhotoLibraryAddUsageDescription` (photo library write / save media)
  - [ ] `NSSpeechRecognitionUsageDescription` (speech recognition for transcription)
  - [ ] Any other permission used by the app — check `app.json` `expo.ios.infoPlist` for full list
- [ ] URL scheme for auth callback (`app.json` `expo.scheme`) matches what is registered in `Info.plist` and in Supabase OAuth config
- [ ] `CFBundleVersion` and `CFBundleShortVersionString` match `app.json` `version` and `buildNumber`
- [ ] ATS (`NSAppTransportSecurity`): if `NSAllowsArbitraryLoads` is set, document the justification; ideally remove it

### Security

- [ ] `ITSAppUsesNonExemptEncryption` key in `Info.plist`: must be `NO` (or `YES` with export compliance docs) — ClawBoy uses HTTPS/TLS but that is exempt; Ed25519 signing may or may not be exempt — flag for legal review
- [ ] No sensitive data in `Info.plist` (no API keys, tokens, or private URLs)
- [ ] Entitlements are minimal: only entitlements actually used are present (e.g. `aps-environment` for push, no unnecessary iCloud/keychain-sharing entitlements)
- [ ] `PrivacyInfo.xcprivacy` present and complete:
  - [ ] `NSPrivacyCollectedDataTypes` — lists all data types collected
  - [ ] `NSPrivacyAccessedAPITypes` — lists all required-reason APIs used (UserDefaults, FileTimestamp, etc.)
  - [ ] `NSPrivacyTracking` set correctly (`false` unless tracking for ad purposes)
  - [ ] `NSPrivacyTrackingDomains` empty or accurate

### EAS Build Config

- [ ] `eas.json` production profile uses correct distribution (`store`) and iOS credentials source
- [ ] No internal Expo account name, org name, or project ID embedded in EAS config in a way that conflicts with open-source use
- [ ] Build profiles correctly separated (development, preview, production)

### App Store Readiness

- [ ] `app.json` `expo.ios.bundleIdentifier` is the correct production bundle ID
- [ ] `app.json` `expo.ios.buildNumber` is set and consistent with planned App Store submission
- [ ] Splash screen and app icon assets present in `assets/` and referenced correctly
- [ ] App does not claim capabilities it doesn't use (e.g. do not list HealthKit if unused)

### OSS-Readiness

- [ ] `eas.json` does not contain Expo account credentials or project secrets
- [ ] `Info.plist` permission strings are generic (not "Kirby's app uses…")

## 5. Deliverable

Write output to: `docs/audits/findings/22-ios-native-config-findings.md`

Finding IDs: `ios-NNN`.

Include a table: permission key | present in Info.plist | description adequate | matches app.json.

All findings are `proposed` — do NOT modify any config files.

## 6. Exit Criteria

- [ ] `docs/audits/findings/22-ios-native-config-findings.md` written
- [ ] All permission strings checked and documented
- [ ] `PrivacyInfo.xcprivacy` presence and completeness documented
- [ ] `ITSAppUsesNonExemptEncryption` finding documented
- [ ] No native files modified
- [ ] Severity counts accurate
- [ ] Row 22 in `docs/audits/README.md` flipped to `done`
