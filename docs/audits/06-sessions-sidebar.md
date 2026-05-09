# Audit Plan: Sessions & Sidebar

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/06-sessions-sidebar-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/components/sidebar/**
src/hooks/useSessions.tsx
src/components/sidebar/__tests__/**
src/hooks/__tests__/ (sessions-related files)
```

## 2. Out of Scope

- `src/lib/openclaw/sessions.ts` — covered in plan 01
- All other files not listed
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **Architecture** (gesture drawer, `SessionSidebar`); **v0 → Expo Compatibility Mapping** (gesture drawer migration)
2. `docs/audits/_CHECKLIST.md`
3. `docs/audits/_RULES.md`

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] Session switching: active session ID updated before requesting history, no flash of wrong session content
- [ ] `sessions.changed` event: list refreshes correctly without full re-mount
- [ ] Session create: optimistic insert then server-confirmed ID replaces temp ID correctly
- [ ] Session reset: clears message cache for that session, UI reflects empty state
- [ ] Session delete (if implemented): removes from list, switches to another session gracefully
- [ ] Swipe-to-delete / swipe actions: confirm destructive actions, no accidental deletes
- [ ] Sidebar open/close gesture does not conflict with horizontal swipes in `MessageList`
- [ ] Deep link or push notification routing to a session: sidebar opens to correct session

### Security (area-specific)

- [ ] Session metadata (title, preview text) does not contain raw sensitive content exposed in notification previews or logs
- [ ] Session IDs are opaque strings — no logic based on assumed ID format

### Performance (area-specific)

- [ ] `SessionRow` wrapped in `React.memo` — no re-render on unrelated sessions
- [ ] `SessionSidebarList` uses `FlashList` or `FlatList` (not `ScrollView` + map) for potentially long session lists
- [ ] Sidebar open/close animation runs on UI thread (Reanimated gesture + animated style)
- [ ] Session list not re-fetched on every sidebar open — use cached data from `useSessions`

### Cleanliness / Maintainability (area-specific)

- [ ] `useSessions.tsx` is the single owner of session CRUD and list state
- [ ] `SessionSidebar.tsx` under ~300 lines; flag if not
- [ ] Gesture drawer uses `react-native-gesture-handler` + Reanimated, not deprecated `Animated` API

### Tests (area-specific)

- [ ] Session list update on `sessions.changed` event has a unit/hook test
- [ ] Swipe action confirmation logic has a test

### OSS-Readiness (area-specific)

- [ ] No developer-created session IDs or test sessions in fallback data

### i18n / Accessibility (area-specific)

- [ ] "New session" button has `accessibilityLabel` and `accessibilityRole="button"`
- [ ] Session rows have `accessibilityLabel` with session title
- [ ] Swipe actions have `accessibilityLabel` for VoiceOver users
- [ ] Sidebar open/close has `accessibilityViewIsModal` when open

## 5. Deliverable

Write output to: `docs/audits/findings/06-sessions-sidebar-findings.md`

Finding IDs: `sessions-NNN`.

## 6. Exit Criteria

- [ ] `docs/audits/findings/06-sessions-sidebar-findings.md` written
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test --selectProjects components` passes
- [ ] Row 06 in `docs/audits/README.md` flipped to `done`
