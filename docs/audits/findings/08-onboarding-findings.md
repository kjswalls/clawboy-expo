# Audit Findings: Onboarding (08)

**Date:** 2026-05-11  
**Auditor:** Audit Agent (Sonnet)  
**Scope:** `src/components/onboarding/**`, `app/onboarding.tsx`, `src/components/onboarding/__tests__/**`

---

## Summary

The onboarding flow is well-structured overall. `app/onboarding.tsx` is a proper thin Expo Router wrapper. Animations correctly use `react-native-reanimated`. All i18n keys in `OnboardingScreen.tsx` itself are properly translated. Security posture is good: the component never holds raw auth tokens (they're delegated to `AddServerSheet`), and `AgentsMdPreviewModal` renders via `<Text selectable>` — no HTML injection.

**Three issues require attention before release:**

1. `AchievementsOptInStep.tsx` has **zero i18n coverage** — all user-visible strings are hardcoded English. This is the only HIGH finding.
2. `OnboardingScreen.tsx` at **1,101 lines** is a maintainability and parse-time risk. A proposed split into focused step components is included below (`onboarding-SPLIT`).
3. The step progress indicator **dots have no `accessibilityValue`**, leaving the current step unannounced to VoiceOver/TalkBack — despite a dedicated `onboarding.nav.stepIndicator` i18n key that was defined for this purpose but never wired up.

No auto-fixes were applied. All issues require either new i18n keys (locale-file changes) or are behavioral/a11y changes, both of which are proposed-only per `_RULES.md`.

**Severity counts:** Critical: 0 · High: 1 · Med: 2 · Low: 2 · Nit: 2

---

## Findings

---

### onboarding-001 · HIGH · proposed

**`AchievementsOptInStep.tsx` — no i18n coverage whatsoever**

Every user-visible string in `AchievementsOptInStep.tsx` is hardcoded English. The component has no `useTranslation()` call and uses zero `t()` keys. Affected strings:

| Location | Hardcoded string |
|---|---|
| Line 71 | `"Earn badges as you chat"` (heading `<Text>`) |
| Lines 74–76 | `"Track milestones like your first message…"` (body `<Text>`) |
| Line 81 | `"🔒  We never see your chats…"` (privacy card `<Text>`) |
| Line 97 | `accessibilityLabel="Enable achievements"` |
| Line 100 | `"Enable achievements"` (button label `<Text>`) |
| Line 109 | `accessibilityLabel="Skip for now"` |
| Line 111 | `"Skip for now"` (skip label `<Text>`) |

No corresponding keys exist under `onboarding.*` in either locale file.

**Proposed fix:**

1. Add `useTranslation()` to `AchievementsOptInStep`.
2. Add the following keys to both `src/i18n/locales/en/common.json` and `src/i18n/locales/zh-CN/common.json` under `onboarding.achievements`:

```json
"achievements": {
  "title": "Earn badges as you chat",
  "body": "Track milestones like your first message, model streaks, and late-night sessions. 34 badges across free, Pro, and Founders tiers.",
  "privacy": "🔒  We never see your chats, never store history, never send badge data. Only local counters (message count, streaks, etc.) are tracked.",
  "enableLabel": "Enable achievements",
  "enableAccessibility": "Enable achievements",
  "skipLabel": "Skip for now",
  "skipAccessibility": "Skip for now"
}
```

3. Replace all hardcoded strings with `t('onboarding.achievements.*')` calls.

---

### onboarding-002 · MEDIUM · proposed

**Step indicator dots missing `accessibilityValue` — `onboarding.nav.stepIndicator` key exists but is never used**

`OnboardingStepNav` renders three `<View>` dots with no accessibility information. VoiceOver/TalkBack users have no way to know which onboarding step they are on (e.g. "Step 1 of 3").

The locale files already contain the key and template:
```json
"nav": {
  "stepIndicator": "Step {{current}} of {{total}}"
}
```

...but this key is never referenced in the component.

**Proposed fix** — add `accessibilityValue` to the dots container in `OnboardingStepNav` (lines ~859–872):

```tsx
<View
  style={navStyles.dots}
  accessible
  accessibilityRole="progressbar"
  accessibilityValue={{
    text: t('onboarding.nav.stepIndicator', {
      current: userIdx + 1,
      total: USER_STEPS.length,
    }),
  }}
>
  {USER_STEPS.map((_, i) => ( /* dots unchanged */ ))}
</View>
```

---

### onboarding-SPLIT · MEDIUM · proposed

**`OnboardingScreen.tsx` at 1,101 lines — HIGH-priority split candidate**

This single file contains the main state machine, five step UIs, four independent sub-components (`SpringCheckCircle`, `HeroLogoSpring`, `PairingInfoRow`, `RestoreList`, `OnboardingStepNav`), and three `StyleSheet.create` blocks. This exceeds the 300-line component limit from `.cursorrules` by 3.7×.

**Do NOT execute this split.** Proposed structure below — review and approve before applying.

#### Proposed file layout

```
src/components/onboarding/
├── OnboardingScreen.tsx          (~230 lines — state machine + JSX router only)
├── steps/
│   ├── WelcomeStep.tsx           (~120 lines — logo, headline, CTA, demo link, footer)
│   ├── ConnectingStep.tsx        (~20 lines  — BrandLoader + label, may stay inline)
│   ├── PairingStep.tsx           (~130 lines — approve card, verify card, cert-pin hint)
│   ├── SuccessStep.tsx           (~30 lines  — check circle, headline, open-now btn)
│   └── AchievementsOptInStep.tsx (already split out ✓)
├── components/
│   ├── PairingInfoRow.tsx        (~45 lines)
│   ├── RestoreList.tsx           (~105 lines — gateway restore list + styles)
│   ├── OnboardingStepNav.tsx     (~100 lines — 3-dot indicator + arrows + styles)
│   └── OnboardingAnimations.tsx  (~45 lines  — SpringCheckCircle, HeroLogoSpring)
└── __tests__/
    └── OnboardingScreen.test.tsx (existing, no changes needed)
```

#### Logical line ranges in current file

| Section | Current lines | Proposed destination |
|---|---|---|
| Imports | 1–46 | `OnboardingScreen.tsx` (trimmed) |
| `SpringCheckCircle` | 56–79 | `components/OnboardingAnimations.tsx` |
| `HeroLogoSpring` | 85–99 | `components/OnboardingAnimations.tsx` |
| `OnboardingScreen` (state machine + root JSX) | 105–633 | `OnboardingScreen.tsx` (~230 lines after step extraction) |
| `PairingInfoRow` | 639–677 | `components/PairingInfoRow.tsx` |
| `RestoreList` + `restoreStyles` | 691–814 | `components/RestoreList.tsx` |
| `OnboardingStepNav` + `navStyles` | 831–917 | `components/OnboardingStepNav.tsx` |
| Root `styles` block | 923–1100 | Distribute to each step/component file |

**Inline step JSX to extract into step components:**
- Welcome step (lines ~332–423) → `steps/WelcomeStep.tsx`
- Connecting step (lines ~321–329) → small enough to keep inline or `steps/ConnectingStep.tsx`
- Pairing step (lines ~478–577) → `steps/PairingStep.tsx`
- Success step (lines ~579–600) → `steps/SuccessStep.tsx`

**Props contracts (sketch):**

```ts
// WelcomeStep
interface WelcomeStepProps {
  colors: ThemeColors;
  accountStatus: string;
  remotePointers: ServerPointer[];
  isFetchingPointers: boolean;
  onGetStarted: () => void;
  onTryDemo: () => void;
  onSignIn: () => void;
  onRefreshPointers: () => void;
  onSetupPointer: (url: string, name: string) => void;
  demoPending: boolean;
}

// PairingStep
interface PairingStepProps {
  colors: ThemeColors;
  t: TFunction;
  gatewayHost: string | null;
  isInsecureScheme: boolean;
  deviceId: string | null;
  activeProfile: ServerProfile | null;
  onTryAgain: () => void;
  onPinCert: () => void;
}
```

---

### onboarding-003 · LOW · proposed

**`OnboardingScreen.test.tsx` — `ServerProfileSyncContext` mock missing `refreshRemotePointers`**

The `mockSyncContext` object (line 82–83) only mocks `remotePointers` and `isFetchingPointers`. The component also destructures `refreshRemotePointers` from `useServerProfileSync()`:

```ts
const { remotePointers, isFetchingPointers, refreshRemotePointers } = useServerProfileSync();
```

If any future test exercises the `signed-out → signed-in` transition while the component is mounted, the `useEffect` at line 150 would call `void refreshRemotePointers()` and throw `TypeError: refreshRemotePointers is not a function`. The currently-passing tests happen to avoid this code path, but the mock is a latent trap.

**Proposed fix:**

```ts
const mockSyncContext = {
  remotePointers: [] as { id: string; url: string; label: string }[],
  isFetchingPointers: false,
  refreshRemotePointers: jest.fn().mockResolvedValue(undefined),
};
```

---

### onboarding-004 · LOW · proposed

**Dead i18n keys `onboarding.welcome.tryDemoSubA` and `onboarding.welcome.tryDemoSubB`**

Both locale files define these keys:

```json
"tryDemoSubA": "No server needed",
"tryDemoSubB": "Scripted responses"
```

Neither key is referenced anywhere in the codebase (`OnboardingScreen.tsx` uses `onboarding.welcome.tryDemoCaption` for the same concept). These are dead entries, likely left over from a UI iteration.

**Proposed fix:** Remove both keys from `en/common.json` and `zh-CN/common.json` in the next i18n cleanup pass. Requires verifying no other file uses them (confirmed by repo-wide grep — no matches outside the locale files).

---

### onboarding-005 · NIT · proposed

**Stale comment on `suppressAutoAdvanceRef` — misleads about when the ref is set**

Line 255–256 in `OnboardingScreen.tsx`:
```ts
// When true the 800ms auto-advance is suppressed while AddServerSheet is open.
const suppressAutoAdvanceRef = useRef(false);
```

In practice, `suppressAutoAdvanceRef.current = true` is only set inside `handleBack` when the user navigates back from the success step to edit an existing profile. It is **not** set when `AddServerSheet` opens on the welcome step. The comment describes an intent that was either never implemented or was removed.

**Proposed fix:** Update the comment to accurately describe current behavior:
```ts
// When true the 800ms auto-advance on 'success' is suppressed (set by handleBack
// when the user navigates back from success to edit their profile).
```

---

### onboarding-006 · NIT · proposed

**Missing `accessibilityRole="button"` on two `Pressable` elements**

The "Try again" button in the pairing step (line 504) and the "Open now" button in the success step (line 588) have no `accessibilityRole`. VoiceOver will still read their child text correctly, but the "button" trait will not be announced.

**Proposed fix:** Add `accessibilityRole="button"` to both `Pressable` elements.

---

## Auto-fixes applied

None. All identified issues require either new i18n keys (locale-file changes, proposed-only per `_RULES.md`) or behavioral/a11y changes (proposed-only). There were no dead imports, unused variables, `console.log` calls, missing return types, or narrowable `any` types found.

---

## Test impact

No auto-fixes were applied, so no test re-run was required. Pre-audit test run confirms suite is green:

```
PASS components src/components/onboarding/__tests__/OnboardingScreen.test.tsx
  OnboardingScreen
    ✓ renders the welcome step with sign-in link when signed out (snapshot)
    ✓ does not show the sign-in link when already signed in
    ✓ shows the restore list when signed in with remote pointers (snapshot)
    ✓ shows a spinner in the restore area while fetching pointers (snapshot)
    ✓ shows empty state when signed in but no remote pointers

Tests:     5 passed, 5 total
Snapshots: 3 passed, 3 total
```

**Note:** A `warnIfUpdatesNotWrappedWithActDEV` warning fires during the `getOrCreateDeviceIdentity` mock resolution. This is a known limitation of testing async `useEffect` state updates without `act()` wrappers, and does not affect snapshot or assertion results. It would be resolved by wrapping the render in `act()` in `renderWithProviders`, but that change is out of scope.

---

## Exit criteria met?

| Criterion | Status |
|---|---|
| `docs/audits/findings/08-onboarding-findings.md` written | ✅ |
| `onboarding-SPLIT` finding present with proposed structure | ✅ |
| Severity counts accurate (0 C / 1 H / 2 M / 2 L / 2 N) | ✅ |
| All auto-fixable items fixed or deferred | ✅ (none to fix) |
| `npm test --selectProjects components` passes | ✅ 5/5 passing |
| Row 08 in `docs/audits/README.md` flipped to `done` | ✅ (applied after writing this doc) |
