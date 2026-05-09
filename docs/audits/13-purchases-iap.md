# Audit Plan: Purchases & In-App Purchases

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/13-purchases-iap-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/lib/purchases/**
src/contexts/PurchasesContext.tsx
src/hooks/__tests__/ (purchases-related files)
src/lib/purchases/__tests__/ (if present)
```

Also identify and include any paywall or upgrade UI components (search for `PurchasesContext` usages to locate them).

## 2. Out of Scope

- `src/components/badges/` — covered in plan 15 (badges are the unlock reward, not the purchase mechanism)
- All other files not listed
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **Security** rules 1, 2; **MVP Feature Scope** (purchases not in MVP, but present)
2. [App Store Review Guidelines §3 (In-App Purchases)](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase) — know the rules
3. `docs/audits/_CHECKLIST.md`
4. `docs/audits/_RULES.md`

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] **Restore purchases path exists and works** — App Store requires this; must be user-accessible
- [ ] Purchase completion: entitlement granted immediately on successful purchase, not after app restart
- [ ] Purchase failure: clear error message shown, no false entitlement granted
- [ ] `PurchasesContext` initializes correctly on cold start — no race between RevenueCat SDK init and entitlement check
- [ ] Subscription expiry: entitlement revoked promptly when subscription lapses (on next app open or background fetch)
- [ ] Offline behavior: previously granted entitlements still work when offline (no server-side check required for every launch)
- [ ] `products.ts`: product identifiers match App Store Connect configuration — document them, flag any mismatch

### Security (area-specific)

- [ ] Receipt validation is server-side (RevenueCat handles this) — verify no client-side-only receipt check
- [ ] **No prices hard-coded in source** — prices must come from `StoreProduct.priceString` at runtime (App Store rules)
- [ ] No product identifier strings logged to console
- [ ] Entitlement state not stored in `AsyncStorage` as a trusted source — RevenueCat SDK is the authority

### Performance (area-specific)

- [ ] RevenueCat SDK init is non-blocking to app startup — deferred if not on paywall screen
- [ ] `PurchasesContext` does not cause root provider re-renders on entitlement polling

### Cleanliness / Maintainability (area-specific)

- [ ] `purchases/client.ts` is the single place RevenueCat SDK is accessed — no direct SDK calls in components
- [ ] `purchases/types.ts` defines all entitlement / product types used in the app

### Tests (area-specific)

- [ ] Note: purchases are difficult to unit test without mocking RevenueCat SDK — flag untested paths
- [ ] Mock RevenueCat client exists or is proposed for testing

### OSS-Readiness (area-specific)

- [ ] RevenueCat API key must come from env / config, not hard-coded in source
- [ ] Product identifiers are named constants, not inline magic strings — safe to make public
- [ ] No subscription price tiers or promo codes hard-coded in source

### i18n / Accessibility (area-specific)

- [ ] Paywall / upgrade UI uses `t()` keys for all copy
- [ ] "Restore Purchases" button has `accessibilityLabel`
- [ ] Purchase confirmation dialogs have `accessibilityLabel` on confirm/cancel

## 5. Deliverable

Write output to: `docs/audits/findings/13-purchases-iap-findings.md`

Finding IDs: `iap-NNN`.

## 6. Exit Criteria

- [ ] `docs/audits/findings/13-purchases-iap-findings.md` written
- [ ] "Restore purchases" path documented as working or flagged as missing
- [ ] No hard-coded prices found (or all instances flagged)
- [ ] RevenueCat API key confirmed not in source (or flagged as critical)
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test` passes
- [ ] Row 13 in `docs/audits/README.md` flipped to `done`
