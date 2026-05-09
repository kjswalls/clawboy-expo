# Audit Plan: Demo Mode

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/16-demo-mode-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/lib/demo/**
src/components/chat/DemoModeBanner.tsx
src/lib/demo/__tests__/ (if present)
```

Also search for all `usages of demo mode flag / DemoOpenClawClient in hooks` (grep `DemoOpenClawClient`, `demoMode`, `isDemoMode`) and list any files outside this scope that reference demo mode — flag them but do NOT edit them.

## 2. Out of Scope

- `src/hooks/useChat.ts` — covered in plan 04 (only flag the demo branch here, don't fix it)
- All other files not listed
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **Security** rules (demo path must not expose real connection)
2. `docs/audits/_CHECKLIST.md`
3. `docs/audits/_RULES.md`

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] `DemoOpenClawClient` correctly implements the same interface as the real client — no missing methods that would crash in demo mode
- [ ] Demo mode cannot be activated in production build without an explicit trigger — no accidental activation
- [ ] Exiting demo mode cleanly returns to real connection state — no residual demo data in real session list
- [ ] `demoScripts.ts` replay timing is correct — no infinite loops, no runaway timers
- [ ] `demoStorage.ts` uses isolated storage namespace — cannot accidentally persist demo data to real app storage keys

### Security (area-specific)

- [ ] **Demo mode cannot contact a real OpenClaw gateway** — verify `DemoOpenClawClient` has no network calls
- [ ] Demo mode cannot be triggered via a crafted deeplink or URL scheme
- [ ] Demo data (`demoData.ts`) contains no real user data, real server URLs, or real tokens
- [ ] Exiting demo does not leak any demo credentials into real auth state

### Performance (area-specific)

- [ ] Demo scripts do not block the JS thread (timers using `setTimeout`, not busy-wait)
- [ ] Demo data module is not imported in the production bundle if tree-shaking is effective — flag if it always bundles

### Cleanliness / Maintainability (area-specific)

- [ ] `DemoOpenClawClient.ts` under ~300 lines
- [ ] `demoData.ts` clearly separated from production data files
- [ ] Demo mode activation is a single boolean flag, not spread across multiple conditionals

### Tests (area-specific)

- [ ] `DemoOpenClawClient` has tests verifying it cannot make real network calls
- [ ] Demo mode activation/deactivation has a test

### OSS-Readiness (area-specific)

- [ ] `demoData.ts` content is appropriate for public viewing — no private message examples, no personal data
- [ ] Demo scripts do not reference internal team names or private projects

### i18n / Accessibility (area-specific)

- [ ] `DemoModeBanner` text uses `t()` key
- [ ] Banner has `accessibilityRole` so it is announced by VoiceOver

## 5. Deliverable

Write output to: `docs/audits/findings/16-demo-mode-findings.md`

Finding IDs: `demo-NNN`.

Include a finding listing every file outside the declared scope that references demo mode (even if no issue — this is the leakage map).

## 6. Exit Criteria

- [ ] `docs/audits/findings/16-demo-mode-findings.md` written
- [ ] Demo leakage map included in findings
- [ ] `DemoOpenClawClient` confirmed to have no real network calls
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test --selectProjects logic` passes
- [ ] Row 16 in `docs/audits/README.md` flipped to `done`
