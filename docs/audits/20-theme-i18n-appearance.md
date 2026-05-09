# Audit Plan: Theme, i18n & Appearance

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/20-theme-i18n-appearance-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/contexts/ThemeContext.tsx
src/contexts/LanguageContext.tsx
src/hooks/useTheme.ts
src/i18n/**
src/constants/ (theme constants files)
app/settings/appearance.tsx
scripts/generate-vscode-themes.mjs
scripts/themes.config.mjs
src/contexts/__tests__/ (theme/language-related files)
```

## 2. Out of Scope

- Individual component styling — covered in their respective plans
- All other files not listed
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **Design Direction** section; **v0 → Expo Compatibility Mapping** (CSS vars → theme constants)
2. `docs/audits/_CHECKLIST.md`
3. `docs/audits/_RULES.md`

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] Dark/light theme switch: all components receive updated theme — no hard-coded colors that bypass the theme system
- [ ] Theme persists across app restarts (stored in `AsyncStorage` — this is non-sensitive preference data, `AsyncStorage` is correct here)
- [ ] `LanguageContext`: locale change takes effect without app restart
- [ ] i18n fallback: missing translation keys fall back to English, not blank or `undefined`
- [ ] `generate-vscode-themes.mjs`: script generates valid JSON; verify output in `assets/` or wherever themes are written
- [ ] Locale files: all keys in `en/common.json` present in all other locale files — flag missing keys

### Security (area-specific)

- [ ] Theme data stored in `AsyncStorage` (correct — non-sensitive). Verify nothing sensitive piggybacking on theme storage.

### Performance (area-specific)

- [ ] `ThemeContext` value object stable between renders (use `useMemo` — if theme hasn't changed, don't create new value object)
- [ ] `LanguageContext` value stable between renders
- [ ] i18n `t()` calls do not trigger expensive computations per call

### Cleanliness / Maintainability (area-specific)

- [ ] All color constants defined in `src/constants/` — no hex codes scattered in component files
- [ ] No Tailwind class strings or CSS variables anywhere in source
- [ ] Theme token naming is consistent and documented (or propose a convention)
- [ ] `useTheme` is a thin selector — no business logic

### Tests (area-specific)

- [ ] i18n locale key completeness can be verified programmatically — propose or implement a simple test
- [ ] Theme context renders correctly in test environment

### OSS-Readiness (area-specific)

- [ ] Locale files contain no private/internal copy or placeholder text left from development
- [ ] Theme names do not reference internal brand names not intended for public
- [ ] `themes.config.mjs` script works without internal tooling or credentials

### i18n / Accessibility (area-specific)

- [ ] All supported locales listed in `src/i18n/`
- [ ] RTL locale support: check if any RTL-heavy locale is supported; if so, verify layout uses `start`/`end` not `left`/`right`
- [ ] Locale file format is consistent (no trailing commas, valid JSON)
- [ ] Missing translation key warning is surfaced in dev builds

## 5. Deliverable

Write output to: `docs/audits/findings/20-theme-i18n-appearance-findings.md`

Finding IDs: `theme-NNN`.

Include a finding listing all locale files and any missing key counts per locale.

## 6. Exit Criteria

- [ ] `docs/audits/findings/20-theme-i18n-appearance-findings.md` written
- [ ] Locale completeness table included
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test` passes
- [ ] Row 20 in `docs/audits/README.md` flipped to `done`
