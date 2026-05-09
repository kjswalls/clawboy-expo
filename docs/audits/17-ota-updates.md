# Audit Plan: OTA Updates

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/17-ota-updates-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/hooks/useOTAUpdate.ts
src/hooks/useGatewayUpdateNudge.ts
src/components/chat/UpdateNudgeBanner.tsx
scripts/generate-update-cert.sh
certs/ (READ ONLY — do not modify any file here)
app.json (only the `updates` block — read-only for security analysis)
src/hooks/__tests__/ (OTA-related files)
```

## 2. Out of Scope

- `eas.json` — read for analysis only (flag issues, do NOT modify)
- All other files not listed
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **Security** rule 7 (OTA update signing), rule 8 (certificate pinning prep)
2. `docs/audits/_CHECKLIST.md`
3. `docs/audits/_RULES.md`
4. [Expo Updates code signing docs](https://docs.expo.dev/eas-update/code-signing/)

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] `useOTAUpdate`: checks for updates on app foreground or defined interval — not on every render
- [ ] Update available: user is prompted, not silently force-reloaded mid-session
- [ ] Update failed: graceful fallback, no crash, user informed
- [ ] `useGatewayUpdateNudge`: gateway-triggered update nudge correctly triggers OTA check, then dismisses banner
- [ ] `UpdateNudgeBanner`: dismissible, does not reappear until next update is available
- [ ] `app.json` `updates.url` — verify it points to correct EAS Update channel for the build type

### Security (area-specific)

- [ ] **`certs/private-key.pem` must NOT be tracked by git** — run `git log --all --full-history -- certs/private-key.pem` to verify it was never committed
- [ ] `certs/certificate.pem` IS tracked (it is embedded in the binary) — verify it contains only the public cert, not the private key
- [ ] `app.json` `updates.codeSigningCertificate` points to `certs/certificate.pem` — verify the path
- [ ] OTA update signature verification is enabled (`updates.codeSigningMetadata` present and correctly configured)
- [ ] `generate-update-cert.sh` script: key generation command uses strong parameters (≥ 2048-bit RSA or Ed25519); private key output path excluded from git
- [ ] No private key material in any log or error message from `useOTAUpdate`

### Performance (area-specific)

- [ ] OTA update download happens in background — does not block app UI
- [ ] Update check polling interval is reasonable (not too frequent — respects user's data plan)

### Cleanliness / Maintainability (area-specific)

- [ ] `useOTAUpdate` and `useGatewayUpdateNudge` are separate concerns — no interleaving
- [ ] Update check logic under ~100 lines; flag if bloated

### Tests (area-specific)

- [ ] Note: OTA hooks are difficult to unit test (require mocking `expo-updates`) — flag untested paths

### OSS-Readiness (area-specific)

- [ ] `app.json` `updates.url` endpoint is a public EAS URL, not a private/internal update server
- [ ] `generate-update-cert.sh` script works without private credentials being embedded

### i18n / Accessibility (area-specific)

- [ ] `UpdateNudgeBanner` text uses `t()` keys
- [ ] "Update" and "Dismiss" actions have `accessibilityLabel`

## 5. Deliverable

Write output to: `docs/audits/findings/17-ota-updates-findings.md`

Finding IDs: `ota-NNN`.

**Must include finding `ota-CERT`** documenting the result of checking whether `certs/private-key.pem` was ever committed to git history.

## 6. Exit Criteria

- [ ] `docs/audits/findings/17-ota-updates-findings.md` written
- [ ] `ota-CERT` finding present
- [ ] Private key never-committed check completed
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test` passes
- [ ] Row 17 in `docs/audits/README.md` flipped to `done`
