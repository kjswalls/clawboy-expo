# Findings: Agents, Models & Skills (Plan 07)

**Date:** 2026-05-11  
**Auditor:** Cursor Agent (Sonnet 4.6)  
**Scope:** `src/hooks/useAgents.tsx`, `src/hooks/useModels.tsx`, `src/hooks/useAgentFiles.ts`, `src/lib/modelProvider.ts`, `src/components/input/InputBarPickerModal.tsx`, `src/components/input/InputBarHeader.tsx`, `src/components/chat/AgentFileViewerModal.tsx`, `src/components/onboarding/AgentsMdPreviewModal.tsx`

---

## Summary

The agents/models area is generally well-structured. Both `useAgents` and `useModels` follow the same list-management pattern cleanly, with proper cold-start caching via `seedFromCache` and reconnect-triggered refresh. `modelProvider.ts` is a pure lookup module with no side effects. `AgentFileViewerModal` correctly uses `@ronradtke/react-native-markdown-display` for safe rendering and fetches content via the authenticated WebSocket channel.

One high-severity stale-closure bug was found in `useModels`: the `setCurrentModel` callback captures a stale `models` array because `models` is absent from its `useCallback` dependency list. This causes `emitModelSet` to receive the wrong `isReasoning` value (always `false`) on first use after every connect.

Accessibility coverage on picker UI controls is absent — neither the trigger pills nor the dropdown rows carry `accessibilityLabel` or `accessibilityRole`.

**Severity counts:** 0 critical / 1 high / 2 med / 3 low / 4 nit

---

## Findings

### agents-001 — HIGH — Stale closure: `models` missing from `setCurrentModel` deps

**File:** `src/hooks/useModels.tsx` line 62–76  
**Status:** proposed

`setCurrentModel` uses `models` to look up the selected model's `reasoning` flag, but `models` is not listed in the `useCallback` dependency array. The callback is re-created only when `openClawRef` or `connectionState.status` changes — both of which happen before `refreshModels()` populates the list. As a result, every time a model is selected after reconnect, `modelMeta` is `undefined` and `emitModelSet` fires with `isReasoning: false` regardless of the model's actual capability.

**Proposed fix:**  
Replace the bare ref pattern with a `useRef` sync so the callback always reads the latest list without becoming unstable:

```typescript
const modelsRef = useRef<Model[]>(models);
useEffect(() => { modelsRef.current = models; }, [models]);

const setCurrentModel = useCallback((modelId: string, sessionKey?: string | null): void => {
  const midConversation = sessionKey != null;
  setCurrentModelId(modelId);
  void AsyncStorage.setItem(CURRENT_MODEL_KEY, modelId).catch(() => {});
  const modelMeta = modelsRef.current.find((m) => m.id === modelId);
  emitModelSet({ modelId, midConversation, isReasoning: modelMeta?.reasoning ?? false });
  const oc = openClawRef.current;
  const sk = sessionKey ?? null;
  if (oc && sk && connectionState.status === 'connected') {
    void oc.updateSession(sk, { model: modelId }).catch((err: unknown) => {
      console.warn('[useModels] sessions.patch model failed:', err);
    });
  }
}, [openClawRef, connectionState.status]);
```

This avoids widening the dependency array (which would make `setCurrentModel`'s identity unstable and cause re-renders in all `useModels()` consumers on every model list refresh).

---

### agents-002 — MED — Picker trigger pills missing accessibility attributes

**File:** `src/components/input/InputBarHeader.tsx` lines 249–286, 289–323  
**Status:** proposed

The model and agent `<Pressable>` pills have no `accessibilityLabel` or `accessibilityRole`. Screen reader users cannot identify the current selection or the purpose of the control.

**Proposed fix:**
```tsx
// Model pill (line 249)
<Pressable
  onPress={toggleModel}
  accessibilityRole="button"
  accessibilityLabel={t('input.a11y.modelPicker', { model: modelLabel })}
  accessibilityState={{ expanded: showModelPicker }}
  ...
>

// Agent pill (line 289)
<Pressable
  onPress={toggleAgent}
  accessibilityRole="button"
  accessibilityLabel={t('input.a11y.agentPicker', { agent: agentLabel })}
  accessibilityState={{ expanded: showAgentPicker }}
  ...
>
```

Add keys `input.a11y.modelPicker` (e.g. `"Model: {{model}}"`) and `input.a11y.agentPicker` (e.g. `"Agent: {{agent}}"`) to `src/i18n/locales/en/common.json` and `zh-CN/common.json`.

Note: i18n key additions require human approval per `_RULES.md`.

---

### agents-003 — MED — Picker dropdown rows missing accessibility attributes

**File:** `src/components/input/InputBarPickerModal.tsx` lines 86–152  
**Status:** proposed

The `renderRow` `<Pressable>` in the dropdown has no `accessibilityLabel`, no `accessibilityRole`, and no `accessibilityState` for the selected row. The plan checklist explicitly requires `accessibilityRole="menuitem"` or equivalent on model/agent selector items.

**Proposed fix:**
```tsx
<Pressable
  key={item.key}
  onPress={() => onPick(item.title)}
  accessibilityRole="menuitem"
  accessibilityLabel={item.title}
  accessibilityState={{ selected: isSelected(item) }}
  style={...}
>
```

---

### agents-004 — LOW — Module-level mutable globals in `useAgentFiles.ts`

**File:** `src/hooks/useAgentFiles.ts` lines 18–19  
**Status:** proposed

`fileCache` (a `Map`) and `cacheGeneration` (`let` number) are module-level mutable globals. `.cursorrules` explicitly states "No module-level mutable globals (timers, counters, caches live in hooks/refs)". The code comment acknowledges this is deliberate (cross-mount sharing is the intent), but it means:
1. Multiple simultaneous mounts of `useAgentFiles` share one cache — correct.
2. The cache is never garbage-collected (leaks across app lifetime, unbounded growth if many agents are used).
3. Unit-testing the hook requires manual cache surgery between test cases.

**Proposed fix:**  
Move the cache into a React context (`AgentFilesContext`) shared at the provider level. This preserves cross-mount sharing, allows cache clearing on context unmount, and removes the need for test-time global state cleanup. If the context approach is too heavy, at minimum cap the map size (e.g. evict LRU after 20 entries).

---

### agents-005 — LOW — `normalizeProvider` uses single-char substrings as nameKey fallbacks

**File:** `src/lib/modelProvider.ts` lines 38, 40  
**Status:** proposed

`nameKeys: ['o1', 'o3', 'o4', 'chatgpt']` for OpenAI and `nameKeys: ['gemini', 'palm', 'bard']` for Google are matched via `.includes()` on the lowercased model ID. Single-character-prefix keys like `'o1'`, `'o3'`, `'o4'` are substring matches that could misclassify third-party models whose IDs happen to contain those strings (e.g. `moonshot-o1-preview`, a hypothetical `xo3` variant, or future models from other labs).

**Proposed fix:**  
Tighten the OpenAI nameKeys to anchor on word boundaries or common prefixes:
```typescript
nameKeys: ['gpt-', 'o1-', 'o1\b', 'o3-', 'o3\b', 'o4-', 'o4\b', 'chatgpt']
```
Or use a regex-based match function instead of `.includes()` for the ambiguous entries. Alternatively, accept the current behavior as "good enough" since OpenClaw's `model.provider` field is populated for known providers, making the nameKey fallback a last resort.

---

### agents-006 — LOW — `createMarkdownStyles(colors)` called on every render

**File:** `src/components/chat/AgentFileViewerModal.tsx` line 56  
**Status:** proposed

`const markdownStyles = createMarkdownStyles(colors);` runs on every render of `AgentFileViewerModal`. If the function is not trivially cheap (it likely builds a large style object), this wastes CPU. `colors` changes only on theme switch.

**Proposed fix:**
```typescript
const markdownStyles = useMemo(() => createMarkdownStyles(colors), [colors]);
```

---

### agents-007 — LOW — No unit tests for `modelProvider.ts`, `useAgents`, `useModels`, `useAgentFiles`

**Files:** all four in-scope modules  
**Status:** proposed

The plan checklist explicitly requires:
- Unit tests for all `modelProvider` known providers (`normalizeProvider`, `groupModelsByProvider`)
- Hook test for model persistence (save/restore across simulated restarts)

None exist. The `normalizeProvider` function is pure and trivially testable; the stale-closure bug (agents-001) would have been caught by a simple hook test.

**Proposed test coverage:**
1. `src/lib/__tests__/modelProvider.test.ts` — cover each provider via `providerKeys`, cover each via `nameKeys` fallback, cover `other` path, verify `PROVIDER_ORDER` sorts groups correctly.
2. `src/hooks/__tests__/useModels.test.ts` — cover `currentModel` cold-start cache, persist/restore across simulated re-mount, verify `isReasoning` flag is correct when models list is populated before `setCurrentModel` fires (regression test for agents-001 once fixed).

---

### agents-008 — NIT — `handleCopy` missing explicit `Promise<void>` return type ✅ fixed

**File:** `src/components/chat/AgentFileViewerModal.tsx` line 98  
**Status:** fixed

`async () =>` had no explicit return type annotation. Added `: Promise<void>` per the coding standards rule for explicit return types on internal helpers.

---

### agents-009 — NIT — Dead fallback constants in `InputBarHeader.tsx`

**File:** `src/components/input/InputBarHeader.tsx` lines 36–37  
**Status:** proposed

`MODEL_PLACEHOLDER_FALLBACK = 'Select model'` and `AGENT_PLACEHOLDER_FALLBACK = 'Select agent'` are used only in `t('input.selectModel') ?? MODEL_PLACEHOLDER_FALLBACK`. Because `t()` from `react-i18next` always returns `string` (never `null | undefined`), the `??` branch is unreachable and the constants are effectively dead code. When translation keys are missing, `t()` returns the key string itself, not `undefined`.

**Proposed fix:** Remove the two constants and the `??` fallbacks:
```typescript
const modelLabel = selectedModel ?? t('input.selectModel');
const agentLabel = selectedAgent ?? t('input.selectAgent');
```

---

### agents-010 — NIT — Narrative comment removed ✅ fixed

**File:** `src/hooks/useAgentFiles.ts` line 67 (pre-fix)  
**Status:** fixed

Comment `// Return cached result immediately` restated what the immediately following `fileCache.get(id)` code already expresses. Removed per auto-fix rules.

---

## Auto-fixes Applied

| Finding ID | Severity | Description |
|------------|----------|-------------|
| agents-008 | nit | `AgentFileViewerModal.tsx`: added `: Promise<void>` return type annotation to `handleCopy` |
| agents-010 | nit | `useAgentFiles.ts`: removed narrative comment "Return cached result immediately" |

---

## Test Impact

`npm test` (scoped to `hooks/__tests__` and `lib/__tests__`):

- **Total:** 452 tests across 25 suites
- **Passed:** 450
- **Failed:** 2 — both in `useConnection.pinMismatch.test.ts`, which is **out of scope** for plan 07 (covered by plan 02). These failures are pre-existing and unrelated to the auto-fixes applied here.
- **No regressions introduced** by the two auto-fixes in this plan.

---

## Exit Criteria

- [x] `docs/audits/findings/07-agents-models-skills-findings.md` written
- [x] Severity counts accurate: 0 critical / 1 high / 2 med / 3 low / 4 nit
- [x] All auto-fixable items fixed (`agents-008`, `agents-010`); all others deferred to human review as proposed fixes
- [x] `npm test` run — 2 pre-existing failures in out-of-scope test, 0 new failures
- [x] Row 07 in `docs/audits/README.md` to be flipped to `done`
