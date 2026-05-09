# Audit Plan: Server Profiles & Connection Settings

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/03-server-profiles-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/contexts/ServerProfileSyncContext.tsx
src/hooks/useServerConfig.tsx
src/hooks/useGatewayConnectionTest.ts
src/lib/pickBestServerProfile.ts
src/components/settings/AddServerSheet.tsx
src/components/settings/ServerProfileRow.tsx
src/components/settings/PinMismatchScreen.tsx
src/components/settings/PinnedKeysScreen.tsx
src/hooks/__tests__/ (files related to useServerConfig)
src/components/settings/__tests__/ (files related to above components)
```

## 2. Out of Scope

- `src/lib/openclaw/client.ts` — covered in plan 01
- `src/lib/device-identity.ts` — covered in plan 02
- All other `src/` files not listed above
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **Security** rules 1–3, 8 (cert pinning), **Connection State Model**
2. `docs/plans/tofu-spki-pinning-followup.md` (if present) — cert/SPKI pinning design
3. `docs/audits/_CHECKLIST.md`
4. `docs/audits/_RULES.md`

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] Multiple server profiles: switching profiles tears down old WS connection before establishing new one
- [ ] `pickBestServerProfile` handles empty profile list, single profile, and multiple profiles with reachability data
- [ ] Connection test in `useGatewayConnectionTest`: result does not affect live connection state
- [ ] Profile changes persisted atomically — partial writes do not corrupt stored profile list
- [ ] SPKI/cert pin mismatch: `PinMismatchScreen` shown, connection blocked, user given clear recovery path
- [ ] URL normalization: trailing slashes, `http://` → `wss://` coercion, port handling

### Security (area-specific)

- [ ] Gateway tokens stored in `expo-secure-store` keyed per profile, NOT in `AsyncStorage`
- [ ] `http://` and `ws://` URLs trigger prominent warning in `AddServerSheet`; `wss://` is the default
- [ ] Cert pin (SPKI hash) stored in `expo-secure-store` — never in `AsyncStorage`
- [ ] Pin mismatch is a hard block, not a dismissible warning
- [ ] No token logged or included in error messages shown to user
- [ ] `AddServerSheet` input does not auto-correct or auto-complete in a way that leaks the token to autocomplete history (use `secureTextEntry` or `autoComplete="off"` on token field)

### Performance (area-specific)

- [ ] `ServerProfileSyncContext` value is stable between renders — no new object reference on every provider render
- [ ] Connection test is debounced or cancellable — rapid URL input does not spawn unbounded test connections

### Cleanliness / Maintainability (area-specific)

- [ ] `useServerConfig` is the single owner of profile CRUD — no profile mutations outside it
- [ ] `pickBestServerProfile` is a pure function (no side effects) — easy to test
- [ ] `AddServerSheet` under ~300 lines; flag if not

### Tests (area-specific)

- [ ] `pickBestServerProfile` has unit tests (pure function — all paths)
- [ ] URL normalization/validation logic has unit tests

### OSS-Readiness (area-specific)

- [ ] No hard-coded default gateway URLs (e.g. developer's local IP or Tailscale address)
- [ ] No developer's personal profile data in demo data or fallback constants

### i18n / Accessibility (area-specific)

- [ ] Token input field has `accessibilityLabel` (but NOT `secureTextEntry` replacement that leaks)
- [ ] Error messages in profile UI use `t()` keys
- [ ] "Add server" button has `accessibilityRole="button"` and meaningful label

## 5. Deliverable

Write output to: `docs/audits/findings/03-server-profiles-findings.md`

Finding IDs: `profiles-NNN`.

## 6. Exit Criteria

- [ ] `docs/audits/findings/03-server-profiles-findings.md` written with all sections filled
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test` passes
- [ ] Row 03 in `docs/audits/README.md` flipped to `done`
