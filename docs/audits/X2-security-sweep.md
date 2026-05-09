# Cross-Cutting Plan: Security Sweep

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/X2-security-sweep-findings.md`.
> Safe auto-fixes (log removal, `AsyncStorage` → `expo-secure-store` for sensitive data) are allowed.
> Do NOT modify auth/crypto files. All auth/crypto findings are `proposed`.
> Do NOT modify this plan file.

**Run after:** Plans 01, 02, 03, 13, 14, 17 are `done`. Read their findings for context before starting.

---

## 1. Scope

All source files under `src/` and `app/` — read-only scan with targeted fixes.

## 2. Out of Scope

- `node_modules/`
- `infra/` — covered in plan 18 for feedback worker; no edits here
- `ios/` — covered in plan 22
- `supabase/migrations/` — covered in plan 23
- `docs/audits/` plan and findings files

## 3. Required Reading

1. `.cursorrules` — **Security** section, rules 1–10, in full
2. All findings from plans 01, 02, 03, 13, 14, 17 in `docs/audits/findings/`
3. `docs/audits/_RULES.md`

## 4. Security Checks

### Token & Secret Storage

- [ ] `rg "AsyncStorage" src/ app/` — for every hit, verify the stored data is non-sensitive (preferences/cache only); flag any sensitive data stored in `AsyncStorage` as `critical`
- [ ] `rg "expo-secure-store" src/ app/` — enumerate all secure-store usages; verify all are for secrets/tokens/keys
- [ ] Confirm: gateway token, device token, Supabase session, Ed25519 private key → all in `expo-secure-store`
- [ ] Confirm: theme preference, language preference, draft text → `AsyncStorage` (correct)

### Console Log Audit

- [ ] `rg "console\.(log|warn|info)" src/ app/` — for every hit:
  - [ ] Is it in a `__DEV__` guard? (acceptable)
  - [ ] Does it log any auth token, device key, user PII, or message content? → `critical`
  - [ ] Does it log non-sensitive debug info outside `__DEV__`? → `low` — auto-remove
- [ ] `rg "console\.error" src/ app/` — errors are allowed; verify they don't include sensitive data in the error object

### WebSocket Frame Validation

- [ ] `src/lib/openclaw/client.ts`: locate the `onmessage` handler; verify every incoming frame is parsed and validated before acting
- [ ] Verify: unknown frame `type` values are handled (ignored or logged, not acted on)
- [ ] Verify: malformed JSON does not crash the client (wrapped in try/catch)
- [ ] Verify: `chat` events are only processed for the expected session ID

### Deeplink / Auth Callback

- [ ] `app/auth-callback.tsx`: verify all URL params are validated (no open redirect)
- [ ] `app/_layout.tsx` (deep link handler): verify URL scheme handling validates the incoming URL structure before routing

### Clipboard Hygiene

- [ ] Search for `expo-clipboard` usages: `rg "Clipboard" src/ app/`
- [ ] For any clipboard write of sensitive data (token, key): verify there is a clear timeout or user warning

### Certificate Pinning End-to-End

- [ ] `modules/expo-pinned-websocket/` — confirm pinning module exists and is used (not bypassed)
- [ ] `src/hooks/useConnection.ts` or `src/lib/openclaw/client.ts` — confirm pinned WS is used, not the standard `WebSocket`
- [ ] Confirm pin hash is loaded from `expo-secure-store` (TOFU model) or hardcoded in binary correctly — not from a plain-text config file that could be tampered with

### OTA Update Signature

- [ ] `app.json` `updates.codeSigningCertificate` points to `certs/certificate.pem`
- [ ] `certs/certificate.pem` tracked, `certs/private-key.pem` NOT tracked — verify with `git ls-files certs/`
- [ ] `expo-updates` runtime version configured correctly for rollback safety

### IAP Receipt Validation

- [ ] `src/lib/purchases/` — confirm RevenueCat handles server-side receipt validation (not client-only)
- [ ] No `entitlements.isActive` override or bypass in non-test code

### Memory Safety

- [ ] `src/components/settings/` — verify sensitive data (tokens shown during setup) cleared on unmount
- [ ] `src/components/onboarding/` — token entered during onboarding not retained in component state after submission

## 5. Deliverable

Write output to: `docs/audits/findings/X2-security-sweep-findings.md`

Finding IDs: `sec-NNN`.

Include:
- `AsyncStorage` usage table (key | data type | sensitive? | verdict)
- Console log audit summary (total hits | `__DEV__` guarded | unguarded non-error | unguarded sensitive)
- WS frame validation assessment
- Cert pinning end-to-end status
- OTA signing status

## 6. Exit Criteria

- [ ] `docs/audits/findings/X2-security-sweep-findings.md` written
- [ ] All `critical` and `high` items documented
- [ ] No auth/crypto files modified
- [ ] Safe log removal auto-fixes applied and logged
- [ ] Row X2 in `docs/audits/README.md` flipped to `done`
