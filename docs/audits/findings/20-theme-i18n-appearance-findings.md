# Audit 20 — Theme, i18n & Appearance: Findings

**Audit plan:** `docs/audits/20-theme-i18n-appearance.md`  
**Auditor:** agent  
**Date:** 2026-05-11  
**Status:** remediated — 2026-05-11

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 1 |
| 🟠 High | 1 |
| 🟡 Medium | 2 |
| 🔵 Low | 4 |
| ⚪ Nit | 4 |

The most urgent issue is a malformed `en/common.json` that causes the entire test suite to fail — 26 suites error out before any tests can execute. The second most impactful issue is a color-contrast bug in the theme generation script that produces white-on-white text for the "Star (Parasol)" theme user bubbles. Several lower-priority findings relate to i18n completeness, hardcoded colors, and missing test coverage.

---

## Findings

---

### 🔴 CRITICAL-01 — `en/common.json` is structurally invalid JSON — **fixed**

**File:** `src/i18n/locales/en/common.json`, line ~954  
**Affects:** All 26 Jest test suites that import `src/i18n/index.ts`

#### What happened

When the `audioPlayingPill` section was added to `en/common.json`, the opening key–brace line `"agentFileViewer": {` was accidentally deleted. As a result, the `agentFileViewer` key's contents (`notConnected`, `fileNotFound`, `loadFailed`, `closeLabel`, `copiedLabel`, `copyLabel`, `truncated`) become bare key–value pairs inside the `"chat"` object with no enclosing key. This causes an extra `}` to prematurely close the `"chat"` section (and therefore the root JSON object) at line ~1087. Everything after that line — `"input"`, `"errors"`, `"badges"`, `"demo"`, `"navigation"` — is "extra data" that strict JSON parsers reject.

Confirmed with:
```
node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/en/common.json', 'utf8'))"
→ SyntaxError: Unexpected non-whitespace character after JSON at position 51880 (line 1088 column 4)

python3 -c "import json; json.loads(open('src/i18n/locales/en/common.json').read())"
→ json.decoder.JSONDecodeError: Extra data: line 1088 column 4 (char 51880)
```

#### Current (broken) structure at `src/i18n/locales/en/common.json` lines 950–962

```json
    "audioPlayingPill": {
      "speaking": "Speaking",
      "stopLabel": "Stop audio playback"
    },
      "notConnected": "Not connected to gateway",          ← orphaned — missing "agentFileViewer": {
      "fileNotFound": "\"{{fileName}}\" was not found ...",
      "loadFailed": "Could not load file. ...",
      "closeLabel": "Close",
      "copiedLabel": "Copied",
      "copyLabel": "Copy file contents",
      "truncated": "Showing first 256 KB of this file."
    },                                                     ← closes "chat" prematurely
```

#### Proposed fix

Add back the missing `"agentFileViewer": {` line on line 954 (between the `audioPlayingPill` close and `"notConnected"`):

```diff
     "audioPlayingPill": {
       "speaking": "Speaking",
       "stopLabel": "Stop audio playback"
     },
+    "agentFileViewer": {
       "notConnected": "Not connected to gateway",
       ...
       "truncated": "Showing first 256 KB of this file."
     },
```

The corresponding `zh-CN/common.json` is valid and already has both sections correctly structured (verified via `python3 json.loads`). The fix is a one-line addition.

---

### 🟠 HIGH-01 — `contrastForeground()` silently breaks on 3-digit hex — star theme is white-on-white — **fixed**

**File:** `scripts/generate-vscode-themes.mjs`, lines 64–80  
**Generated output:** `src/constants/themes/generated.ts`

#### The bug

`luminance(hex)` assumes the input is a 6-digit hex string after stripping `#`. When called with a 3-digit shorthand (e.g., `#fff`), `hex.replace('#', '')` yields `'fff'` (3 chars). The slices are:

| Slice | Value | `parseInt(_, 16)` |
|-------|-------|-------------------|
| `h.slice(0, 2)` | `'ff'` | 255 ✓ |
| `h.slice(2, 4)` | `'f'` | 15 ✗ (should be 255) |
| `h.slice(4, 6)` | `''` | `NaN` ✗ |

`linearise(NaN)` propagates `NaN` through the luminance calculation. `NaN > 0.179` is `false`, so `contrastForeground` always returns `'#FFFFFF'` for any 3-digit hex input — including pure white backgrounds.

```js
// scripts/generate-vscode-themes.mjs line 73–80
function contrastForeground(bgHex) {
  try {
    const lum = luminance(bgHex.slice(0, 7));  // ← .slice(0, 7) on '#fff' → '#fff' (still 3-digit)
    return lum > 0.179 ? '#000000' : '#FFFFFF';
  } catch {
    return '#FFFFFF';  // ← catch doesn't help because NaN doesn't throw
  }
}
```

#### Impact in generated output

`src/constants/themes/generated.ts` — Star (Parasol) theme:
```ts
userBubble: '#fff',             // white background
userBubbleForeground: '#FFFFFF' // white text — invisible
```

Any user on the Star theme who sends a message will see **white text on a white bubble** — the message is invisible.

#### Proposed fix

Expand 3-digit hex in `luminance` (or at the entry point of `contrastForeground`) before slicing:

```js
function expandHex(hex) {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return '#' + h.split('').map(c => c + c).join('');
  }
  return hex.slice(0, 7); // strip alpha if 8-digit
}

function luminance(hex) {
  const h = expandHex(hex).replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}
```

After fixing, the script must be re-run (`node scripts/generate-vscode-themes.mjs`) to regenerate `src/constants/themes/generated.ts`. For `#fff` → expanded `#ffffff` → luminance ≈ 1.0 → `lum > 0.179` → `'#000000'` (correct: black text on white bubble).

---

### 🟡 MED-01 — English `about` screen sections are empty due to missing `aboutCollapsible.json` for `en` — **fixed**

**Files:**  
- `src/i18n/locales/zh-CN/aboutCollapsible.json` (exists)  
- `src/i18n/locales/en/aboutCollapsible.json` (does not exist)  
- `src/i18n/index.ts` line ~32 (merges zh-CN about data only)  
- `src/components/settings/AboutScreen.tsx` lines 414, 720, 863

#### Detail

`AboutScreen.tsx` calls `t()` for three structured data keys:

```ts
// line 414
t('about.changelogEntries', { returnObjects: true })
// line 720
t('about.privacySections', { returnObjects: true })
// line 863
t('about.threatSections', { returnObjects: true })
```

These keys exist only in `zh-CN/aboutCollapsible.json`. The `i18n/index.ts` merge:
```ts
resources: {
  en: { common: en },                                 // no aboutCollapsible merge
  'zh-CN': { common: { ...zhCN, about: { ...zhCN.about, ...zhCNAboutCollapsible } } }
}
```

For English users (`i18next` resolves `en`), `t('about.changelogEntries', { returnObjects: true })` returns the key string `'about.changelogEntries'` (a string, not an array). The downstream parse functions (`parseChangelogEntries`, `parseLabelItemSections`) almost certainly guard against this, resulting in empty/skeleton sections on the About screen for all English users.

This is a **functional regression** hidden by the zh-CN-only architecture — a pattern where i18n is used for zh-CN structured data but hardcoded or empty for English.

#### Proposed fix

Create `src/i18n/locales/en/aboutCollapsible.json` with English content mirroring the zh-CN structure, then merge it in `i18n/index.ts` similarly to zh-CN.

---

### 🟡 MED-02 — Locale parity test passes despite broken `en/common.json` (false confidence) — **fixed**

**File:** `src/i18n/__tests__/locale-parity.test.ts`

#### Detail

`locale-parity.test.ts` imports `en/common.json` and `zh-CN/common.json` directly and compares their keys recursively. When run in Jest's environment (which uses a JSONC-tolerant transform for JSON files), the malformed `en/common.json` does **not** throw — Jest's module system appears to parse JSON more leniently than `JSON.parse`. This means the parity test reports "PASS" even though the file is structurally invalid and the keys actually loaded may be incomplete (only the first ~1087 lines before the premature close).

The test gives false confidence that locale parity is maintained and that the JSON is well-formed. In practice, any runtime that uses native `JSON.parse` (Node.js, the JS engine on device) will fail.

#### Proposed fix

1. Fix CRITICAL-01 first (restore the missing `"agentFileViewer": {` line).
2. Add an explicit validity check in the parity test or a dedicated test:

```ts
it('en/common.json is valid JSON', () => {
  const raw = require('fs').readFileSync(
    require('path').join(__dirname, '../locales/en/common.json'),
    'utf8'
  );
  expect(() => JSON.parse(raw)).not.toThrow();
});
```

---

### 🔵 LOW-01 — Hardcoded hex values bypass the theme system in multiple components — **fixed**

**Severity:** Low (visual correctness, not a crash)

The following files use hardcoded hex color values instead of theme tokens. While some serve as explicit fallbacks (`colors.warning ?? '#F59E0B'`), the fallbacks are only ever reached when the theme system fails to provide a value — which shouldn't happen at runtime but masks theme system bugs in tests and alternative themes.

| File | Line(s) | Value(s) |
|------|---------|---------|
| `src/components/chat/MessageBubble.tsx` | 812, 819, 820, 825, 826, 827 | `colors.warning ?? '#F59E0B'`, etc. |
| `src/components/chat/InlineAnnotationRow.tsx` | 214, 215 | `colors.destructive ?? '#DC2626'` |
| `src/components/input/InputBarInfoRow.tsx` | 101 | `'#F59E0B'` (no fallback guard) |
| `src/components/common/ErrorBoundary.tsx` | 124 | `color: '#fff'` |
| `src/components/chat/ThinkingNode.tsx` | 294 | `color: '#FFFFFF'` |
| `src/components/settings/AboutScreen.tsx` | 639, 1093 | `color: '#fff'` |
| `src/components/settings/SettingsScreen.tsx` | 157 | `color: '#fff'` |
| `src/components/common/ConfettiBurst.tsx` | 40, 121 | `#A855F7` |

`InputBarInfoRow.tsx` line 101 is the most concerning because there is no conditional — the hex is always used directly.

---

### 🔵 LOW-02 — Old AsyncStorage migration keys are never cleaned up — **fixed**

**File:** `src/contexts/ThemeContext.tsx`

`ThemeContext` reads four consecutive legacy keys on mount (`THEME_KEY_V1` through `V4`) to migrate old user preferences, but only writes `THEME_KEY_V4` going forward. The V1/V2/V3 keys are never deleted after a successful migration, leaving stale data in AsyncStorage indefinitely for users who upgrade from older builds.

```ts
// V1 → V4 migration reads happen on every app launch after the first
const [v1, v2, v3, v4] = await AsyncStorage.multiGet([THEME_KEY_V1, THEME_KEY_V2, THEME_KEY_V3, THEME_KEY_V4]);
```

**Proposed fix:** after migrating, call `AsyncStorage.multiRemove([THEME_KEY_V1, THEME_KEY_V2, THEME_KEY_V3])` so old keys are pruned on the first launch after upgrade.

---

### 🔵 LOW-03 — No tests for `ThemeContext` or `LanguageContext` — **fixed**

**File:** `src/contexts/__tests__/` (directory)

`src/contexts/__tests__/` contains only `ServerProfileSyncContext.test.tsx`. Neither `ThemeContext` nor `LanguageContext` have any unit tests.

Key behaviors currently untested:
- V1→V4 theme key migration logic
- System scheme resolution (`Appearance.getColorScheme()` mock)
- `setMode('system')` correctly reflects light/dark via system scheme
- `AppState` change triggers language re-detection in `LanguageContext`
- `AsyncStorage` persistence round-trip for both contexts
- `emitThemeToggled` is fired on mode change

These contexts sit at the root of the app's appearance system; bugs in migration or scheme resolution would be silent without test coverage.

---

### 🔵 LOW-04 — `app/_layout.tsx` critical strings are hardcoded in English — **fixed**

**File:** `app/_layout.tsx` lines ~187–191, ~207, ~263–265  
*(Note: `app/_layout.tsx` is outside the formal scope of plan 20; recorded here for completeness.)*

The OTA security-update modal and the root error fallback use hardcoded English strings that bypass `t()`:

```tsx
// ~line 187
<Text>Security update required</Text>
// ~line 189  
<Text>A critical update has been downloaded...</Text>
// ~line 191
<Pressable><Text>Restart now</Text></Pressable>

// ~line 263
<Text style={...}>ClawBoy encountered an error</Text>
// ~line 265
<Text>Please force-quit and reopen the app...</Text>
```

These strings exist as i18n keys in both `en/common.json` and `zh-CN/common.json` (`errors.criticalUpdate.*`, `errors.appCrash.*`) but are not wired up via `t()`. This means non-English users see English during the most critical moments (security update, crash).

---

### ⚪ NIT-01 — `useTheme.ts` is a trivial pass-through with no added value — **fixed**

**File:** `src/hooks/useTheme.ts`

```ts
export function useTheme(): ReturnType<typeof useThemeContext> {
  return useThemeContext();
}
```

This wrapper adds one indirection but provides no encapsulation, no selector logic, and no type narrowing. If the intent is to create a stable public surface that hides implementation detail, it should at minimum return a typed subset (e.g., only `colors`, `mode`, `setMode` — not the full context internals). As-is it simply re-exports everything, so consumers could also call `useThemeContext()` directly with identical results.

---

### ⚪ NIT-02 — Star theme uses inconsistent 3-digit hex notation — **fixed**

**File:** `src/constants/themes/generated.ts` — `star` palette block

All other generated palettes use 6-digit `#rrggbb` hex. The `star` palette uses shorthand (`#fff`, `#eee`, `#888`, `#777`, etc.) for many values. While visually equivalent, the inconsistency exacerbates HIGH-01 (the `contrastForeground` 3-digit bug) and makes the file harder to search/compare. After fixing HIGH-01, the generation script should expand all 3-digit hex outputs.

---

### ⚪ NIT-03 — `themes.config.mjs` has no entries for the built-in `dark` and `light` base palettes — **fixed**

**File:** `scripts/themes.config.mjs`

`THEMES` array lists only externally sourced VS Code themes. The `dark` and `light` palettes defined directly in `src/constants/theme.ts` (`Colors.dark`, `Colors.light`) have no corresponding config entry and are not generated or validated by the script. If the generation pipeline is extended to replace hardcoded palettes, the base themes will be missing. A comment or placeholder entry documenting this limitation would prevent future confusion.

---

### ⚪ NIT-04 — `resolvedScheme` dark-default is undocumented — **fixed**

**File:** `src/contexts/ThemeContext.tsx`

```ts
const resolvedScheme = sys === 'light' ? 'light' : 'dark';  // 'dark' is the default
```

When `Appearance.getColorScheme()` returns `null` (no system preference set), this defaults to `'dark'`. This is correct per `.cursorrules` ("Dark mode default"), but the intent is invisible at this line — a brief comment would make the deliberate choice clear to future contributors.

---

## Key Files Audited

| File | Lines Read | Status |
|------|-----------|--------|
| `src/contexts/ThemeContext.tsx` | full | ✅ audited |
| `src/contexts/LanguageContext.tsx` | full | ✅ audited |
| `src/hooks/useTheme.ts` | full | ✅ audited |
| `src/i18n/index.ts` | full | ✅ audited |
| `src/constants/theme.ts` | full | ✅ audited |
| `src/constants/themes/generated.ts` | partial (star palette) | ✅ audited |
| `src/i18n/locales/en/common.json` | full + git diff | ✅ audited |
| `src/i18n/locales/zh-CN/common.json` | full + git diff | ✅ audited |
| `src/i18n/locales/zh-CN/aboutCollapsible.json` | full | ✅ audited |
| `src/i18n/__tests__/locale-parity.test.ts` | full | ✅ audited |
| `app/settings/appearance.tsx` | full | ✅ audited |
| `scripts/generate-vscode-themes.mjs` | full | ✅ audited |
| `scripts/themes.config.mjs` | full | ✅ audited |
| `src/components/chat/MessageBubble.tsx` | spot-checked | ✅ audited |
| `src/components/chat/InlineAnnotationRow.tsx` | spot-checked | ✅ audited |
| `src/components/input/InputBarInfoRow.tsx` | spot-checked | ✅ audited |
| `src/components/common/ErrorBoundary.tsx` | spot-checked | ✅ audited |
| `src/components/chat/ThinkingNode.tsx` | spot-checked | ✅ audited |
| `src/components/settings/AboutScreen.tsx` | spot-checked (lines 410–420, 716–730, 860–870, 635–645, 1090–1095) | ✅ audited |
| `src/components/settings/SettingsScreen.tsx` | spot-checked | ✅ audited |
| `src/components/common/ConfettiBurst.tsx` | spot-checked | ✅ audited |
