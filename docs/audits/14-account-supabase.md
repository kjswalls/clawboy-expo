# Audit Plan: Account & Supabase

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/14-account-supabase-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/lib/supabase/**
src/contexts/AccountContext.tsx
src/components/settings/AccountCard.tsx
src/components/settings/AccountSettingsScreen.tsx
src/components/settings/SignInSheet.tsx
supabase/migrations/**
src/lib/supabase/__tests__/ (if present)
src/contexts/__tests__/ (account-related files)
```

## 2. Out of Scope

- `infra/supabase/` edge functions — covered in plan 23
- `src/lib/purchases/` — covered in plan 13
- All other files not listed
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **Security** rules 1, 2, 6 (session token expiry)
2. `docs/plans/database-and-accounts.md` (if present) — account/DB design
3. `docs/audits/_CHECKLIST.md`
4. `docs/audits/_RULES.md`

> Do NOT modify any SQL migration files — treat all migration findings as `proposed`.

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] Supabase session: refresh token rotation handled correctly — expired session triggers re-auth, not a crash
- [ ] `serverPointers.ts`: server pointer sync is idempotent — re-syncing does not create duplicates
- [ ] Sign-in flow: Apple Sign-In and email sign-in both route to the same account context state
- [ ] Sign-out: clears session from `expo-secure-store` AND from Supabase SDK local storage
- [ ] Account deletion (if supported): cascades correctly, removes all server pointers
- [ ] Offline: account features degrade gracefully, no crash when Supabase is unreachable

### Security (area-specific)

- [ ] Supabase access token stored in `expo-secure-store` via `secureStorage.ts` adapter — verify the adapter is correct
- [ ] Supabase URL and anon key: anon key is safe to commit (it's public), but verify no service role key is present anywhere in source
- [ ] `secureStorage.ts`: implements Supabase `Storage` interface correctly — no plaintext fallback
- [ ] Apple Sign-In: nonce generated correctly and validated
- [ ] OAuth redirect URL validated against known schemes before processing
- [ ] No user PII (email, name) logged to console

### Performance (area-specific)

- [ ] `AccountContext` does not re-render the entire tree on every auth state change (use `useMemo` / `useCallback` correctly)
- [ ] Supabase client initialized once — not re-created on render

### Cleanliness / Maintainability (area-specific)

- [ ] `src/lib/supabase/client.ts` is the single Supabase client instance
- [ ] `secureStorage.ts` is the only place Supabase session tokens are stored — no duplication

### Tests (area-specific)

- [ ] `serverPointers.ts` sync logic has unit tests
- [ ] Supabase client is mockable in tests (verify the mock setup in `jest.setup.js`)

### OSS-Readiness (area-specific)

- [ ] Supabase project URL and anon key come from env (`.env.local`) — not hard-coded in `src/lib/supabase/client.ts`
- [ ] No service role key anywhere in source (grep for `service_role`)
- [ ] No private user IDs or email addresses in migration files or seed data

### i18n / Accessibility (area-specific)

- [ ] Sign-in sheet copy uses `t()` keys
- [ ] "Sign in with Apple" button has correct `accessibilityLabel`
- [ ] Account deletion confirmation uses `Alert.alert` with descriptive title/message

## 5. Deliverable

Write output to: `docs/audits/findings/14-account-supabase-findings.md`

Finding IDs: `account-NNN`.

Migration findings must be `proposed` — do NOT modify SQL files.

## 6. Exit Criteria

- [ ] `docs/audits/findings/14-account-supabase-findings.md` written
- [ ] No service role key found in source (or flagged as critical)
- [ ] `secureStorage.ts` adapter verified correct
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test` passes
- [ ] Row 14 in `docs/audits/README.md` flipped to `done`
