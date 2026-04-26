# Prompt 10 follow-up (implementation gaps)

**Scope note (user iteration):** We are **not** implementing the following from the original Prompt 10 audit:

- Add **agent/model** controls on the Settings screen (selection remains in chat / input bar only)
- A dedicated **Forget device** control on the main Settings body (the flow in **Add Server Sheet → edit** remains the only place for `clearDeviceIdentity` unless revisited later)
- **Server / protocol version** line in Settings footer (app version in footer is enough for now)

---

## Remaining work (in priority order)

1. **Chat connection UX** — Plumb `connectionState` for `error` and `pairing_required` (not collapsed to generic disconnected): dismissible error banner, pairing banner, yellow dot + “Reconnecting…” placeholder when `connecting`, red/disabled send when not connected. Files: [app/index.tsx](app/index.tsx), [src/components/chat/ConnectionBanner.tsx](src/components/chat/ConnectionBanner.tsx), [src/components/input/InputBar.tsx](src/components/input/InputBar.tsx) / [InputBarCard](src/components/input/InputBarCard.tsx) as needed.

2. **AddServerSheet** — Surface insecure-transport / `http` coercion warnings using [src/utils/gatewayUrl.ts](src/utils/gatewayUrl.ts) (`analyzeGatewayUrlInput` or equivalent) before test.

3. **Onboarding polish** — Success: ~1.5s auto-nav (or current behavior if we keep 800ms), optional tap-to-skip, optional “Try again” on pairing (only if we still want parity with the prompt text).

4. **useConnection** — Remove or redact `tokenLen` (and similar) from `runConnect` logging per security rules.

---

## Todos

- [ ] Chat banners + input placeholder + disable send
- [ ] Insecure URL warnings in AddServerSheet
- [ ] Onboarding timing / tap to proceed / try again (as desired)
- [ ] Remove sensitive-adjacent logging in useConnection

**Cancelled / out of scope:** Settings agent+model, Forget device in settings list, protocol version in settings.
