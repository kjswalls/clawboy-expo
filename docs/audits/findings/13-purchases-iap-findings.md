---
plan: 13-purchases-iap
date: 2026-05-09
agent: claude-opus-4
status: done
---

# Purchases & In-App Purchases Findings

## Summary

The purchases stack is small and well-structured: a thin `client.ts` configures
RevenueCat from `expo-config` `extra`, a `products.ts` file is the single source
of truth for product IDs and entitlement mapping, and `PurchasesContext.tsx`
owns the runtime tier/offerings state plus the `purchase*` and `restore`
methods. The whole feature is currently gated behind
`PURCHASES_ENABLED = false`, so none of the IAP UI ships at runtime today —
this gives time to fix the issues below before the gate is flipped.

The two material risks for App Store review are: (1) hard-coded
`$9.99` / `$19.99` price labels are shown to the user as a fallback whenever
the RevenueCat offerings payload is unavailable or hasn't loaded yet — Apple
requires the price to come from `StoreProduct.priceString` at runtime — and
(2) the "Restore Purchases" path always reports success (even on failure)
because `restore()` swallows errors internally while its caller's `try/catch`
believes those errors will surface. Both are listed below as
`high`/`proposed`. Everything else is i18n hardening, perf nits, and tests.

## Severity Counts

- critical: 0
- high: 2
- med: 5
- low: 4
- nit: 2

## Findings

| ID | Sev | File:Line | Summary | Recommendation | Status |
|----|-----|-----------|---------|----------------|--------|
| iap-001 | high | src/lib/purchases/products.ts:23, 44 + src/components/settings/SettingsEditionSection.tsx:45-55, 113 | Hard-coded `$9.99` / `$19.99` `defaultPriceLabel` is rendered to the user as the fallback whenever `offerings === null` (still loading, RC misconfigured, or no matching package). Violates App Store §3.1.1 / §3.1.2 (price must come from StoreKit at runtime) and breaks localized currency for any non-USD App Store storefront. | Remove `defaultPriceLabel` from `OneTimeProductMeta` (or rename to `internalPriceMemo` and never render it). Update `priceFor` to return `null`/empty and have the card render a skeleton or a `t('settings.edition.priceLoading')` placeholder instead. Disable the CTA until the real `priceString` is available (`isLoading || !priceString`). | proposed |
| iap-002 | high | src/contexts/PurchasesContext.tsx:297-305 + src/components/settings/SettingsEditionSection.tsx:214-224 | `restore()` swallows all RC errors internally (`} catch { /* Non-fatal */ }`). The caller wraps `await restore()` in `try/catch` and only shows `restoreFailedBody` from the catch branch — but that branch is unreachable, so users always see "Purchases Restored" even when the network failed, the user has no purchases, or RC threw. App reviewers tapping "Restore" with no purchase will see a misleading "restored" alert. | Change `restore` to return a discriminated `RestoreResult` (`{ status: 'success'; tier } \| { status: 'no-purchases' } \| { status: 'error'; message }`). Have `SettingsEditionSection` branch on the status to choose the alert. Comment in `restore` that promises caller-side feedback is also misleading and should be replaced. (Public API change → `proposed`, do not auto-fix.) | proposed |
| iap-003 | med | src/contexts/PurchasesContext.tsx:307-318 | Context `value` is a fresh object every render. Combined with `foundersWindowOpen: isFoundersWindowOpen(foundersLaunchAt)` recomputing inline (returns a new boolean each call but the identity churn still propagates), every `usePurchases()` consumer re-renders on every Provider re-render — including ones that only read `tier`. With this provider mounted at the root in `app/_layout.tsx`, that affects `AccountSection`, `AccountSettingsScreen`, badges hooks, `BadgesProvider`, `TrophyShelfScreen`, and `BadgeDetailModal`. | Wrap the value in `useMemo` keyed on `[tier, isLoading, offerings, foundersLaunchAt, windowRemainingMs, foundersPurchasedAt, purchaseFounders, purchasePro, restore]`. (Identity change to a context value — `proposed` per `_RULES.md` "If unsure, write as proposed".) | proposed |
| iap-004 | med | src/components/common/FoundersCountdown.tsx:16-23, 50-56 | Time units `d`, `h`, `m` are hard-coded English. Non-Latin locales (zh-CN, ar, etc.) will show ASCII letters next to localized digits. The `endsIn` label is translated, but the value next to it isn't. | Add three new keys (e.g. `settings.edition.founders.countdown.daysShort` / `hoursShort` / `minutesShort`) and format with `t('...{{n}}')`. Adding i18n keys requires human sign-off per `_RULES.md` ("Any change to i18n key names or locale file structure"), so propose only. | proposed |
| iap-005 | med | src/contexts/PurchasesContext.tsx:263, 274, 281, 292 | Hard-coded English error messages (`'Founders Edition is not available'`, `'ClawBoy Pro is not available'`, `'Purchase failed'`) flow into `result.message` and are rendered as the body of the user-facing `Alert.alert(t('settings.edition.purchaseFailed'), result.message ?? '')`. Bypasses i18n. | Return error codes/keys (`{ status: 'error'; messageKey: 'settings.edition.errors.notAvailable' }`) and translate at the UI layer, or accept a `t()` function injected into the hook. Propose, do not auto-fix (touches public hook return shape + adds locale keys). | proposed |
| iap-006 | med | src/lib/purchases/ (no tests) + src/contexts/PurchasesContext.tsx (no tests) | No tests exist for any purchases code. Pure functions `resolveTier`, `isFoundersWindowOpen`, `foundersWindowRemainingMs`, `tierFromCustomerInfo`, `foundersOriginalPurchaseDate`, `findPackageForProductId`, and `priceFor` are trivially unit-testable. RC SDK is already wildcard-mocked at `react-native-purchases` → `expo-module.js` in `jest.config.js`, so even integration-style tests of the provider are possible. | Add `src/lib/purchases/__tests__/products.test.ts` covering the four pure helpers + `tierFromCustomerInfo`. Add `src/contexts/__tests__/PurchasesContext.test.tsx` covering disabled-stub return, restore happy/sad paths, and tier upgrade via the customerInfo listener. Test additions beyond trivial snapshot refreshes are explicitly `proposed` per `_RULES.md`. | proposed |
| iap-007 | med | src/contexts/PurchasesContext.tsx:266, 284 | `Purchases.purchasePackage` returns the updated `customerInfo` synchronously with the purchase. The code discards the return value and relies entirely on `addCustomerInfoUpdateListener` firing after the await. If the listener is somehow torn down or delayed, the UI will not update for an extra event-loop turn. | After `const { customerInfo } = await Purchases.purchasePackage(pkg);` set tier/foundersPurchasedAt directly from it as well as via the listener (idempotent). Behavioral change → propose. | proposed |
| iap-008 | low | app.json:102-103 (out of plan scope; reference only) | RevenueCat SDK keys are committed in `app.json` `extra`. They are currently the public test-store keys (`test_…`), which by RevenueCat's policy are safe to ship in client bundles (same posture as a Supabase anon key). However, the plan checklist explicitly asks for confirmation. The keys ARE read from config (`Constants.expoConfig?.extra`) — the rule "API key from env / config, not source" is satisfied. The committed values are public client identifiers, not secrets. **No leak; record this here so X1 / X2 don't flag it again.** | No code change. When swapping to production keys, replace with `appl_…` / `goog_…` (also public). Edit is in `app.json` which is owned by plan 22 / X1 — out of this plan's scope. | deferred |
| iap-009 | low | src/components/common/FoundersCountdown.tsx:38-45 | The `setInterval` inside `FoundersCountdown` is effectively dead code. The interval callback recomputes `formatRemaining(remainingMs)` from a closed-over value of `remainingMs` that does not change between effect runs, so each tick writes the same string back to state. The actual update mechanism is the parent `PurchasesContext` updating `windowRemainingMs` every 60s, which re-runs this effect via `[remainingMs]`. | Either drop the `setInterval` entirely (parent already drives updates), or change the interval to recompute against `Date.now()` directly. Behavioral / animation timing change → propose, do not auto-fix. | proposed |
| iap-010 | low | src/contexts/PurchasesContext.tsx (336 lines) | File is 336 lines, just over the ~300-line guideline. Three logical sections: configure-on-mount + initial fetch, RC listener + sign-in alias, purchase/restore methods. Splitting would help testability. | Candidate split: extract `useFoundersWindow(launchAt)` hook to a sibling file, leave the rest. Per `_RULES.md`, splits must be `proposed`, not auto-applied. | proposed |
| iap-011 | low | src/contexts/PurchasesContext.tsx (whole file) imports `Purchases` directly | The plan's cleanliness check states "`purchases/client.ts` is the single place RevenueCat SDK is accessed — no direct SDK calls in components". The provider is technically "wiring" not a "component", and `client.ts` only owns `configurePurchases()`. The other RC entry points (`getCustomerInfo`, `getOfferings`, `addCustomerInfoUpdateListener`, `logIn`, `logOut`, `purchasePackage`, `restorePurchases`) all live in the provider. UI components (`SettingsEditionSection.tsx`, `FoundersCountdown.tsx`, `AccountSection.tsx`, `AccountSettingsScreen.tsx`, `TrophyShelfScreen.tsx`, `BadgeDetailModal.tsx`, `BadgesProvider.tsx`, `badges/hooks.ts`) only import RC for **types** (or not at all), which is the spirit of the rule. | If consolidating, move the SDK calls into `client.ts` as named functions (`getOfferings`, `purchasePackage`, `restorePurchases`, `logIn`, `logOut`, `addListener`) and have the provider call only those. This is a refactor → `proposed`. | proposed |
| iap-012 | nit | src/contexts/PurchasesContext.tsx:303 | Comment `// Non-fatal — let callers handle UI feedback.` is misleading: callers can't actually feed back, because the error is swallowed before it reaches them (see iap-002). | Comment should match the chosen fix in iap-002. Not auto-fixing the comment alone because it would mask the real bug. | deferred |
| iap-013 | nit | src/lib/purchases/products.ts:17, 38 | JSDoc comments include literal `$9.99` / `$19.99`. These are documentation only (not user-visible) but become stale if pricing changes. | Reword to "see App Store Connect for current price" or remove the figures. Low priority. Not a hard-coded user-visible price — `defaultPriceLabel` is the user-visible one (iap-001). | proposed |

## Auto-Fixes Applied

None. All applicable issues either touch a public API shape, a context value
identity, an i18n key surface, or test additions — every one of those is
gated as `proposed` per `_RULES.md` ("Proposed fixes" and meta-rule §1: "If
unsure whether a fix is allowed, write it as a proposed fix and do NOT apply
it"). The cleanliness scan turned up no unused imports, no commented-out
code, no `console.log` calls of sensitive data, no `any` types that would
narrow safely, and no narrative-only comments that aren't doing real
explanatory work.

## Open Questions for Human

1. **Price fallback (iap-001).** Is "show no price + disabled CTA until offerings load" the desired UX, or do you want a marketing fallback (e.g. "from $9.99") that's more App Store-defensible? The cleanest path is empty/skeleton.
2. **Restore semantics (iap-002).** Apple's docs allow "no purchases to restore" to be communicated as a neutral message. Should that be a separate alert ("No purchases to restore") or fold into the success path?
3. **`PURCHASES_ENABLED` flip date.** When you flip `PURCHASES_ENABLED` to `true`, also flip the `revenueCatApiKeyIos` / `revenueCatApiKeyAndroid` in `app.json` from `test_…` to the real `appl_…` / `goog_…` keys. (Out of this plan's scope to edit.)
4. **`foundersOriginalPurchaseDate` fallback (PurchasesContext.tsx:91-96).** Should we really fall back to `latestPurchaseDate` if `originalPurchaseDate` is missing, or fail closed and force a restore? RC's contract is that `originalPurchaseDate` is always populated for active entitlements, so the fallback is dead code in practice.

## Test Impact

- `npm test` — see "Test result" below.
- No new tests added by this audit (per `_RULES.md`: test additions beyond
  trivial snapshot refreshes go in the proposed list, not in this commit).
  See iap-006 for the proposed test plan.

### Test result

`npm test` (both `logic` and `components` Jest projects):

```
Test Suites: 3 failed, 57 passed, 60 total
Tests:       14 failed, 894 passed, 908 total
Snapshots:   9 failed, 40 passed, 49 total
```

**All 14 failures are pre-existing and outside the purchases scope** — verified
by stashing this audit's changes and re-running:

- `src/lib/chatCache/__tests__/validateBlob.test.ts` (logic) — blob version
  migration assertion mismatch (chatCache scope; plan 04).
- `src/components/chat/__tests__/InternalEventCard.test.tsx` (components) —
  snapshot drift; chat scope; plan 04.
- `src/components/chat/__tests__/MessageBubble.test.tsx` (components) — snapshot
  drift; the diffs are timestamp-locale dependent (`4:00 AM` vs `12:00 PM`),
  i.e. these snapshots were captured in a different `TZ` than the current
  runner. Chat scope; plan 04.

No purchases tests exist (and none were added — see iap-006 for the proposed
test plan). This audit's diff is **docs-only** (`findings/13-purchases-iap-findings.md`
and the README status flip), so the failure set is identical with or without
this audit's changes.
