# Audit Plan: Onboarding

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/08-onboarding-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/components/onboarding/**
app/onboarding.tsx
src/components/onboarding/__tests__/**
```

## 2. Out of Scope

- `src/lib/device-identity.ts` — covered in plan 02
- `src/hooks/useServerConfig.tsx` — covered in plan 03
- All other files not listed
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **Security** rules 1, 2, 5; **MVP Feature Scope** §4 (device pairing flow)
2. `docs/audits/_CHECKLIST.md`
3. `docs/audits/_RULES.md`

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] First-run detection is reliable — re-running onboarding on fresh install works without leftover state
- [ ] Onboarding completion sets a persisted flag so it does not re-show on next launch
- [ ] Each step validates its own inputs before enabling "Next" — no partial state forwarded
- [ ] Pairing step: correct hand-off to the pairing flow in `device-identity.ts`; errors surface clearly
- [ ] `AchievementsOptInStep`: opt-out stores preference and does not re-prompt
- [ ] Navigation from onboarding to main chat is a one-way transition (no back button back into onboarding after completion)
- [ ] `OnboardingScreen.tsx` is flagged as a split candidate at 1101 lines — note all logical sections for proposed split

### Security (area-specific)

- [ ] Server URL and token entered during onboarding stored in `expo-secure-store` immediately after validation, not held in component state longer than necessary
- [ ] Token input field uses `secureTextEntry` (or equivalent) to prevent shoulder surfing
- [ ] `AgentsMdPreviewModal`: renders markdown safely, no raw HTML

### Performance (area-specific)

- [ ] Onboarding animations use Reanimated, not JS-thread `Animated`
- [ ] `OnboardingScreen.tsx` at 1101 lines is a performance risk during initial parse — flag for split

### Cleanliness / Maintainability (area-specific)

- [ ] **`OnboardingScreen.tsx` (1101 lines) must be flagged as a HIGH-priority split candidate.** Identify the logical step boundaries and propose a split into step sub-components. Do NOT execute the split — write the proposed structure in findings.
- [ ] Each step is self-contained: its own validation, its own state, minimal props
- [ ] No business logic in `app/onboarding.tsx` (should be thin Expo Router wrapper)

### Tests (area-specific)

- [ ] Check snapshot tests are fresh — 1101-line component is a common source of stale snapshots
- [ ] Each step's validation logic has a unit test (or note the gap)

### OSS-Readiness (area-specific)

- [ ] No developer's gateway URL pre-filled as default
- [ ] No personal QR code or device ID embedded in example screenshots/assets

### i18n / Accessibility (area-specific)

- [ ] All step headings and body copy use `t()` keys
- [ ] "Next" / "Back" buttons have `accessibilityLabel`
- [ ] Step progress indicator has `accessibilityValue` to announce current step to VoiceOver

## 5. Deliverable

Write output to: `docs/audits/findings/08-onboarding-findings.md`

Finding IDs: `onboarding-NNN`.

Special required finding: include `onboarding-SPLIT` — a proposed file split for `OnboardingScreen.tsx`, with the step names and approximate line ranges.

## 6. Exit Criteria

- [ ] `docs/audits/findings/08-onboarding-findings.md` written
- [ ] `onboarding-SPLIT` finding present with proposed structure
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test --selectProjects components` passes
- [ ] Row 08 in `docs/audits/README.md` flipped to `done`
