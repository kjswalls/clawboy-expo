# Audit Plan: Feedback Worker & In-App Feedback

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/18-feedback-worker-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
infra/feedback-worker/src/index.ts
infra/feedback-worker/package.json (read for deps analysis)
src/lib/feedback/**
src/components/settings/FeedbackSheet.tsx
src/lib/feedback/__tests__/ (if present)
```

## 2. Out of Scope

- `infra/feedback-worker/node_modules/` — do NOT read
- `infra/supabase/` — covered in plan 23
- All other files not listed
- `docs/audits/`

## 3. Required Reading

1. `.cursorrules` — **Security** rules 1, 2, 7
2. `infra/feedback-worker/README.md` — worker architecture and deployment
3. `docs/audits/_CHECKLIST.md`
4. `docs/audits/_RULES.md`

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] Feedback submission endpoint: correct method, headers, and body format match what the worker expects
- [ ] Worker rate limiting: verified present; check for bypass via header manipulation
- [ ] Worker CORS configuration: only allows expected origins (app + dev)
- [ ] Screenshot attachment: captured, compressed, and uploaded correctly; handles capture failure gracefully
- [ ] `diagnostics.ts`: diagnostic data collected is complete and useful (app version, device, OS, connection state)
- [ ] `devBypassToken.ts`: dev bypass is **only active in `__DEV__` builds** — verify the conditional guard
- [ ] Double-submission prevention: "Send" button disabled after first tap

### Security (area-specific)

- [ ] **`devBypassToken.ts` must be gated to `__DEV__` only** — a bypass token in a production build is a critical vulnerability
- [ ] Worker authentication: verify what authenticates the feedback submission (is it open to anyone? rate-limited? token-gated?)
- [ ] Screenshots: must NOT capture screens containing auth tokens, connection credentials, or payment data — verify what is redacted
- [ ] `prepareFeedbackScreenshots.ts`: redaction logic covers all sensitive screens
- [ ] Worker endpoint URL must come from config/env — not hard-coded in `submitFeedback.ts`
- [ ] No user-identifying data included in diagnostic payload without user consent (check for email, device ID)
- [ ] Cloudflare Worker: no secrets in Worker source code (must use Cloudflare environment variables / secrets)

### Performance (area-specific)

- [ ] Screenshot capture and upload runs off the main thread or is deferred — not blocking the UI
- [ ] Diagnostic collection does not trigger expensive operations synchronously

### Cleanliness / Maintainability (area-specific)

- [ ] `infra/feedback-worker/src/index.ts` under ~300 lines; it is reportedly 681 lines — flag all logical sections for proposed split
- [ ] Feedback submission logic separated from UI (`FeedbackSheet.tsx` calls service, does not do HTTP directly)

### Tests (area-specific)

- [ ] Worker has basic request handling tests (or note the gap)
- [ ] `submitFeedback.ts` mock-testable (URL injectable)

### OSS-Readiness (area-specific)

- [ ] No Cloudflare account ID, Worker URL, or API token in worker source
- [ ] No developer email, Slack webhook, or internal issue tracker URL hard-coded in worker source
- [ ] `devBypassToken.ts` value is a placeholder, not a real token

### i18n / Accessibility (area-specific)

- [ ] `FeedbackSheet` all labels and prompts use `t()` keys
- [ ] "Send" button has `accessibilityLabel`

## 5. Deliverable

Write output to: `docs/audits/findings/18-feedback-worker-findings.md`

Finding IDs: `feedback-NNN`.

**Must include `feedback-BYPASS`** documenting the result of verifying `devBypassToken.ts` is dev-only.

## 6. Exit Criteria

- [ ] `docs/audits/findings/18-feedback-worker-findings.md` written
- [ ] `feedback-BYPASS` finding present
- [ ] Dev bypass confirmed gated to `__DEV__` or flagged as critical
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test` passes
- [ ] Row 18 in `docs/audits/README.md` flipped to `done`
