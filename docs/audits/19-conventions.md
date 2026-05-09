# Audit Plan: Conventions

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/19-conventions-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/contexts/ConventionInstallContext.tsx
src/lib/openclaw/installConventions.ts
src/components/settings/SettingsConventionsSection.tsx
app/settings/conventions.tsx
src/contexts/__tests__/ (convention-related files)
```

## 2. Out of Scope

- `src/lib/openclaw/client.ts` — covered in plan 01 (conventions use the client but don't modify it)
- All other files not listed
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **Security** rules 3, 4 (validate content before acting)
2. `docs/plans/` — any plans related to conventions
3. `docs/audits/_CHECKLIST.md`
4. `docs/audits/_RULES.md`

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] Convention install is idempotent — installing the same convention twice does not duplicate it
- [ ] Install progress / status reported correctly to UI
- [ ] Install failure: error surfaced clearly, gateway not left in partial state
- [ ] `ConventionInstallContext` correctly tracks install state per convention
- [ ] Conventions list refreshes after install without full app reload

### Security (area-specific)

- [ ] Convention payload content validated before sending to gateway — no arbitrary payload injection
- [ ] Convention source (if fetched from a URL) fetched over HTTPS only
- [ ] Agent `.md` preview in `AgentsMdPreviewModal` (if referenced here) renders safely — no raw HTML

### Performance (area-specific)

- [ ] Convention install runs as a background operation — does not block chat UI

### Cleanliness / Maintainability (area-specific)

- [ ] `installConventions.ts` is a pure async function — no React imports
- [ ] `ConventionInstallContext` state is scoped to installation — not mixed with chat or session state

### Tests (area-specific)

- [ ] Install idempotency has a unit test
- [ ] Error handling path has a unit test

### OSS-Readiness (area-specific)

- [ ] No internal convention definitions referenced by URL hard-coded (must be configurable)
- [ ] Convention examples in `demoData.ts` (if any) contain appropriate public-facing content

### i18n / Accessibility (area-specific)

- [ ] Conventions section labels use `t()` keys
- [ ] Install button has `accessibilityLabel` and reflects install state

## 5. Deliverable

Write output to: `docs/audits/findings/19-conventions-findings.md`

Finding IDs: `conventions-NNN`.

## 6. Exit Criteria

- [ ] `docs/audits/findings/19-conventions-findings.md` written
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test` passes
- [ ] Row 19 in `docs/audits/README.md` flipped to `done`
