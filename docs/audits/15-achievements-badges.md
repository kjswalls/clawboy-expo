# Audit Plan: Achievements & Badges

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/15-achievements-badges-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/components/badges/**
app/settings/achievements.tsx
src/components/onboarding/AchievementsOptInStep.tsx
src/components/badges/__tests__/ (if present)
```

## 2. Out of Scope

- `src/lib/purchases/` — covered in plan 13 (IAP unlocks are separate from badge display)
- All other files not listed
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — general cleanliness, component size limits
2. `docs/audits/_CHECKLIST.md`
3. `docs/audits/_RULES.md`

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] Badge unlock state persisted correctly and survives app restart
- [ ] `FoundersCountdown.tsx`: countdown timer reaches zero correctly, does not go negative
- [ ] `UnlockToast`: displayed once per unlock event, not re-displayed on every app open
- [ ] `BadgeDetailModal`: displays correct badge metadata for each badge type
- [ ] `TrophyShelfScreen`: handles empty badge collection state gracefully
- [ ] `ProgressBar`: does not show > 100% or negative progress

### Security (area-specific)

- [ ] Badge unlock criteria not entirely client-side only — no trivial bypass possible (flag if all validation is local)
- [ ] `AchievementsOptInStep` opt-out preference stored reliably (not lost on app reinstall if tied to account)

### Performance (area-specific)

- [ ] `BadgeGrid` uses `FlatList` / `FlashList` for badge collection — not `ScrollView` + map
- [ ] Badge animations use Reanimated on UI thread
- [ ] `FoundersCountdown` interval does not survive component unmount (cleanup in `useEffect`)

### Cleanliness / Maintainability (area-specific)

- [ ] `TrophyShelfScreen.tsx` under ~300 lines
- [ ] Badge tier logic centralized in one place — not duplicated across components

### Tests (area-specific)

- [ ] Countdown logic has a unit test
- [ ] Progress calculation has a unit test

### OSS-Readiness (area-specific)

- [ ] No founder names or early-user IDs embedded in badge definitions
- [ ] Badge asset names and copy safe for public

### i18n / Accessibility (area-specific)

- [ ] Badge names and descriptions use `t()` keys
- [ ] `BadgePip` has `accessibilityLabel` with badge name
- [ ] `UnlockToast` announced to VoiceOver (`accessibilityLiveRegion`)

## 5. Deliverable

Write output to: `docs/audits/findings/15-achievements-badges-findings.md`

Finding IDs: `badges-NNN`.

## 6. Exit Criteria

- [ ] `docs/audits/findings/15-achievements-badges-findings.md` written
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test --selectProjects components` passes
- [ ] Row 15 in `docs/audits/README.md` flipped to `done`
