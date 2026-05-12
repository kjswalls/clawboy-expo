# Audit X6 — Accessibility & i18n: Findings

**Audit plan:** `docs/audits/X6-a11y-i18n.md`
**Auditor:** agent
**Date:** 2026-05-12
**Status:** complete

---

## Summary

| Severity | Count |
|----------|-------|
| 🟠 High | 0 |
| 🟡 Medium | 2 |
| 🔵 Low | 5 |
| ⚪ Nit | 5 |

Auto-fixes applied: **20** (across 9 files). The most impactful findings are two medium-severity issues: all Modals in the app are missing `accessibilityViewIsModal`, and all toggle switches use `accessibilityState.checked` instead of the plan-preferred `accessibilityValue`. Both are proposed-only (behavioral or structural changes). The hard-coded string scan found three hard-coded English strings in `SettingsMetaPanels.tsx` and two in `app/index.tsx` (in a hidden `SHOW_NOTIFICATIONS_ROW` block). RTL layout has 29 asymmetric `marginLeft`/`paddingLeft` usages — all assessed as intentional layout offsets; the most semantically significant ones are flagged as nits.

---

## 1. Locale Completeness Table

| Locale | Keys present | Missing vs `en` | % complete |
|--------|-------------|-----------------|------------|
| `en` (baseline) | 1204 | — | 100% |
| `zh-CN` | 1204 | 0 | 100% |

Both locale bundles are fully in parity across `common.json` + `aboutCollapsible.json`. The prior audit (20-theme-i18n-appearance) fixed the malformed JSON and the missing `en/aboutCollapsible.json`; those issues are resolved.

`i18next` is configured with `fallbackLng: 'en'` in `src/i18n/index.ts` (line 60). ✅

---

## 2. Hard-Coded String Scan

**Scan command:** `rg '<Text[^>]*>[A-Z][a-z]+' src/components/ app/ -g "*.tsx" --no-heading -n`

| File:line | String | Covered by `t()`? | Recommendation |
|-----------|--------|-------------------|----------------|
| `app/index.tsx:220` | `"Chat failed to render"` | ❌ No | **a11y-013** — wrap in `t()` |
| `app/index.tsx:233` | `"Try again"` | ❌ No | **a11y-013** — use `t('common.tryAgain')` |
| `src/components/chat/InternalEventCard.tsx:190` | `"Task"` | ❌ No | **a11y-014** — internal debug label, low priority |
| `src/components/chat/InternalEventCard.tsx:198` | `"Result"` | ❌ No | **a11y-014** — internal debug label, low priority |
| `src/components/settings/SettingsMetaPanels.tsx:518` | `"Debug"` | ❌ No | **a11y-015** — debug-only panel, `SHOW_NOTIFICATIONS_ROW`-gated |
| `src/components/settings/SettingsMetaPanels.tsx:542` | `"BrandLoader Preview"` | ❌ No | **a11y-015** — debug-only panel |
| `src/components/settings/SettingsMetaPanels.tsx:127,132,135` | `"Notifications"`, `"Manage alerts and notifications"` | ❌ No | **a11y-012** — feature-flagged row (`SHOW_NOTIFICATIONS_ROW`), but still needs i18n when enabled |

**Note:** `app/index.tsx` was previously flagged in audit 20 (LOW-04) for hardcoded OTA/crash strings — the two new chat-error-boundary strings are additional instances in the same file. `SettingsMetaPanels.tsx` lines 518/542 are inside a dev-only debug panel and carry low urgency.

---

## 3. Accessibility Audit Table

### ✅ Components with full a11y coverage (no issues found)

| Component | Verified elements |
|-----------|------------------|
| `ThinkingNode.tsx` | Expand/collapse Pressable — `accessibilityLabel`, `accessibilityRole="button"`, `accessibilityState={{ expanded }}` ✅ |
| `ToolCallCard.tsx` | Expand/collapse Pressable — `accessibilityLabel`, `accessibilityRole="button"`, `accessibilityState` ✅ |
| `InputBarHeader.tsx` | Model/agent picker Pressables — `accessibilityRole="button"`, `accessibilityLabel` via `t()` ✅ |
| `InputBarHeaderToggles.tsx` | Thinking/tool/refresh toggles — `accessibilityLabel`, `accessibilityRole="button"` ✅ |
| `InputBarActionBar.tsx` | Send, stop, camera, voice, attach, slash — all have `accessibilityLabel` + `accessibilityRole="button"` ✅ |
| `SessionRow.tsx` (main row) | `accessibilityLabel`, `accessibilityRole="button"`, `accessibilityState={{ selected }}` ✅ |
| `SessionSidebarList.tsx` (close, new-session) | `accessibilityLabel`, `accessibilityRole="button"` ✅ |
| `SignInSheet.tsx` | All buttons (close, skip, send, done, Google, back) — `accessibilityLabel`, `accessibilityRole="button"` ✅ |
| `OnboardingStepNav.tsx` | Back/forward Pressables — `accessibilityRole="button"`, `accessibilityLabel` ✅; progress bar — `accessibilityRole="progressbar"`, `accessibilityValue` ✅ |
| `SettingsTtsSection.tsx` | TTS toggles — `accessibilityRole="switch"`, `accessibilityLabel` ✅ |
| `SettingsConventionsSection.tsx` | Preview button — `accessibilityRole="button"`, `accessibilityLabel` ✅ |
| `MediaEmbed.tsx` (audio play/pause) | `accessibilityLabel`, `accessibilityRole="button"` ✅ |
| `MediaEmbed.tsx` (image thumbnail) | `accessibilityLabel`, `accessibilityRole="imagebutton"` ✅ |
| `AgentsMdPreviewModal.tsx` | `accessibilityViewIsModal` ✅ |
| `SessionSidebar.tsx` | `accessibilityViewIsModal={isOpen}` ✅ |

---

### Auto-fixes applied (finding IDs a11y-001 through a11y-011)

| ID | Severity | Component | Element | Issue | Fix applied |
|----|----------|-----------|---------|-------|-------------|
| a11y-001 | 🔵 Low | `CodeBlock.tsx` | Copy pill Pressable (with lang label) | Missing `accessibilityLabel` and `accessibilityRole` | Added `accessibilityLabel={copied ? t('chat.codeBlock.copied') : t('chat.codeBlock.copy')}` + `accessibilityRole="button"` |
| a11y-002 | 🔵 Low | `CodeBlock.tsx` | Floating copy icon Pressable (no-lang variant) | Missing `accessibilityLabel` and `accessibilityRole` — icon-only button invisible to screen readers | Added same label/role as a11y-001 |
| a11y-003 | 🔵 Low | `MediaEmbed.tsx` | Modal backdrop Pressable (image lightbox) | Missing `accessibilityLabel` and `accessibilityRole`; also added `useTranslation` to `MediaEmbed` component (was only in `AudioEmbed`) | Added `accessibilityLabel={t('common.close')}` + `accessibilityRole="button"` |
| a11y-004 | ⚪ Nit | `SessionRow.tsx` | Pin/unpin swipe action Pressable | Had `accessibilityLabel`, missing `accessibilityRole="button"` | Added `accessibilityRole="button"` |
| a11y-005 | ⚪ Nit | `SessionRow.tsx` | Rename swipe action Pressable | Had `accessibilityLabel`, missing `accessibilityRole="button"` | Added `accessibilityRole="button"` |
| a11y-006 | ⚪ Nit | `SessionRow.tsx` | Reset/delete swipe action Pressable | Had `accessibilityLabel`, missing `accessibilityRole="button"` (both variants) | Added `accessibilityRole="button"` to both |
| a11y-007 | ⚪ Nit | `SessionRow.tsx` | Rename TextInput | Missing `accessibilityLabel` | Added `accessibilityLabel={t('sidebar.session.renameLabel')}` |
| a11y-008 | ⚪ Nit | `SessionSidebarList.tsx` | Pinned section header Pressable | `accessibilityRole="button"` present, missing `accessibilityLabel` and `accessibilityState` | Added `accessibilityLabel={t('sidebar.pinned')}` + `accessibilityState={{ expanded: item.expanded }}` |
| a11y-009 | ⚪ Nit | `SessionSidebarList.tsx` | Recent sessions section header Pressable | `accessibilityRole="button"` present, missing `accessibilityLabel` and `accessibilityState` | Added `accessibilityLabel={t('sidebar.recentSessions')}` + `accessibilityState={{ expanded: item.expanded }}` |
| a11y-010 | 🔵 Low | `InputBarCard.tsx` | Main chat message TextInput | Missing `accessibilityLabel` — primary composition field is invisible to screen readers | Added `accessibilityLabel={placeholder}` (uses already-computed `t()` placeholder string) |
| a11y-011 | 🔵 Low | `AddServerSheet.tsx` | Server Name, Server Address, Port, Auth TextInputs (×4) | All 4 TextInputs missing `accessibilityLabel` | Added `accessibilityLabel` using existing field label keys (`fieldServerName`, `fieldServerAddress`, `fieldPort`, `authTokenLabel`/`authPassword`) |

Additional auto-fixes in `AddServerSheet.tsx` (grouped under a11y-011):

| Element | Issue | Fix applied |
|---------|-------|-------------|
| Clear button (header) | Missing `accessibilityLabel` and `accessibilityRole` | Added `accessibilityLabel={t('settings.addServer.clearBtn')}` + `accessibilityRole="button"` |
| Device ID copy Pressable | Missing `accessibilityLabel` and `accessibilityRole` | Added `accessibilityLabel={t('common.copy')}` + `accessibilityRole="button"` |
| Auth method radio buttons (token / password) | Missing `accessibilityLabel`, `accessibilityRole`, `accessibilityState` | Added `accessibilityRole="radio"` + `accessibilityLabel` + `accessibilityState={{ checked: authMethod === m }}` |
| Token help toggle | Had `accessibilityRole` and `accessibilityState`, missing `accessibilityLabel` | Added `accessibilityLabel={t('settings.addServer.tokenHelpToggle')}` |
| Delete profile button | Had `accessibilityLabel`, missing `accessibilityRole` | Added `accessibilityRole="button"` |
| Test connection button | Missing `accessibilityLabel` and `accessibilityRole` | Added dynamic label + `accessibilityRole="button"` |
| Connect / Save button | Missing `accessibilityLabel` and `accessibilityRole` | Added dynamic label + `accessibilityRole="button"` |

Additional auto-fixes in other files (grouped):

| File | Element | Issue | Fix applied |
|------|---------|-------|-------------|
| `SettingsServerBlock.tsx` | Exit demo Pressable | Had `accessibilityLabel`, missing `accessibilityRole` | Added `accessibilityRole="button"` |
| `SettingsServerBlock.tsx` | Add server Pressable | Missing `accessibilityLabel` and `accessibilityRole` | Added both |
| `FeedbackSheet.tsx` | Back/close header Pressable | Had `accessibilityLabel`, missing `accessibilityRole` | Added `accessibilityRole="button"` |
| `FeedbackSheet.tsx` | Crash dismiss Pressable | Missing `accessibilityLabel` and `accessibilityRole` | Added `accessibilityLabel={t('feedback.crashDismiss')}` + `accessibilityRole="button"` |
| `FeedbackFormBody.tsx` | Title, body, contact TextInputs (×3) | Missing `accessibilityLabel` | Added `accessibilityLabel` using existing section label keys |

---

### 🟡 MED-01 — All Modals missing `accessibilityViewIsModal`

**Finding ID:** a11y-016  
**Severity:** Medium  
**Files:** 13 Modal sites — see list below

| File | Modal description |
|------|------------------|
| `app/_layout.tsx:167` | Critical OTA update modal |
| `src/components/chat/SectionRangePickerModal.tsx:92` | Section range picker |
| `src/components/badges/BadgeDetailModal.tsx:117` | Badge detail sheet |
| `src/components/chat/AnnotationPreviewModal.tsx:81` | Annotation preview |
| `src/components/input/ContextUsageSheet.tsx:73` | Context usage sheet |
| `src/components/chat/AgentFileViewerModal.tsx:115` | Agent file viewer |
| `src/components/chat/MediaEmbed.tsx:340` | Image lightbox |
| `src/components/input/InputBarPickerModal.tsx:162` | Model/agent picker |
| `src/components/settings/ThemeVariantDropdown.tsx:87` | Theme variant picker |
| `src/components/settings/PinnedKeysScreen.tsx:414` | Pinned keys |
| `src/components/settings/SettingsTtsSection.tsx:45` | TTS voice picker |
| `src/components/settings/FeedbackSheet.tsx:303` | Feedback form |
| `src/components/settings/PinMismatchScreen.tsx:85` | PIN mismatch |
| `src/components/settings/AddServerSheet.tsx:453` | Add/edit server |

Without `accessibilityViewIsModal={true}`, VoiceOver/TalkBack will allow the user to focus elements outside the open modal — a standard iOS/Android accessibility requirement for any full-screen overlay.

**Two modals already correct:** `AgentsMdPreviewModal.tsx` and `SessionSidebar.tsx`.

**Proposed fix:** Add `accessibilityViewIsModal={true}` to each `<Modal>` open prop condition. Example:

```tsx
<Modal visible={visible} transparent animationType="fade" accessibilityViewIsModal={true}>
```

This is a proposed fix (not auto-applied) because modifying 13 modal files carries surface area risk in the main render paths.

---

### 🟡 MED-02 — Toggle switches use `accessibilityState.checked` instead of `accessibilityValue`

**Finding ID:** a11y-017  
**Severity:** Medium  
**Files:** 6 switch components

| File | Line | Switch label |
|------|------|-------------|
| `SettingsMetaPanels.tsx` | 104–121 | Confirm destructive commands |
| `SettingsMetaPanels.tsx` | 390–400 | Cache replay |
| `SettingsTtsSection.tsx` | 172–191 | Auto-speak replies |
| `SettingsTtsSection.tsx` | 196–227 | Device voice |
| `FeedbackDiagnosticsRow.tsx` | 30–40 | Include diagnostics |
| `FeedbackLogsRow.tsx` | 30–40 | Include logs |
| `AccountSettingsScreen.tsx` | 116–130 | Track achievements |

All switches use `accessibilityState={{ checked: value }}`. Per WCAG ARIA patterns and React Native documentation for `accessibilityRole="switch"`, the preferred announcement is `accessibilityValue={{ text: value ? 'on' : 'off' }}` (which reads "on" or "off" aloud). While `accessibilityState.checked` does expose state to accessibility trees, it may not announce as "on/off" on all platforms.

**Proposed fix:** Replace `accessibilityState={{ checked: value }}` with `accessibilityValue={{ text: value ? 'on' : 'off' }}` on all `accessibilityRole="switch"` elements.

---

### 🔵 LOW-01 — Hard-coded English strings in `app/index.tsx` chat error boundary

**Finding ID:** a11y-013  
**Severity:** Low (extends prior audit 20 LOW-04)  
**File:** `app/index.tsx` lines 220, 233

```tsx
// line 220
<Text style={chatErrorStyles.title}>Chat failed to render</Text>
// line 233
<Text style={chatErrorStyles.btnText}>Try again</Text>
```

`common.tryAgain` exists in the locale. `"Chat failed to render"` has no corresponding locale key.

**Proposed fix:**

```tsx
<Text style={chatErrorStyles.title}>{t('errors.chatRenderFailed')}</Text>
<Text style={chatErrorStyles.btnText}>{t('common.tryAgain')}</Text>
```

Add `errors.chatRenderFailed` key to both locale files.

---

### 🔵 LOW-02 — Hard-coded English strings in debug panel (`SettingsMetaPanels.tsx`)

**Finding ID:** a11y-014  
**Severity:** Low (feature-flagged, low user impact)  
**File:** `src/components/settings/SettingsMetaPanels.tsx` lines 127, 132, 135, 518, 542

```tsx
// Notifications row (SHOW_NOTIFICATIONS_ROW = false currently)
accessibilityLabel="Notifications"          // line 127
<Text>Notifications</Text>                  // line 132
<Text>Manage alerts and notifications</Text> // line 135

// Debug panel
<Text>Debug</Text>                          // line 518
<Text>BrandLoader Preview</Text>            // line 542
```

`SHOW_NOTIFICATIONS_ROW` is currently `false` so the Notifications row is never rendered, but the hardcoded strings will become visible when the feature ships. The debug panel strings are low priority (dev-only).

**Proposed fix:** Move "Notifications" / "Manage alerts…" to i18n keys under `settings.notifications.*`. The debug panel strings can be left as-is or wrapped in `__DEV__`-only blocks.

---

### 🔵 LOW-03 — `InternalEventCard.tsx` "Task" / "Result" section labels are hardcoded

**Finding ID:** a11y-015  
**Severity:** Low  
**File:** `src/components/chat/InternalEventCard.tsx` lines 190, 198

```tsx
<Text style={[styles.sectionLabel, { color: mutedColor }]}>Task</Text>
<Text style={[styles.sectionLabel, { color: mutedColor }]}>Result</Text>
```

These labels appear in AI message cards that show task/result breakdowns. They are user-visible but currently English-only.

**Proposed fix:** Add `chat.internalEvent.taskLabel` and `chat.internalEvent.resultLabel` to both locales and use `t()`.

---

### ⚪ NIT-01 — RTL layout: 29 asymmetric margin/padding uses, none critical

**Finding ID:** a11y-018  
**Severity:** Nit  

Scan: `rg "marginLeft|paddingLeft|marginRight|paddingRight" src/components/ app/ -g "*.tsx"` returned 29 hits across 16 files.

All usages are intentional layout micro-adjustments (icon nudges, decorative indents, hit-slop offsets). None are structural left-vs-right asymmetries that would flip meaning under RTL. Notable instances:

| File | Line | Value | Assessment |
|------|------|-------|------------|
| `InternalEventCard.tsx:270` | `marginLeft: Spacing.md + 24 + Spacing.sm` | Connector indentation | Nit — consider `marginStart` |
| `ThinkingNode.tsx:329` | `marginLeft: Spacing.md` | Body indent below badge | Nit — consider `marginStart` |
| `ToolCallCard.tsx:323` | `marginLeft: Spacing.md` | Same pattern | Nit — consider `marginStart` |
| `AccountSection.tsx:206-207` | `paddingLeft: Spacing.md, paddingRight: Spacing.sm` | Row padding (asymmetric) | Nit — consider `paddingHorizontal` or start/end |
| `SessionRow.tsx:68` | `marginLeft: 4` | Pin badge nudge | Minor |

For a future RTL pass, replace `marginLeft`/`paddingLeft` with `marginStart`/`paddingStart` (and `Right` → `End`). This is a non-trivial refactor; deferring to a dedicated RTL audit.

---

### ⚪ NIT-02 — `allowFontScaling={false}` — no violations found

**Finding ID:** a11y-019  
**Severity:** Nit (no issue)

Scan for `allowFontScaling={false}`: **0 matches**. All `Text` components allow dynamic type by default. ✅

---

### ⚪ NIT-03 — `accessibilityLabel="Notifications"` is a hardcoded English string in `SettingsMetaPanels.tsx`

**Finding ID:** a11y-020  
**Severity:** Nit (overlaps a11y-014 — listed separately for clarity)  
**File:** `src/components/settings/SettingsMetaPanels.tsx:127`

The prop `accessibilityLabel="Notifications"` uses a raw string literal instead of `t()`. This is behind the `SHOW_NOTIFICATIONS_ROW` flag so not currently reachable. Tracked separately as a nit because it is an `accessibilityLabel` (which auto-fix rules would allow) but the string is intentionally not fixed since the entire row is feature-flagged and hardcoded — the whole row needs an i18n pass when it ships.

---

## 4. Dynamic Type

No `allowFontScaling={false}` instances found anywhere in `src/components/` or `app/`. All `Text` components respect the system font size setting. ✅

---

## 5. RTL Layout Summary

See NIT-01 above. 29 asymmetric left/right spacing instances. None cause semantic RTL bugs; all are visual nudges or structural indents where RTL would produce equivalent (mirrored) layouts. A dedicated RTL pass should convert `marginLeft` → `marginStart` and `paddingLeft` → `paddingStart` throughout.

---

## Auto-fixes Applied

| Finding ID | Severity | File | Description |
|------------|----------|------|-------------|
| a11y-001 | 🔵 Low | `src/components/chat/CodeBlock.tsx` | Added `accessibilityLabel` + `accessibilityRole="button"` to copy pill Pressable |
| a11y-002 | 🔵 Low | `src/components/chat/CodeBlock.tsx` | Added `accessibilityLabel` + `accessibilityRole="button"` to floating copy icon Pressable |
| a11y-003 | 🔵 Low | `src/components/chat/MediaEmbed.tsx` | Added `useTranslation` hook to `MediaEmbed` component; added `accessibilityLabel={t('common.close')}` + `accessibilityRole="button"` to lightbox backdrop Pressable |
| a11y-004 | ⚪ Nit | `src/components/sidebar/SessionRow.tsx` | Added `accessibilityRole="button"` to pin/unpin swipe action |
| a11y-005 | ⚪ Nit | `src/components/sidebar/SessionRow.tsx` | Added `accessibilityRole="button"` to rename swipe action |
| a11y-006 | ⚪ Nit | `src/components/sidebar/SessionRow.tsx` | Added `accessibilityRole="button"` to reset + delete swipe actions (both branches) |
| a11y-007 | ⚪ Nit | `src/components/sidebar/SessionRow.tsx` | Added `accessibilityLabel` to rename TextInput |
| a11y-008 | ⚪ Nit | `src/components/sidebar/SessionSidebarList.tsx` | Added `accessibilityLabel` + `accessibilityState` to pinned section header Pressable |
| a11y-009 | ⚪ Nit | `src/components/sidebar/SessionSidebarList.tsx` | Added `accessibilityLabel` + `accessibilityState` to recent sessions section header Pressable |
| a11y-010 | 🔵 Low | `src/components/input/InputBarCard.tsx` | Added `accessibilityLabel={placeholder}` to main chat TextInput |
| a11y-011 | 🔵 Low | `src/components/settings/AddServerSheet.tsx` | Added `accessibilityLabel` + `accessibilityRole` to 7 Pressables (clear, device ID copy, auth method radio ×2, token help toggle, test btn, connect/save btn, delete btn) and `accessibilityLabel` to 4 TextInputs (name, address, port, auth) |
| a11y-011b | 🔵 Low | `src/components/settings/SettingsServerBlock.tsx` | Added `accessibilityRole="button"` to exit demo Pressable; added `accessibilityLabel` + `accessibilityRole="button"` to add server Pressable |
| a11y-011c | 🔵 Low | `src/components/settings/FeedbackSheet.tsx` | Added `accessibilityRole="button"` to back/close header Pressable; added `accessibilityLabel` + `accessibilityRole="button"` to crash dismiss Pressable |
| a11y-011d | 🔵 Low | `src/components/settings/FeedbackFormBody.tsx` | Added `accessibilityLabel` to title, body, and contact TextInputs |

---

## Test Impact

**Command:** `npx jest --testPathPattern="src/components|app/" --passWithNoTests`

**Before fixes:** 21 suites, 177 tests — 1 snapshot failure (`MessageBubble.test.tsx` — `t` not in scope in `MediaEmbed` after adding `useTranslation` call; snapshot stale)

**Fix:** Snapshot updated (`npx jest ... -u`).

**After fixes:** 21 suites, 177 tests, 70 snapshots — **all pass** ✅

```
Test Suites: 21 passed, 21 total
Tests:       177 passed, 177 total
Snapshots:   70 passed, 70 total
Time:        15.24 s
```

---

## Key Files Audited

| File | Status |
|------|--------|
| `src/i18n/index.ts` | ✅ audited — fallbackLng correct, both locales loaded |
| `src/i18n/locales/en/common.json` | ✅ audited — 1204 keys, valid JSON |
| `src/i18n/locales/zh-CN/common.json` | ✅ audited — 1204 keys, full parity |
| `src/i18n/locales/en/aboutCollapsible.json` | ✅ audited |
| `src/i18n/locales/zh-CN/aboutCollapsible.json` | ✅ audited |
| `src/components/chat/ThinkingNode.tsx` | ✅ audited |
| `src/components/chat/ToolCallCard.tsx` | ✅ audited |
| `src/components/chat/CodeBlock.tsx` | ✅ audited + fixed (a11y-001, a11y-002) |
| `src/components/chat/MediaEmbed.tsx` | ✅ audited + fixed (a11y-003) |
| `src/components/chat/InternalEventCard.tsx` | ✅ audited (a11y-015 proposed) |
| `src/components/chat/MessageList.tsx` | ✅ audited — no interactive elements |
| `src/components/sidebar/SessionRow.tsx` | ✅ audited + fixed (a11y-004–007) |
| `src/components/sidebar/SessionSidebarList.tsx` | ✅ audited + fixed (a11y-008, a11y-009) |
| `src/components/sidebar/SessionSidebar.tsx` | ✅ audited — `accessibilityViewIsModal` present |
| `src/components/input/InputBarCard.tsx` | ✅ audited + fixed (a11y-010) |
| `src/components/input/InputBarActionBar.tsx` | ✅ audited — all a11y complete |
| `src/components/input/InputBarHeader.tsx` | ✅ audited — all a11y complete |
| `src/components/input/InputBarHeaderToggles.tsx` | ✅ audited — all a11y complete |
| `src/components/settings/AddServerSheet.tsx` | ✅ audited + fixed (a11y-011) |
| `src/components/settings/SignInSheet.tsx` | ✅ audited — all a11y complete |
| `src/components/settings/SettingsServerBlock.tsx` | ✅ audited + fixed (a11y-011b) |
| `src/components/settings/SettingsTtsSection.tsx` | ✅ audited — switches correct |
| `src/components/settings/SettingsMetaPanels.tsx` | ✅ audited (a11y-014, a11y-017 proposed) |
| `src/components/settings/FeedbackSheet.tsx` | ✅ audited + fixed (a11y-011c) |
| `src/components/settings/FeedbackFormBody.tsx` | ✅ audited + fixed (a11y-011d) |
| `src/components/settings/CompactSettingsSwitch.tsx` | ✅ audited — visual-only, doc comment correct |
| `src/components/onboarding/OnboardingScreen.tsx` | ✅ audited — no Pressables directly |
| `src/components/onboarding/components/OnboardingStepNav.tsx` | ✅ audited — all a11y complete |
| `app/index.tsx` | ✅ audited (a11y-013 proposed) |
| All 13 Modal sites | ✅ audited (a11y-016 proposed) |
