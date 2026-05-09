# OTA Updates Findings

Date: 2026-05-09
Agent: claude-sonnet-4-6
Status: done

## Summary

The OTA update subsystem is well-structured and security-conscious: the private key was never committed, code-signing is correctly configured, and the two hooks (`useOTAUpdate`, `useGatewayUpdateNudge`) maintain clean separation of concerns. The main issues are a redundant dual-check on startup, a misleading banner message that directs users to Settings when the update is already downloading in the background, and a personal local path leaked in `eas.json`.

## Severity Counts

- critical: 0
- high: 0
- med: 2
- low: 2
- nit: 3

## Findings

| ID | Sev | File:Line | Summary | Recommendation | Status |
|----|-----|-----------|---------|----------------|--------|
| ota-CERT | pass | certs/ | `certs/private-key.pem` was never committed to git history; `.gitignore` correctly excludes it; `certificate.pem` contains only the public cert | No action required | closed |
| ota-001 | med | app.json:12 / src/hooks/useOTAUpdate.ts:31 | `checkAutomatically: "ON_LOAD"` in `app.json` triggers a native background check on every launch; `useOTAUpdate` then independently calls `checkForUpdateAsync()` + `fetchUpdateAsync()` in the same launch cycle. Two concurrent `fetchUpdateAsync()` calls waste bandwidth and may race on staging the downloaded bundle. The hook is still needed for `critical` flag detection, but the duplication is unnecessary for the non-critical path. | Set `"checkAutomatically": "NEVER"` in `app.json` and rely entirely on `useOTAUpdate` (and `useGatewayUpdateNudge`) to drive all update checks. This removes the race and consolidates logic in one place. Requires `eas.json` and native build review — proposed, not auto-fixed. | proposed |
| ota-002 | nit | src/hooks/useGatewayUpdateNudge.ts:73 | `client` (a `useRef` return value) was included in the `useEffect` dependency array. `useRef` objects are stable references that never change identity; the linter's `react-hooks/exhaustive-deps` rule treats them as stable and does not require them in deps. Its presence misleads readers into thinking the effect re-runs when the client changes. | Remove `client` from the dep array. **Auto-fixed.** | fixed |
| ota-003 | med | eas.json (read-only):33 | `submit.production.ios.ascApiKeyPath` contains a hardcoded local path: `/Users/kirby/Downloads/Code Projects/clawboy-expo/AuthKey_X67X7737ZG.p8`. This (a) causes `eas submit` to fail on every machine except the original author's, (b) leaks a personal filesystem path in a public repo, and (c) exposes the App Store Connect key ID (`X67X7737ZG`) and issuer ID. | Replace the hardcoded path with an env-var reference (e.g. `$ASC_API_KEY_PATH`) or remove the `ascApiKeyPath` field and pass it via `--api-key-path` at submit time. **`eas.json` is out of scope for auto-fix — flag only.** | proposed |
| ota-004 | low | src/i18n/locales/en/common.json (via UpdateNudgeBanner.tsx:35) | The banner message `"A required update is available. Go to Settings → About to check for updates."` is inaccurate. `useGatewayUpdateNudge` already silently fetches the update in the background. Directing the user to Settings is wrong — the correct instruction is to restart the app once the download completes. | Change message to something like `"A newer version of ClawBoy is ready. Restart the app to apply the update."` and align the `zh-CN` locale. Changing i18n string values is a proposed fix (not auto-applied). | proposed |
| ota-005 | low | src/components/chat/UpdateNudgeBanner.tsx:38 | Dismiss button has `accessibilityLabel` but no `accessibilityHint`. For screen-reader users who are not familiar with the banner, a hint explaining what "dismiss" does (e.g. `"Hides this update notice until the next version is available"`) improves usability. | Add `accessibilityHint={t('chat.updateBanner.dismissHint')}` and a corresponding i18n key. Adding i18n keys is a proposed fix. | proposed |
| ota-006 | nit | src/components/chat/UpdateNudgeBanner.tsx:28 | `overflow: 'hidden'` is included inside `useAnimatedStyle`. It is a static (non-animated) value and does not need to run in a Reanimated worklet. Static styles inside `useAnimatedStyle` are evaluated on the JS thread on every animation frame, adding minimal but unnecessary overhead. | Move `overflow: 'hidden'` to a static `StyleSheet` entry and spread it alongside the animated style. Changing animation code requires human review — proposed. | proposed |
| ota-007 | nit | src/hooks/__tests__/ | No unit tests exist for `useOTAUpdate` or `useGatewayUpdateNudge`. These hooks are difficult to test (require mocking `expo-updates` and the connection context), but the `isBelowVersion` helper in `useGatewayUpdateNudge` is a pure function with no dependencies and is fully testable. | Extract `isBelowVersion` to a shared utility and add unit tests covering edge cases (pre-release suffixes, missing patch segment, equal versions). Test additions are a proposed fix. | proposed |
| ota-008 | nit | scripts/generate-update-cert.sh:30 | Script uses RSA-2048. This meets the stated minimum (≥ 2048-bit RSA) and matches the `alg: "rsa-v1_5-sha256"` configured in `app.json`. Ed25519 would be preferable for new projects but `expo-updates` code signing currently only supports `rsa-v1_5-sha256`, so RSA-2048 is the correct choice. No action needed. | No action required; document as intentional in the script comment if desired. | closed |

## Auto-Fixes Applied

- **ota-002** (nit): removed `client` (a stable `useRef` object) from the `useEffect` dependency array in `src/hooks/useGatewayUpdateNudge.ts` line 73. No behavior change — the effect is gated on `connectionState.status` which is sufficient; `client.current` is read inside the effect body at the moment the effect fires, not as a reactive dependency.

## Open Questions for Human

- **ota-001**: Deciding between `checkAutomatically: "NEVER"` (hook-driven only) and keeping `ON_LOAD` (belt-and-suspenders) is a product call. `ON_LOAD` provides a safety net if the hook somehow doesn't run (e.g. render is aborted), but the current combination can race. The audit recommends removing `ON_LOAD` and trusting the hook.
- **ota-003**: The `eas.json` `ascApiKeyPath` personal path must be cleaned up before any other developer (or CI) can run `eas submit`. This should be an immediate fix but is outside this audit's auto-fix scope.
- **ota-004**: The banner message update should be coordinated with whoever owns the copy/localization workflow, since both `en` and `zh-CN` locales need updating.

## Test Impact

- `npm test` run after applying ota-002 auto-fix.
- Result: **3 suites failed, 57 passed | 14 tests failed, 894 passed | 9 snapshots failed, 40 passed** — identical result confirmed against the unmodified base branch (same failures pre-exist; stash-verified).
- All pre-existing snapshot failures are in `MessageBubble` tests and are due to timezone-dependent timestamp rendering (`4:00 AM` vs `12:00 PM`), unrelated to OTA changes.
- No OTA-specific test files exist; my auto-fix introduced no new failures.
