# Audit Plan: Auth & Device Pairing

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/02-auth-pairing-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/lib/device-identity.ts
src/contexts/ConnectionContext.tsx
src/hooks/useConnection.ts
src/hooks/useAutoReconnect.ts
app/auth-callback.tsx
src/lib/__tests__/ (files related to auth / device-identity)
src/hooks/__tests__/ (files related to useConnection / useAutoReconnect)
src/contexts/__tests__/ (files related to ConnectionContext)
```

## 2. Out of Scope

- `src/lib/openclaw/client.ts` — covered in plan 01 (do NOT touch reconnect/backoff/generation logic here)
- All other `src/` files not listed above
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **Security** section (especially rules 1, 5, 6, 7), **WebSocket Protocol Essentials** (challenge-response, device token), **Connection State Model**
2. `docs/audits/_CHECKLIST.md`
3. `docs/audits/_RULES.md`

> **Highest-security plan in the suite.** The Ed25519 keypair and token storage are the root of trust for every user's personal data. Extra caution required. Apply NO auto-fixes to `device-identity.ts` — treat all findings as `proposed`.

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] `ConnectionState` is fully exhaustive: `disconnected`, `connecting`, `connected`, `error`, `pairing_required` — no missing transitions, no silent no-ops
- [ ] `connect.challenge` event: nonce received → signed with Ed25519 → sent in `connect` params before any other request
- [ ] Auth failure path: `auth_failed`, `cert_error`, `timeout` — each surfaces a clear error state, no infinite retry loop
- [ ] `pairing_required` state: `deviceId` is surfaced to UI for user-initiated pairing, not swallowed
- [ ] `deviceToken` returned in `hello-ok.auth`: persisted to secure storage immediately
- [ ] On clean app reinstall (no stored keypair): new keypair generated, pairing flow triggered
- [ ] On stored keypair present: keypair loaded from secure storage, NOT regenerated
- [ ] `useAutoReconnect` respects app background/foreground transitions (no reconnect while backgrounded if policy says don't)

### Security (area-specific)

- [ ] Ed25519 private key: generated once, stored via `expo-secure-store`, NEVER logged, NEVER in component state, NEVER in `AsyncStorage`
- [ ] Private key is never exported or transmitted — only the signature is sent
- [ ] `deviceToken` stored in `expo-secure-store`, never `AsyncStorage`
- [ ] Auth tokens in component state are cleared when navigating away (no stale token in memory)
- [ ] Deeplink auth-callback (`app/auth-callback.tsx`): URL params are validated and sanitized — no open redirect, no token leakage in logs
- [ ] Supabase OAuth callback URL validated against expected scheme before processing
- [ ] `challenge` nonce: used exactly once, not reused across reconnects
- [ ] No `console.log` of tokens, keypairs, nonces, or signed values anywhere in scope

### Performance (area-specific)

- [ ] Ed25519 signing does not block the main thread for perceptible time (async or off-thread)
- [ ] `ConnectionContext` value object is stable between renders (no object recreation on every render)

### Cleanliness / Maintainability (area-specific)

- [ ] `device-identity.ts` is the single place keypair is generated/loaded/signed — no duplication
- [ ] Connection state machine logic is not duplicated between `useConnection.ts` and `ConnectionContext.tsx`
- [ ] `useAutoReconnect` has a single clear trigger/cancel interface

### Tests (area-specific)

- [ ] Challenge-response signing has a unit test (pure function — easy to test)
- [ ] Connection state transitions have hook tests
- [ ] Auth-callback URL validation has a unit test

### OSS-Readiness (area-specific)

- [ ] No hard-coded Supabase project URLs (must come from env or config)
- [ ] No hard-coded OAuth client IDs or redirect URIs in source
- [ ] No developer device IDs or test keypairs committed

### i18n / Accessibility (area-specific)

- [ ] Auth error messages shown to user use `t()` keys
- [ ] Pairing flow UI elements have `accessibilityLabel`

## 5. Deliverable

Write output to: `docs/audits/findings/02-auth-pairing-findings.md`

Finding IDs: `auth-NNN`.

> All findings in `device-identity.ts` must be `proposed` regardless of severity — do NOT auto-fix.

## 6. Exit Criteria

- [ ] `docs/audits/findings/02-auth-pairing-findings.md` written with all sections filled
- [ ] Severity counts accurate
- [ ] Zero auto-fixes applied to `device-identity.ts`
- [ ] All other auto-fixable items fixed or deferred with reason
- [ ] `npm test --selectProjects logic` passes
- [ ] Row 02 in `docs/audits/README.md` flipped to `done`
