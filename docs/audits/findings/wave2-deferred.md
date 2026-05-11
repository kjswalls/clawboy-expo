# Wave 2 Deferred Design Observations

These items were reviewed during the Wave 2 audit and intentionally deferred.
They represent design trade-offs, not bugs. Log only — no code change required.

---

## badges-007 — Client-side badge unlock validation

**Area:** `src/badges/tracker.ts`, `src/badges/__tests__/tracker.test.ts`

**Observation:** Badge unlock conditions (e.g. message counts, session streaks,
model variety) are evaluated entirely client-side. A motivated user could craft
a modified app build that unlocks badges without satisfying the real conditions.

**Why deferred:** ClawBoy is a power-user productivity tool, not a gamified
social product. Badges are motivational affordances for real usage patterns, not
scarce rewards with economic value. The cost of a server-side validation system
(gateway RPC, persistent badge state, sync protocol) is disproportionate to the
current use case.

**Revisit if:** Badges are tied to monetisation (e.g. "Founders badge" unlocks
discounts), shared publicly (social profile), or used to gate features. At that
point a `badge.unlock` RPC and server-side event verification should be added.

---

## badges-008 — Badge state lost on reinstall

**Area:** `src/badges/tracker.ts` (AsyncStorage persistence)

**Observation:** Badge progress and unlock state is stored in `AsyncStorage`
(local device only). Reinstalling the app, or transferring to a new device,
resets all badge progress.

**Why deferred:** The app has no account-level badge sync today. Supabase auth
exists for gateway pairing, but badge state is not included in any sync scope.
Adding badge sync would require: a new Supabase table (`user_badges`), a sync
hook that reads/writes on sign-in/sign-out, and conflict resolution for state
that diverged across devices.

**Revisit if:** Account sync expands beyond server profiles (e.g. when chat
history or settings sync is added). Badge sync should be bundled in that effort
rather than implemented standalone.

---

## badges-009 — `FoundersCountdown` has no live interval

**Area:** `src/components/badges/FoundersCountdown.tsx`

**Observation:** The countdown to the end of the Founders window is computed
once on render and does not refresh automatically. The displayed days remaining
will be stale until the next component remount.

**Why deferred:** `FoundersCountdown` shows day-level granularity only (e.g.
"12 days left"). A live `setInterval` that ticks every second or minute would
cause unnecessary re-renders with no visible benefit to the user — the day count
only changes once every 86,400 seconds.

**Revisit if:** The design changes to show hours or minutes remaining (e.g. for
the final countdown day). At that point, add a `setInterval` with a 60-second
tick and clean it up in a `useEffect` return.

---

*Logged during Wave 2 remediation — May 2026.*
