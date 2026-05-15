# Checklist — First IAP-enabled App Store submission

Use this after `PURCHASES_ENABLED` is set to `true` in [`src/constants/featureFlags.ts`](../../src/constants/featureFlags.ts) and you are ready to ship StoreKit purchases to production.

## Product & keys

1. Register IAP products in App Store Connect (product IDs must match code, e.g. `com.sundaysoftworks.clawboy.founders.lifetime` per plan 13 / RevenueCat dashboard).
2. Replace RevenueCat **Test Store** keys in `app.json` → `expo.extra.revenueCatApiKeyIos` / `revenueCatApiKeyAndroid` with production `appl_…` / `goog_…` keys (see `appstore-003` in `docs/audits/findings/X7-app-store-readiness-findings.md`).
3. Resolve high IAP findings from plan 13 before submission: **`iap-001`** (display prices from StoreKit, not hardcoded strings) and **`iap-002`** (restore flow must surface errors to the user, not swallow them).

## App Store Connect

4. **App Privacy:** add **Purchase History** → collected when applicable → linked to user → not used for tracking → **App Functionality** (and any other types your IAP + webhook flow introduces).
5. **Review notes:** document the **Restore Purchases** path (e.g. Settings → Account → edition section) and sandbox testing notes; remove any "IAP not in this version" language used for the launch build.
6. **Listing:** screenshots and description must reflect purchasable SKUs (guideline 2.1 — no advertising purchases that are not available).

## Native privacy manifest

7. In `app.json` → `expo.ios.privacyManifests` → `NSPrivacyCollectedDataTypes`, add a third entry:

   - `NSPrivacyCollectedDataType` = `NSPrivacyCollectedDataTypePurchaseHistory`
   - `NSPrivacyCollectedDataTypeLinked` = `true`
   - `NSPrivacyCollectedDataTypeTracking` = `false`
   - `NSPrivacyCollectedDataTypePurposes` = `["NSPrivacyCollectedDataTypePurposeAppFunctionality"]`

8. Run `npx expo prebuild --clean` (or your normal CNG flow), then confirm `ios/<Project>/PrivacyInfo.xcprivacy` contains all three collected types.
9. Re-run Xcode **Privacy Report** on a Release archive; reconcile any declarations merged from the RevenueCat / StoreKit dependency chain.

## Legal docs

10. Update [`docs/legal/app-store-privacy-labels.md`](app-store-privacy-labels.md) "Last reviewed" date and ensure the **IAP-enabled** summary table matches Connect.
11. Update [`docs/legal/privacy-policy.md`](privacy-policy.md) effective / last-updated dates if purchase flows or subprocessors change materially.

## Regression

12. `npm test` and a full purchase + restore + sign-out/sign-in path on a sandbox Apple ID before submitting.
