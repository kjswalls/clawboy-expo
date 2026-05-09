# Audit Plan: Annotations

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/12-annotations-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/lib/annotations.ts
src/contexts/AnnotationContext.tsx
src/components/chat/AnnotatedMessageBody.tsx
src/components/chat/AnnotationLayoutContext.tsx
src/components/chat/AnnotationPreviewModal.tsx
src/components/chat/AnnotationsPill.tsx
src/components/chat/InlineAnnotationRow.tsx
src/contexts/__tests__/ (annotation-related files)
```

## 2. Out of Scope

- All other files not listed
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **Security** rule 3 (sanitize rendered content)
2. `docs/audits/_CHECKLIST.md`
3. `docs/audits/_RULES.md`

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] Annotation positions are stable across re-renders and stream updates — no position drift
- [ ] `AnnotationContext`: annotation state per message is cleared on session reset/switch
- [ ] `AnnotationLayoutContext`: layout measurements are re-computed on screen rotation / font size change
- [ ] `AnnotationPreviewModal`: handles annotations with no body, malformed data, or very long content
- [ ] `InlineAnnotationRow`: tapping annotation navigates to correct source position

### Security (area-specific)

- [ ] Annotation body content rendered through markdown renderer — no raw HTML
- [ ] Annotation source URLs (if any) validated before opening with `Linking`

### Performance (area-specific)

- [ ] Layout measurement callbacks are stable (no recreation on each render)
- [ ] `AnnotationsPill` does not trigger expensive layout recalculation on each stream chunk

### Cleanliness / Maintainability (area-specific)

- [ ] `annotations.ts` is pure logic — no React imports
- [ ] Layout context is scoped to the message list, not the entire app tree
- [ ] `AnnotatedMessageBody.tsx` under ~300 lines; flag if not

### Tests (area-specific)

- [ ] `annotations.ts` pure logic has unit tests
- [ ] Annotation position computation tested with edge cases (empty annotation list, out-of-bounds positions)

### OSS-Readiness (area-specific)

- [ ] No internal annotation format details that would confuse external contributors without documentation

### i18n / Accessibility (area-specific)

- [ ] `AnnotationsPill` has `accessibilityLabel` describing number of annotations
- [ ] `AnnotationPreviewModal` close button has `accessibilityLabel`

## 5. Deliverable

Write output to: `docs/audits/findings/12-annotations-findings.md`

Finding IDs: `annotations-NNN`.

## 6. Exit Criteria

- [ ] `docs/audits/findings/12-annotations-findings.md` written
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test` passes
- [ ] Row 12 in `docs/audits/README.md` flipped to `done`
