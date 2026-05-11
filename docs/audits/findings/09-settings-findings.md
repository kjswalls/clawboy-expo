# Settings Findings

Date: 2026-05-09
Agent: claude-sonnet-4-5
Status: done

## Summary

The settings area is broadly well-structured and uses consistent patterns (tokens, i18n in most places, proper error handling). The main concerns are: `SignInSheet` contains extensive hardcoded English strings that bypass the i18n system; several large files exceed the 300-line guideline and are split candidates; and the gateway logs display shows raw log content without token redaction, which could expose credentials if the server accidentally logs them. No critical or high severity issues were found.

## Severity Counts

- critical: 0
- high: 0
- med: 3
- low: 6
- nit: 6

## Findings

| ID | Sev | File:Line | Summary | Recommendation | Status |
|----|-----|-----------|---------|----------------|--------|
| settings-001 | med | `src/components/settings/SignInSheet.tsx`:160–363 | Extensive hardcoded English strings bypass i18n. Sheet titles ("Sign in to ClawBoy", "Check your email"), error Alert titles ("Apple Sign-In failed", "Google Sign-In failed", "Magic link failed", "Invalid email"), subtitles, button labels ("Send magic link", "Sending…", "Done", "← Other options", "Skip — continue without an account"), and email placeholder are all hardcoded. | Replace all user-visible strings with `t()` calls and add keys to `src/i18n/locales/en/common.json`. | proposed |
| settings-002 | low | `src/components/settings/AccountSection.tsx`:68,140,173 | Hardcoded English strings: "View all" (badge strip link), "Account settings" (two `accessibilityLabel` props), "Free" (tier pill text). | Use `t()` for all three. | proposed |
| settings-003 | med | `src/components/settings/FeedbackSheet.tsx`:471–547 | Screenshots are attached and sent to a public GitHub repository without any in-app disclosure at the point of attachment. The warning exists only in the privacy document buried in `AboutScreen`. Users may inadvertently upload screenshots containing sensitive content (gateway URLs, tokens visible on-screen, personal data). | Show a one-time disclosure banner at the top of the screenshots section warning that attached images will be posted publicly. Alternatively, show a confirmation dialog before the first screenshot is attached. | proposed |
| settings-004 | nit | `src/components/settings/SettingsMetaPanels.tsx`:657–667 | Dead module-level `styles` object. Comment claims it is a fallback but no exported function references it — all sections call `useMemo(() => createPanelStyles(tk), [tk])` directly. | Remove the dead object. | fixed |
| settings-005 | low | `src/components/settings/SettingsMetaPanels.tsx`:1–667 | File is 667 lines — over 2× the 300-line guideline. Contains five independent exported sections (`SettingsGeneralSection`, `SettingsAppearanceSection`, `SettingsMediaSection`, `SettingsFooter`, `SettingsDebugSection`) plus their shared style factory. | Propose splitting into separate files per section (e.g. `SettingsAppearanceSection.tsx`, `SettingsMediaSection.tsx`). Do not execute without human approval. | proposed |
| settings-006 | low | `src/components/settings/AboutScreen.tsx`:1–1301 | File is 1301 lines — 4× the guideline. Contains `AboutScreen`, `CollapsibleSection`, `ChangelogSection`, `ChangelogEntryCard`, `ChangelogMarkdownBullet`, `PrivacySecurityCard`, `LegalLinksCard`, `ThreatModelCard`, `DebugFeedbackCard`, and large inline data arrays. | Propose splitting: move collapsible widget, changelog rendering, and privacy/threat model cards into separate files. Do not execute without human approval. | proposed |
| settings-007 | low | `src/components/settings/SettingsMetaPanels.tsx`:516–524 | `SettingsDebugSection` calls hooks (`useTokens`, `useMemo`, `useState`, `useSafeAreaInsets`) after `if (!__DEV__) return null;`. This violates React's Rules of Hooks even though `__DEV__` is a build-time constant. The ESLint-disable comments suppress the warning but do not fix the underlying smell. | Restructure so an inner component `DebugSectionInner` contains the hooks, and `SettingsDebugSection` renders it conditionally (e.g. `if (!__DEV__) return null; return <DebugSectionInner />;` — no, the outer itself must not call hooks before the return. Correct fix: wrap body in a named inner component and render it conditionally). | proposed |
| settings-008 | nit | `src/components/settings/GatewayLogsModal.tsx`:427 | Back button `Pressable` has `accessibilityLabel` but is missing `accessibilityRole="button"`. | Add `accessibilityRole="button"`. | proposed |
| settings-009 | nit | `src/components/settings/GatewayLogsModal.tsx`:247–282 | The `useMemo` block and the dozen statements following it are indented one extra level relative to the rest of the function body (apparent copy-paste leftover). | Remove the extra indentation level. | proposed |
| settings-010 | med | `src/components/settings/GatewayLogsModal.tsx` / `src/components/settings/LogLineRow.tsx` | Log lines are rendered as raw text (`line.raw` / `line.msg`). If the gateway accidentally debug-logs an auth token, bearer token, or private key in an error trace, it would be displayed as plain text in the UI. There is no redaction layer for token-like patterns (JWTs, UUIDs, bearer strings). | Add a lightweight redaction pass in `LogLineRow` (or in `useGatewayLogs`) that replaces patterns matching `Bearer \S+`, `token=\S+`, or long base64/hex strings with `[REDACTED]`. Gate it on a "redact sensitive values" toggle (default on). | proposed |
| settings-011 | nit | `src/components/settings/SettingsMetaPanels.tsx`:64,248,397 and others | Section title `<Text>` elements in `SettingsGeneralSection`, `SettingsAppearanceSection`, and `SettingsMediaSection` are styled as headings but lack `accessibilityRole="header"`, preventing screen readers from treating them as section landmarks. | Add `accessibilityRole="header"` to section title `<Text>` elements. | proposed |
| settings-012 | low | `src/components/settings/FeedbackSheet.tsx`:1–1020 | File is 1020 lines. The styles block alone is ~200 lines. While the component is a single cohesive form, sub-components (`SuccessView`, `renderClipboardFallback`, helpers) could be extracted to reduce file length. | Flag as split candidate; propose extracting `SuccessView` and the helper functions into a sibling file `FeedbackSheetHelpers.ts`. | proposed |
| settings-013 | nit | `src/components/settings/AboutScreen.tsx`:646–848 | `DEFAULT_PRIVACY_SECTIONS` and `DEFAULT_THREAT_SECTIONS` are large hardcoded English string arrays. Chinese translations are provided via `parseLabelItemSections(t(...))`, but English content lives as source code, not in locale files, limiting third-party i18n contributions. | Consider moving English content into `locales/en/common.json` or a dedicated content file so translators can work from a single source. | proposed |
| settings-014 | low | `src/components/settings/__tests__/` | No unit test exists for `FeedbackSheet` submission logic — specifically the double-submit guard (`submitting` flag), error result rendering, and the idempotency nonce reset on close. The plan explicitly calls this out. | Add a unit test (renderHook or component test) verifying: (a) submit button is disabled while `submitting`; (b) network error renders an error card; (c) closing and re-opening resets the nonce. | proposed |
| settings-015 | nit | `src/components/settings/CompactSettingsSwitch.tsx`:37 | `progress` (Reanimated `SharedValue`) is missing from the `useEffect` dependency array. While SharedValues are stable refs and this is safe in practice, it deviates from React's exhaustive-deps convention and the ESLint rule. | Add `progress` to the dependency array: `[value, progress]`. Reanimated SharedValues are stable across renders so adding it does not change behavior. | proposed |

## SettingsMetaPanels.tsx Diff Reconciliation

Commit `7010ee0` ("Make settings footer 'Sunday Softworks' text a tappable link") is the most recent change to `SettingsMetaPanels.tsx`. The change converts the plain `<Text>` "built with" element in `SettingsFooter` into a `<Pressable>` that calls `Linking.openURL('https://sundaysoftworks.com')`. The new button includes `accessibilityRole="link"` and `accessibilityLabel="Sunday Softworks website"`, is styled with a 2px accent-color bottom border, and uses a pressed opacity for feedback.

**Assessment:** The change is correct and clean. The `Linking` import was correctly added. The accessibility attributes are appropriate (`accessibilityRole="link"` is the correct role for external-URL navigation). The inline style callback is slightly verbose but consistent with the surrounding code style. No issue found with this change.

## Auto-Fixes Applied

- settings-004 (nit): Removed dead module-level `styles` object (lines 657–667) from `src/components/settings/SettingsMetaPanels.tsx`. The object was created with hardcoded comfortable-default values and the surrounding comment claimed it was a fallback, but no function in the file referenced it — each exported section calls `useMemo(() => createPanelStyles(tk), [tk])` directly.

## Open Questions for Human

1. **settings-003 (screenshot disclosure):** What is the intended disclosure pattern? A persistent info banner in the screenshots section, or a one-time dismissible alert on first attach? The current approach (disclosure buried in About → Privacy & Security) is inadequate for a pre-release release.

2. **settings-010 (log redaction):** Should redaction be client-side in `LogLineRow`, or should the gateway be patched to not log sensitive values? A toggle (default on, with a warning that it may make debugging harder) would allow power users to see raw logs.

3. **settings-007 (debug hooks pattern):** Is the `SettingsDebugSection` hooks-after-conditional pattern intentional to avoid tree overhead in release builds? If so, an inner component pattern achieves the same goal cleanly.

4. **settings-005 / settings-006 / settings-012 (file size):** Which of the three oversized files should be split first? Recommended priority: (1) `AboutScreen.tsx` (1301 lines, 5+ distinct sub-components), (2) `SettingsMetaPanels.tsx` (667 lines, 5 independent sections), (3) `FeedbackSheet.tsx` (1020 lines, mostly a single form).

## Test Impact

- `npm test --selectProjects components` — settings-specific tests: **11 passed, 0 failed** (`PinnedKeysScreen.test.tsx`, `PinMismatchScreen.test.tsx`).
- Full `components` project run: 9 snapshot failures in `MessageBubble.test.tsx` and `ThinkingNode.test.tsx` are **pre-existing** (confirmed by running the same test suite on the unmodified base). They are caused by time-dependent timestamp snapshots ("4:00 AM" vs "12:00 PM") unrelated to this audit's scope.
- No new tests added (test additions require human approval per `_RULES.md`).
