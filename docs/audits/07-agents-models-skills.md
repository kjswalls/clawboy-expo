# Audit Plan: Agents, Models & Skills

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/07-agents-models-skills-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/hooks/useAgents.tsx
src/hooks/useModels.tsx
src/hooks/useAgentFiles.ts
src/lib/modelProvider.ts
src/hooks/__tests__/ (agents/models-related files)
```

Agent and model selector UI components (within settings or chat header — identify and include them).

## 2. Out of Scope

- `src/lib/openclaw/agents.ts`, `skills.ts`, `models.ts` — covered in plan 01
- `src/components/input/InputBarPickerModal.tsx` — if it's just a picker wrapper, include; if it also handles other concerns, flag
- All other files not listed
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **MVP Feature Scope** §6, 8 (agent/model selector); **Protocol Layer** (agents.list, models.list)
2. `docs/audits/_CHECKLIST.md`
3. `docs/audits/_RULES.md`

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] Agent list refreshes after reconnect without stale data showing
- [ ] Model list: current model selection persists across sessions and app restarts
- [ ] `useAgentFiles` fetches agent `.md` files correctly; handles 404/missing gracefully
- [ ] `modelProvider.ts`: model → provider mapping is exhaustive for documented providers (DeepSeek, Gemini, Claude, OpenAI, etc.)
- [ ] Switching agent mid-session: confirmation or session behavior is clearly defined, not silently ambiguous
- [ ] Empty agent/model list (disconnected state): UI shows appropriate empty state, no crash

### Security (area-specific)

- [ ] Agent file content (`.md`) rendered through safe markdown renderer, not raw HTML
- [ ] Agent file fetching uses authenticated gateway channel, not unauthenticated HTTP

### Performance (area-specific)

- [ ] Agent and model lists are cached — not re-fetched on every picker open
- [ ] Model picker `FlatList` / `FlashList` configured with `keyExtractor`

### Cleanliness / Maintainability (area-specific)

- [ ] `modelProvider.ts` is a pure lookup — no side effects, no state
- [ ] `useAgents` and `useModels` do not duplicate each other's list-management patterns

### Tests (area-specific)

- [ ] `modelProvider.ts` has unit tests for all known providers
- [ ] Model persistence (save/restore) has hook test

### OSS-Readiness (area-specific)

- [ ] No hard-coded agent names or agent IDs from a specific user's gateway
- [ ] No hard-coded model IDs beyond the documented example set

### i18n / Accessibility (area-specific)

- [ ] Agent selector `accessibilityLabel` describes current selection
- [ ] Model selector items have `accessibilityRole="menuitem"` or equivalent

## 5. Deliverable

Write output to: `docs/audits/findings/07-agents-models-skills-findings.md`

Finding IDs: `agents-NNN`.

## 6. Exit Criteria

- [ ] `docs/audits/findings/07-agents-models-skills-findings.md` written
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test` passes
- [ ] Row 07 in `docs/audits/README.md` flipped to `done`
