# Audit Plan: Settings

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/09-settings-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/components/settings/**
app/settings/**
app/settings/_layout.tsx
src/components/settings/__tests__/**
```

Note: `src/components/settings/SettingsMetaPanels.tsx` has uncommitted changes in the working tree — review the diff and reconcile.

## 2. Out of Scope

- Server profile components covered in plan 03 (`AddServerSheet`, `ServerProfileRow`, `PinnedKeysScreen`, `PinMismatchScreen`)
- Account components covered in plan 14 (`AccountCard`, `AccountSettingsScreen`)
- TTS settings covered in plan 10 (`SettingsTtsSection`, `app/settings/voice.tsx`)
- Conventions settings covered in plan 19 (`SettingsConventionsSection`, `app/settings/conventions.tsx`)
- All other files not listed
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **Security** rule 10 (memory safety on settings navigation); **MVP Feature Scope** §3
2. `docs/audits/_CHECKLIST.md`
3. `docs/audits/_RULES.md`

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] Review `git diff src/components/settings/SettingsMetaPanels.tsx` — understand what changed, verify the change is correct, flag any issues
- [ ] Settings screens restore to previous state correctly on back navigation (no lost changes, no stale displayed values)
- [ ] `CompactSettingsSwitch` toggle state is in sync with underlying preference at all times
- [ ] `GatewayLogsModal` and `LogLineRow`: log display does not crash on malformed log lines
- [ ] `FeedbackSheet` submission: handles network error, shows confirmation, does not double-submit
- [ ] `SignInSheet`: correct hand-off to Supabase auth flow, error states handled
- [ ] `ThemeVariantDropdown`: applying theme persists and takes effect immediately
- [ ] `SettingsEditionSection` / `SettingsMetaPanels`: version info, build number, and edition displayed correctly

### Security (area-specific)

- [ ] Sensitive settings (tokens, keys) cleared from component state when settings screen unmounts
- [ ] `GatewayLogsModal` does not display raw auth tokens from logs
- [ ] `FeedbackSheet` screenshots (if included) do not capture any sensitive UI state (token fields, auth screens)
- [ ] `SignInSheet`: no token logged during OAuth flow

### Performance (area-specific)

- [ ] Settings screen list uses `FlashList` or `FlatList` if it has many rows — not `ScrollView` + map
- [ ] `GatewayLogsModal` virtualizes log lines — not an unbounded scroll of all log entries

### Cleanliness / Maintainability (area-specific)

- [ ] `SettingsScreen.tsx` under ~300 lines; flag if not
- [ ] `SettingsMetaPanels.tsx` — after reviewing the diff, assess cleanliness
- [ ] `SettingsLinkRow` is a reusable primitive — no one-off logic embedded in it
- [ ] No duplicate nav route definitions between `app/settings/` and component-level routing

### Tests (area-specific)

- [ ] Check if any snapshots need refresh after `SettingsMetaPanels.tsx` changes
- [ ] `FeedbackSheet` submission logic has a unit test

### OSS-Readiness (area-specific)

- [ ] No internal feedback endpoint URL hard-coded (must be in env config)
- [ ] No developer email or support address hard-coded in source (or flag for config)
- [ ] App Store / TestFlight URLs not hard-coded if they contain private app IDs

### i18n / Accessibility (area-specific)

- [ ] All settings labels use `t()` keys
- [ ] Toggle switches have `accessibilityRole="switch"` and `accessibilityValue`
- [ ] Navigation to sub-screens: back button has `accessibilityLabel`
- [ ] Settings screen sections have `accessibilityRole="header"` on section titles

## 5. Deliverable

Write output to: `docs/audits/findings/09-settings-findings.md`

Finding IDs: `settings-NNN`.

Include a specific finding for `SettingsMetaPanels.tsx` diff reconciliation (even if no issue found — document it was reviewed).

## 6. Exit Criteria

- [ ] `docs/audits/findings/09-settings-findings.md` written
- [ ] `SettingsMetaPanels.tsx` diff reviewed and documented
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test --selectProjects components` passes
- [ ] Row 09 in `docs/audits/README.md` flipped to `done`
