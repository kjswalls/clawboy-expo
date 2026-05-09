# Audit Plan: [Area Name]

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/[area]-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

Files and directories this audit covers:

```
src/path/to/area/**
src/another/file.ts
```

## 2. Out of Scope

Explicitly excluded to prevent drift:

- `node_modules/`
- `docs/audits/` (read-only — plan + checklist files)
- Any file not listed in §1 above

## 3. Required Reading

Before auditing, read these in full:

1. `.cursorrules` — especially the **Security** section (rules 1–10) and the **Architecture** section
2. `docs/audits/_CHECKLIST.md` — the standard concern checklist
3. `docs/audits/_RULES.md` — what you MAY and MAY NOT change
4. _(add any relevant `docs/plans/` files here)_

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` section by section, adding area-specific bullets below each standard heading.

### Correctness (area-specific)
- _(add feature-specific correctness checks here)_

### Security (area-specific)
- _(add feature-specific security checks here)_

### Performance (area-specific)
- _(add feature-specific performance checks here)_

### Cleanliness / Maintainability (area-specific)
- _(add feature-specific cleanliness checks here)_

### Tests (area-specific)
- _(add feature-specific test checks here)_

### OSS-Readiness (area-specific)
- _(add feature-specific OSS checks here)_

### i18n / Accessibility (area-specific)
- _(add feature-specific i18n/a11y checks here)_

## 5. Deliverable

Write your output to:

```
docs/audits/findings/[area]-findings.md
```

Use this exact structure:

```markdown
# [Area] Findings

Date: YYYY-MM-DD
Agent: <model name>
Status: done

## Summary
1–3 sentences describing the overall health of this area.

## Severity Counts
- critical: N
- high: N
- med: N
- low: N
- nit: N

## Findings
| ID | Sev | File:Line | Summary | Recommendation | Status |
|----|-----|-----------|---------|----------------|--------|
| [area]-001 | high | src/...:42 | Short description | What to do | proposed |

## Auto-Fixes Applied
- [area]-002 (low): removed dead export `foo` in `src/.../bar.ts`

## Open Questions for Human
- Any ambiguous issues requiring human judgement go here.

## Test Impact
- `npm test --selectProjects <project>` result
- Any new tests added
```

## 6. Exit Criteria

- [ ] `docs/audits/findings/[area]-findings.md` is written with all sections filled
- [ ] Severity counts are accurate
- [ ] All auto-fixable items are either fixed (and logged) or explicitly deferred with reason
- [ ] `npm test` (scoped to relevant project) passes
- [ ] Your row in `docs/audits/README.md` is flipped to `done`
