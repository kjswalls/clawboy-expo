# Haptics Inventory

Captured for Bug #7 — global haptics toggle under Interface settings.

All call sites go through `useHaptics()` from `src/hooks/useHaptics.ts`, which
returns a `haptic(action)` dispatcher. The hook is a no-op on web. With Bug #7
applied, the hook also early-returns when the user disables haptics via the
new `HapticsPreferencesContext` (default: on).

## Summary

- Total call sites: 20
- By style:
  - `light` = 14
  - `medium` = 2
  - `selection` = 1
  - `success` = 2
  - `error` = 1
  - (`heavy`, `warning` = 0 — neither style is currently used anywhere)
- Judgment overview: 19 appropriate, 1 candidate for adjustment.

## Call sites

### app/index.tsx

- **L303** `haptic('success')` — connection state transitions to `connected`
  → **yes** (notification-class success matches a recoverable transport
  event; only fires on transition, not on every poll).
- **L305** `haptic('error')` — connection state transitions to `error`
  → **yes** (matches notification semantics; only fires on transition).
- **L865** `haptic('light')` — `handleSelectSession` (sidebar tap to switch
  to a different session) → **yes** (selection feedback for navigation).
- **L904** `haptic('medium')` — `handleNewSession` (sidebar "+ new session"
  tap) → **yes** (medium reads as a stronger commit action than ordinary
  row taps — appropriate for creating a brand-new entity).
- **L911** `haptic('light')` — see file for surrounding context; tap-level
  feedback → **yes**.

### src/components/sidebar/SessionRow.tsx

- **L292** `haptic('light')` — long-press on a session row to open the
  rename / delete menu → **yes** (subtle confirmation that long-press was
  registered; matches platform convention for context-menu reveal).

### src/components/settings/LogLineRow.tsx

- **L50** `haptic('light')` — long-press on a log line to copy raw text to
  clipboard → **yes** (signals the copy action fired without a visible UI
  change).

### src/components/settings/SettingsConventionsSection.tsx

- **L98** `haptic('light')` — `firePreviewBurst` (tap on the conventions
  preview area to retrigger the demo confetti) → **yes** (decorative
  feedback for an explicitly demo interaction).

### src/components/input/InputBarHeaderToggles.tsx

- **L62** `haptic('light')` — toggle "show thinking" → **yes**.
- **L67** `haptic('light')` — toggle "show tool calls" → **yes**.
- **L72** `haptic('light')` — manual refresh button → **yes** (gives the
  press tactile confirmation since the refresh icon also spins, but the
  spin alone could feel disconnected on slow networks).

### src/components/input/InputBarActionBar.tsx

- **L95** `haptic('light')` — tap on a pinned slash-command pill (or pin
  toggle when in edit mode) → **yes**.
- **L222** `haptic('light')` — expand / collapse the action bar
  → **yes**.
- **L230** `haptic('light')` — enter / leave edit mode for pinned
  commands → **yes**.
- **L252** `haptic('light')` — Send button tap, gated by `canSend`
  → **yes** (the `canSend` guard already prevents firing on disabled
  taps).
- **L257** `haptic('medium')` — Stop button (interrupt in-flight stream)
  → **yes** (stronger pulse matches the destructive / interrupt nature).

### src/components/input/InputBarInfoRow.tsx

- **L87** `haptic('selection')` — tap on the context-usage pill to open
  the context detail sheet → **yes** (selection feels like a picker
  click, which matches the "switching to a detail view" intent).

### src/components/input/attachmentSheet/AttachmentSheetShared.tsx

- **L434** `haptic('light')` — fired inside the `visible` effect when the
  attachment bottom sheet is presented → **yes** for now, but flagged as
  a **consider weaker / consider removing** candidate if the sheet is
  ever opened programmatically (e.g. via a paste handler). Currently
  it only opens in response to a user tap, so the light pulse mirrors
  the originating press; safe.

### src/components/badges/UnlockToast.tsx

- **L74** `haptic('success')` — fires when a new badge-unlock toast
  animates in → **yes** (notification-style success is exactly what
  this is).

### src/components/onboarding/steps/WelcomeStep.tsx

- **L97** `haptic('light')` — tap the primary CTA on the welcome
  step → **yes**.

## Recommendations / follow-ups

- **InputBarActionBar L222 + L230** can fire two `light` pulses in
  quick succession if the user enters edit mode by tapping the expand
  chevron then the edit affordance. Not actionable on its own, but if
  we ever batch these into a single state transition the duplicate
  pulse will need to be collapsed.
- **AttachmentSheetShared L434** — if a future feature opens the sheet
  programmatically (e.g. paste-to-attach), revisit this so we don't
  fire haptics without a user gesture.
- No call site currently uses `heavy` or `warning`. If a destructive
  confirmation flow (e.g. delete-session, sign-out) ever wants stronger
  feedback, prefer `warning` over upgrading an existing `medium` so
  the existing dispatch surface stays predictable.
- Global gate from Bug #7 makes the above adjustments lower priority —
  users who find any pulse annoying can now disable all haptics from
  Settings → Interface.
