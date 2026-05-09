# Cross-Cutting Plan: App Store Readiness

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/X7-app-store-readiness-findings.md`.
> This plan is primarily analytical — it synthesizes findings from other plans and produces a release go/no-go document.
> Do NOT modify any source or config file.
> Do NOT modify this plan file.

**Run after:** Plans X1 (repo hygiene), X2 (security), X3 (performance), X4 (deps) are `done`. Read all their findings.

---

## 1. Scope

Read-only analysis of:

```
app.json
eas.json
ios/ClawBoy/Info.plist (READ ONLY)
ios/ClawBoy/PrivacyInfo.xcprivacy (READ ONLY)
ios/ClawBoy/ClawBoy.entitlements (READ ONLY)
assets/
docs/audits/findings/** (synthesize prior findings)
```

## 2. Out of Scope

- `node_modules/`
- All source logic files
- `docs/audits/` plan files

## 3. Required Reading

1. All findings docs in `docs/audits/findings/` — read before starting
2. [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — particularly §2 (Safety), §3 (IAP), §4 (Design), §5 (Privacy)
3. [Apple Privacy Manifest requirements](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files)
4. `docs/legal/privacy-policy.md` (if present) — verify app behavior matches privacy policy
5. `docs/audits/_RULES.md`

## 4. App Store Readiness Checklist

### Privacy Manifest (`PrivacyInfo.xcprivacy`)

- [ ] File exists at `ios/ClawBoy/PrivacyInfo.xcprivacy`
- [ ] `NSPrivacyTracking`: set to `false` (app does not track users for advertising)
- [ ] `NSPrivacyTrackingDomains`: empty (no tracking domains)
- [ ] `NSPrivacyCollectedDataTypes`: documents all data types — cross-check with app behavior:
  - [ ] User content (chat messages) — noted if processed server-side
  - [ ] Device identifiers (device ID for pairing)
  - [ ] Usage data (if analytics present)
- [ ] `NSPrivacyAccessedAPITypes`: lists all required-reason API uses:
  - [ ] `NSUserDefaults` (AsyncStorage uses this under the hood)
  - [ ] `NSFileTimestamp` (FileSystem)
  - [ ] `NSSystemBootTime` (if used)
  - [ ] Any other required-reason APIs identified in the codebase

### Permission Usage Descriptions

Final cross-check (plan 22 detailed this — confirm status here):
- [ ] `NSCameraUsageDescription` — present and clearly explains camera use
- [ ] `NSMicrophoneUsageDescription` — present and clearly explains microphone use
- [ ] `NSPhotoLibraryUsageDescription` — present
- [ ] `NSPhotoLibraryAddUsageDescription` — present if saving media
- [ ] `NSSpeechRecognitionUsageDescription` — present
- [ ] All descriptions are in natural language, not developer placeholder text

### App Transport Security

- [ ] `NSAllowsArbitraryLoads` absent or `false` — gateway connections use `wss://` (exempt from ATS)
- [ ] If `NSAllowsArbitraryLoads` is `true`, document justification or flag as `high`

### Export Compliance

- [ ] `ITSAppUsesNonExemptEncryption` — determine correct value:
  - HTTPS/TLS is exempt (standard, public-domain encryption)
  - Ed25519 signing is exempt (authentication use)
  - If value is `YES`, export documentation is required — flag for legal review
  - Recommend `NO` if all encryption is standard/exempt

### App.json / EAS Sanity

- [ ] `expo.version` matches intended release version
- [ ] `expo.ios.buildNumber` is correct for this submission
- [ ] `expo.ios.bundleIdentifier` is the correct production bundle ID
- [ ] `expo.scheme` matches registered URL scheme for auth callback
- [ ] `expo.updates.url` points to production EAS Update channel
- [ ] `expo.updates.runtimeVersion` policy is appropriate for rollback safety
- [ ] `eas.json` production profile: `distribution: "store"`, `credentialsSource: "remote"`

### Assets Checklist

- [ ] App icon (`assets/icon.png`): 1024×1024, no transparency, no rounded corners (Apple adds them), no text that is too small
- [ ] Splash screen asset: present and dimensions correct for Expo SDK 55
- [ ] No placeholder assets (empty PNGs, "TODO" text in images)
- [ ] `assets/brand/` directory: all brand assets finalized

### IAP Compliance (cross-check with plan 13)

- [ ] "Restore Purchases" button accessible from a logical location in UI
- [ ] No prices hard-coded in source — all from `StoreProduct.priceString` at runtime
- [ ] Subscription terms clearly displayed before purchase confirmation
- [ ] App does not unfairly lock functionality that was previously free (unless grandfathered)

### Privacy Policy

- [ ] App links to a valid privacy policy URL (required for App Store submission)
- [ ] `docs/legal/privacy-policy.md` exists — cross-check that described data practices match actual app behavior
- [ ] Privacy policy URL is set in App Store Connect (note: not in-app config, but document that it is needed)

### TestFlight Pre-Check

- [ ] All `critical` findings from plans 01–23 and X1–X6 are resolved or have documented deferral reasons
- [ ] All `high` security findings are resolved or have documented deferral reasons
- [ ] `npm test` passes
- [ ] EAS build can complete: `eas build --platform ios --profile production` (do not run — just verify config is complete)
- [ ] Review Notes: prepare a summary of what reviewers need to know (e.g. "requires connection to a personal OpenClaw gateway to use — demo mode available for review without a gateway")

## 5. Deliverable

Write output to `docs/audits/findings/X7-app-store-readiness-findings.md` AND `docs/audits/findings/release-go-no-go.md`.

Finding IDs: `appstore-NNN`.

### `X7-app-store-readiness-findings.md` structure

Standard findings format (see `_TEMPLATE.md` §5) plus:
- Privacy manifest completeness table
- Permission strings table
- Asset checklist table
- EAS config status table

### `release-go-no-go.md` structure

```markdown
# Release Go / No-Go

Date: YYYY-MM-DD
Status: GO | NO-GO

## Blocker Summary (must be zero for GO)
| ID | Sev | Area | Summary | Status |
|----|-----|------|---------|--------|

## Total Severity Counts (across all findings)
- critical: N (resolved: N | open: N)
- high: N (resolved: N | open: N)
- med: N
- low: N
- nit: N

## Test Status
- All tests passing: YES / NO
- Coverage summary: N% lines, N% branches

## App Store Requirements
- Privacy manifest: PRESENT / MISSING
- All permissions described: YES / NO
- Export compliance: ITSAppUsesNonExemptEncryption = YES/NO, justified: YES/NO
- IAP restore path: PRESENT / MISSING
- Privacy policy URL: READY / NEEDS SETUP

## Recommended Fix Order (before TestFlight build)
1. ...

## Open Deferrals
| ID | Sev | Reason | Owner |
```

## 6. Exit Criteria

- [ ] `docs/audits/findings/X7-app-store-readiness-findings.md` written
- [ ] `docs/audits/findings/release-go-no-go.md` written
- [ ] All prior findings synthesized
- [ ] GO or NO-GO determination made with documented rationale
- [ ] Row X7 in `docs/audits/README.md` flipped to `done`
