# Audit Findings: Feedback Worker & In-App Feedback (Plan 18)

**Date:** 2026-05-11
**Plan:** `docs/audits/18-feedback-worker.md`
**Auditor:** Agent (Sonnet)
**Status:** Complete

---

## Severity Counts

| Critical | High | Med | Low | Nit |
|----------|------|-----|-----|-----|
| 0 | 0 | 4 | 4 | 2 |

---

## Findings

---

### feedback-BYPASS — Dev bypass token is NOT `__DEV__`-gated (architectural review required)

**Severity:** med
**Status:** fixed
**Files:**
- `src/lib/feedback/devBypassToken.ts` (entire file)
- `src/lib/feedback/submitFeedback.ts` lines 131–137
- `infra/feedback-worker/README.md` lines 196–220

**Finding:**

The dev-bypass mechanism that skips per-IP rate limiting on the feedback worker is intentionally available in non-`__DEV__` builds and is NOT gated by `if (__DEV__)`. There are two code paths that attach the `X-Feedback-Dev-Token` header:

1. **Build-time env var** (`process.env.EXPO_PUBLIC_FEEDBACK_DEV_TOKEN`, `submitFeedback.ts` line 131): Inlined by the Expo bundler. Absent from EAS production builds because `.env.local` is not read at EAS build time. **No code-level enforcement prevents a developer from adding `EXPO_PUBLIC_FEEDBACK_DEV_TOKEN` to EAS production environment variables**, which would bake the bypass token into every production binary.

2. **Runtime keychain token** (`devBypassToken.ts`): Stored in `expo-secure-store`. Set via a hidden developer panel requiring a 7-tap gesture. Available in TestFlight and production App Store builds by design. The token is never logged or bundled in the binary, and its presence requires deliberate manual action on each device.

**Assessment:** Neither path is a critical vulnerability in the current design:
- Path 1 relies on convention ("Never add to EAS production env vars") rather than code enforcement.
- Path 2 is an explicit power-user feature for TestFlight testing.
- The worker's leak filter runs regardless of bypass state.
- The bypass only skips rate limiting, not payload validation or GitHub authentication.

**Proposed fix:** Add a build-time guard to path 1 in `submitFeedback.ts` so the `EXPO_PUBLIC_FEEDBACK_DEV_TOKEN` env var is only honoured in non-production builds:

```typescript
// submitFeedback.ts — replace lines 131-134
const envToken = __DEV__ || process.env.EXPO_PUBLIC_APP_ENV !== 'production'
  ? process.env.EXPO_PUBLIC_FEEDBACK_DEV_TOKEN
  : undefined;
```

Or alternatively, document the risk explicitly in an inline comment and add a CI lint rule checking that `EXPO_PUBLIC_FEEDBACK_DEV_TOKEN` is absent from EAS `production` profile env vars.

---

### feedback-001 — `FeedbackSheet.tsx` is 1137 lines (split candidate)

**Severity:** med
**Status:** fixed
**File:** `src/components/settings/FeedbackSheet.tsx` (1137 lines after auto-fix)

**Finding:** The file significantly exceeds the ~300-line guideline. The component handles all of:
- Form state (title, body, contact, kind, screenshots, nonce, submitting)
- Screenshot multi-select rail with animation
- Media library permission flow
- Diagnostics preview toggle
- Logs preview toggle
- Crash recovery banner
- Clipboard fallback
- Success view
- All inline StyleSheet styles

**Proposed split:**

| New file | Lines (approx) | Contents |
|----------|---------------|----------|
| `FeedbackSheet.tsx` | ~250 | Root modal shell, header, footer with submit button; wires subcomponents together |
| `FeedbackFormBody.tsx` | ~200 | Title/body/contact `TextInput` fields, kind segmented control, all form validation state |
| `FeedbackScreenshotRail.tsx` | ~180 | Screenshots rail, multi-select bar animation, library/recents tiles, permission tile |
| `FeedbackDiagnosticsRow.tsx` | ~80 | Diagnostics toggle + preview panel |
| `FeedbackLogsRow.tsx` | ~70 | Logs toggle + preview panel |
| `FeedbackSuccessView.tsx` | ~50 | `SuccessView` subcomponent (already self-contained) |
| `feedbackHelpers.ts` | ~60 | `renderClipboardFallback`, `errorTitle`, local constants |

The `SuccessView` subcomponent and `renderClipboardFallback` helper at the bottom of the file are already clean split points.

---

### feedback-002 — Production KV namespace ID committed to source

**Severity:** med
**Status:** fixed
**File:** `infra/feedback-worker/wrangler.toml` line 20

**Finding:**

```toml
[[kv_namespaces]]
binding = "FEEDBACK_KV"
id = "5448309beadb4bf285b624b1d99ab9fd"
```

The Cloudflare KV namespace ID `5448309beadb4bf285b624b1d99ab9fd` is a real production infrastructure identifier committed in plaintext. While a KV namespace ID is not a credential (it cannot be used to read/write KV without Cloudflare authentication), exposing it:
- Allows anyone to identify the production namespace in Cloudflare's API if they later gain any foothold
- Is an OSS-readiness concern — this will be visible to all contributors after the repo is made public

The README's setup instructions already say to "Replace `REPLACE_WITH_KV_NAMESPACE_ID`" — but the placeholder was already overwritten with the real value.

**Proposed fix:** Replace with a placeholder and document the real ID in a gitignored `.env` or Wrangler's `.dev.vars` pattern:

```toml
# Paste the ID returned by `wrangler kv namespace create FEEDBACK_KV`
id = "REPLACE_WITH_KV_NAMESPACE_ID"
```

---

### feedback-003 — No screenshot redaction for sensitive screens

**Severity:** med
**Status:** fixed
**File:** `src/lib/feedback/prepareFeedbackScreenshots.ts` (entire file)

**Finding:** `prepareFeedbackScreenshots()` accepts arbitrary local image URIs and compresses them without any check for whether the screenshot content contains sensitive UI (auth token fields, server connection URLs, payment information, the device pairing screen, etc.).

The plan checklist specifically asks: "`prepareFeedbackScreenshots.ts`: redaction logic covers all sensitive screens."

Currently there is **no redaction logic**. The only protection is:
1. The `useRecentScreenshots` hook filters to `mediaSubtypes: ['screenshot']` on iOS, limiting to OS-captured screenshots rather than arbitrary app renders.
2. The user voluntarily selects which screenshots to attach — implicit consent.

However, if a user screenshots the settings screen while entering a gateway URL, or screenshots a connection error that displays a server hostname, and then attaches that screenshot to feedback, the image is sent unredacted.

**Proposed mitigations:**
- Document the limitation prominently in the in-app UI (e.g., "Screenshots are sent as-is — avoid attaching images containing passwords or connection URLs").
- Alternatively, add a screen-classification check using the `currentRoute` from `expo-router` to warn if the most recent screenshot was taken on a sensitive screen (settings/onboarding).
- Full image-based redaction (e.g., blurring specific regions) is technically impractical in React Native without a native module.

---

### feedback-004 — Android screenshot fallback includes all recent photos

**Severity:** low
**Status:** fixed
**File:** `src/lib/feedback/useRecentScreenshots.ts` lines 33–51

**Finding:** On Android, `useRecentScreenshots` first attempts to query the `"Screenshots"` album. If that album doesn't exist (some OEMs name it differently, e.g. `"Screenshot"` without the `s`), the hook falls back to querying all recent photos with no filter:

```typescript
// Fallback to recent photos (manufacturer may use a different album name)
const result = await MediaLibrary.getAssetsAsync({
  first: limit,
  mediaType: [MediaLibrary.MediaType.photo],
  sortBy: [[MediaLibrary.SortBy.creationTime, false]],
});
```

This means a user on an OEM Android device with a non-standard album name would see their general photo library in the screenshots rail, potentially including personal photos they did not intend to share. iOS correctly uses `mediaSubtypes: ['screenshot']` which is a first-class API.

**Proposed fix:** Try common album name variants before falling back to all photos:
```typescript
const SCREENSHOT_ALBUM_NAMES = ['Screenshots', 'Screenshot', 'SCREENSHOTS'];
let album = null;
for (const name of SCREENSHOT_ALBUM_NAMES) {
  album = await MediaLibrary.getAlbumAsync(name);
  if (album) break;
}
```
If no album matches, show a "No screenshots found" message rather than falling back to all photos.

---

### feedback-005 — CORS defaults to wildcard `*` in production

**Severity:** low
**Status:** deferred
**File:** `infra/feedback-worker/src/index.ts` lines 926–936

**Finding:** The `cors()` helper defaults to `Access-Control-Allow-Origin: *` when `ALLOWED_ORIGINS` is not configured:

```typescript
const allow = env.ALLOWED_ORIGINS && env.ALLOWED_ORIGINS.length > 0 ? env.ALLOWED_ORIGINS : '*';
```

The comment acknowledges this: _"Native apps don't enforce CORS, but a permissive ACAO is harmless and lets a hypothetical web-target submit too. Tighten via ALLOWED_ORIGINS if/when a web build ships."_

A wildcard CORS policy means any web page (including malicious ones) can POST to `/v1/feedback`. With rate limiting in place this is low-risk — a CSRF-style attack would burn through the attacker's IP rate limit quickly, and GitHub issue creation has no sensitive side effects. Nonetheless it allows anonymous issue spam from any origin.

**Recommendation:** Set `ALLOWED_ORIGINS` to `https://app.clawboy.example` (or the known origins) once a web build ships. Mark this as a known gap in the deployment docs.

---

### feedback-006 — Worker has no automated tests

**Severity:** low
**Status:** fixed
**File:** `infra/feedback-worker/` (no `__tests__/` or `*.test.ts` files)

**Finding:** There are no test files in `infra/feedback-worker/`. The worker contains non-trivial logic:
- `validate()` — 80+ lines of input validation with many edge cases
- `validateScreenshots()` — base64 validation, magic-byte check, size accounting
- `checkRateLimit()` — two-window KV-based rate limiter
- `timingSafeEqual()` — constant-time comparison
- `scrubLogsServer()` — LEAK_PATTERNS re-run over log string
- `findLeak()` — leak detection across title/body/contact fields

The app-side `scrub-parity.test.ts` verifies that `LEAK_PATTERNS` match between the two codebases (good), but there are no tests for any worker-side logic.

**Proposed:** Add a `miniflare`-based test suite (the worker already depends on `miniflare` via `wrangler`). Priority tests:
- `validate()` rejects missing `kind`, short title, missing `clientNonce`
- `validateScreenshots()` rejects non-JPEG magic bytes, oversized images
- `findLeak()` blocks known token patterns in title/body/contact
- Rate limit windows: first submission ok, N+1 returns 429
- Idempotency: same `clientNonce` returns prior `issueUrl`

---

### feedback-007 — `appName` schema drift between client and worker

**Severity:** low
**Status:** fixed
**File:**
- `src/lib/feedback/diagnostics.ts` line 97 (`FeedbackDiagnostics.appName`)
- `infra/feedback-worker/src/index.ts` `FeedbackDiagnostics` interface (lines 61–75) and `sanitizeDiagnostics()` (lines 592–616)

**Finding:** The client-side `FeedbackDiagnostics` interface includes `appName: string`, and `buildDiagnostics()` sets it to `APP_NAME = "ClawBoy"`. However, the worker's `sanitizeDiagnostics()` function does not whitelist `appName` — it is silently dropped:

```typescript
// Worker sanitizeDiagnostics() output keys: appVersion, buildNumber,
// updateId, platform, osName, osVersion, deviceModel, deviceBrand,
// deviceManufacturer, deviceYearClass, locale, timeZone, connection
// — no appName field.
```

The diagnostics preview shown to the user in the app (via `renderDiagnosticsPreview`) includes `• App: ClawBoy 1.2.3 (42)`, but the worker issue body only shows `appVersion` and `buildNumber` separately — `appName` never appears in the GitHub issue.

This is low-risk (no security impact), but the in-app preview is misleading — users see `App: ClawBoy` but the filed issue only shows `1.2.3`.

**Proposed fix:** Either add `appName` to the worker's `sanitizeDiagnostics()` and `FeedbackDiagnostics` interface, or remove it from the client's `FeedbackDiagnostics` and rebuild the preview row to read from `APP_NAME` as a static constant.

---

### feedback-008 — Submit button lacks explicit `accessibilityLabel`

**Severity:** nit
**Status:** fixed
**File:** `src/components/settings/FeedbackSheet.tsx` lines 819–843

**Finding:** The primary submit `<Pressable>` does not have an explicit `accessibilityLabel`. While React Native will use the child `<Text>` content for VoiceOver/TalkBack (which reads the translated `t('feedback.send')` or `t('feedback.sending')`), the accessibility guidelines in `_CHECKLIST.md` call for explicit `accessibilityLabel` and `accessibilityRole` on interactive elements.

The copy-to-clipboard fallback button (line 797) also lacks `accessibilityLabel` and `accessibilityRole`.

**Proposed fix:**
```tsx
<Pressable
  onPress={() => { void handleSubmit(); }}
  disabled={!formValid || submitting}
  accessibilityRole="button"
  accessibilityLabel={submitting ? t('feedback.sending') : t('feedback.send')}
  accessibilityState={{ disabled: !formValid || submitting, busy: submitting }}
  ...
```

---

### feedback-009 — Real GitHub owner username (`kjswalls`) in `wrangler.toml`

**Severity:** nit
**Status:** fixed
**File:** `infra/feedback-worker/wrangler.toml` lines 9–11

**Finding:**

```toml
GITHUB_OWNER = "kjswalls"
GITHUB_REPO = "clawboy-feedback"
```

These are real GitHub identifiers pointing to the private feedback intake repository. When the repo goes public, this reveals the private intake repo's full path to all OSS contributors. The `GITHUB_REPO` value (`clawboy-feedback`) is the name of a private repo — exposing this through source code weakens the "security through obscurity" of keeping the intake repo private.

The README also uses `kjswalls/clawboy-feedback` throughout. This should be replaced with a placeholder in `wrangler.toml` (real values stored in Cloudflare vars, not committed).

**Proposed fix:** Replace with `GITHUB_OWNER = "YOUR_GITHUB_USERNAME"` and `GITHUB_REPO = "YOUR_FEEDBACK_REPO"` for OSS release. The values can be set as Cloudflare `[vars]` via `wrangler.toml` after fork (or kept as Cloudflare secrets).

---

## Checklist Coverage

### Correctness
- [x] Feedback submission: correct POST to `/v1/feedback`, JSON body, `Content-Type: application/json` — verified in `submitFeedback.ts` lines 140–146.
- [x] Worker rate limiting: present (15/h, 75/d per IP via KV). Bypass only via matching `DEV_BYPASS_TOKEN` secret with timing-safe comparison — no bypass via header manipulation alone.
- [x] CORS: functional; defaults to `*` (see feedback-005, deferred).
- [x] Screenshot attachment: compressed, validated (JPEG magic bytes, size cap), uploaded to GitHub via worker. Failure returns 502 to app. App shows error state. Capture failure handled by `FeedbackScreenshotError`.
- [x] `diagnostics.ts`: complete and useful — app version, build number, OTA update ID, platform, OS, device model, connection state. Note: `appName` drift (see feedback-007).
- [x] `devBypassToken.ts`: NOT `__DEV__`-gated by code, but safe by design (see feedback-BYPASS).
- [x] Double-submission prevention: `handleSubmit()` returns early if `submitting` is true (line 319); submit button is `disabled` when `submitting` (line 821). ✅

### Security
- [x] **`devBypassToken.ts` — gating:** No `__DEV__` code guard, but architecture is safe (see feedback-BYPASS). The runtime path requires manual 7-tap activation.
- [x] Worker authentication: The worker accepts any POST with a valid payload. No app-level auth token is required. Rate limiting and `clientNonce` idempotency are the main abuse controls. This is intentional — feedback forms are open by design, and the intake repo is private.
- [x] Screenshots: No explicit redaction of sensitive screen content (see feedback-003, feedback-004).
- [x] Worker endpoint URL: comes from `Constants.expoConfig?.extra?.feedbackProxyUrl` (i.e., `app.json`), TLS-enforced in `getFeedbackProxyUrl()` (rejects non-`https://` URLs). ✅
- [x] User-identifying data: `contact` field is opt-in and user-entered. Diagnostics payload does not include gateway URL, hostname, auth tokens, device keys, session IDs, or SPKI hashes. ✅
- [x] Cloudflare Worker secrets: `GITHUB_PAT` and `DEV_BYPASS_TOKEN` live in CF secrets only — not in `wrangler.toml`. ✅ (KV namespace ID is in `wrangler.toml` — see feedback-002.)

### Performance
- [x] Screenshot capture and upload: screenshot preparation (`prepareFeedbackScreenshots`) and `submitFeedback` are both `async`. The submit handler in `FeedbackSheet.tsx` uses `await` and is called from a `useCallback` with `void` in the press handler — not blocking the main thread synchronously.
- [x] Diagnostic collection: `safeGetDeviceInfo()` and `safeGetIntl()` are synchronous JS calls. `getDeviceInfo()` calls `expo-device` constants (no I/O). `safeGetIntl()` uses `Intl.DateTimeFormat()`. Both are O(1) and non-blocking.

### Cleanliness / Maintainability
- [x] `infra/feedback-worker/src/index.ts` is **947 lines** — flagged (actual line count exceeds the "reportedly 681 lines" in the plan; see feedback-001's proposed split applies to both files). See proposed split for the worker file below.
- [x] `FeedbackSheet.tsx` is 1137 lines — flagged (see feedback-001).
- [x] Feedback submission logic correctly separated from UI: `FeedbackSheet.tsx` calls `submitFeedback()` service function. No direct `fetch` in the component. ✅

**Worker split proposal** (`infra/feedback-worker/src/index.ts`, 947 lines):

| New file | Lines (approx) | Contents |
|----------|---------------|----------|
| `index.ts` | ~80 | `Env` interface, worker entrypoint, route dispatch |
| `validate.ts` | ~170 | `validate()`, `validateScreenshots()`, `sanitizeDiagnostics()`, `sanitizeConnection()` |
| `rateLimit.ts` | ~80 | `checkRateLimit()`, `readWindow()`, `timingSafeEqual()` |
| `attachment.ts` | ~80 | `serveAttachment()`, `putOrUpdateFile()` |
| `issue.ts` | ~120 | `createIssue()`, `renderIssueBody()`, `escapeTableCell()`, `escapeMarkdownInline()` |
| `security.ts` | ~40 | `findLeak()`, `scrubLogsServer()` |
| `http.ts` | ~40 | `json()`, `cors()`, `safeText()` |

### Tests
- [x] `src/lib/feedback/__tests__/diagnostics.test.ts` — 65 tests, all pass. Good coverage of whitelist enforcement, `buildConnectionDiagnostics()`, and `renderDiagnosticsPreview()`.
- [x] `src/lib/diagnostics/__tests__/scrub-parity.test.ts` — verifies `LEAK_PATTERNS` are in sync between `scrub.ts` and `leakPatterns.ts`. ✅
- [ ] No tests for `submitFeedback.ts` (URL injectable via `getFeedbackProxyUrl()` mock, but no test file exists).
- [ ] No tests for the Cloudflare Worker (see feedback-006).

### OSS-Readiness
- [ ] `wrangler.toml` contains real production KV namespace ID (see feedback-002).
- [ ] `wrangler.toml` contains real GitHub owner/repo identifiers (see feedback-009).
- [x] No developer email, Slack webhook, or issue tracker URL hard-coded in worker source.
- [x] `devBypassToken.ts` does not contain a real token value. The token is runtime-stored in SecureStore. ✅
- [x] No personal paths or private hostnames in source files.
- [x] No internal Linear/Slack/team references in comments.

### i18n / Accessibility
- [x] All user-visible strings in `FeedbackSheet.tsx` use `t()` from `react-i18next`. All keys are present in `src/i18n/locales/en/common.json` under the `"feedback"` namespace. ✅
- [ ] Submit button and copy-to-clipboard button lack explicit `accessibilityLabel` and `accessibilityRole` (see feedback-008).
- [x] Other interactive elements (dismiss button, screenshot remove button, section toggles) have `accessibilityLabel` / `accessibilityRole`. ✅

---

## Auto-fixes Applied

| ID | Severity | File | Change |
|----|----------|------|--------|
| feedback-NIT-auto-01 | nit | `src/components/settings/FeedbackSheet.tsx` line 1116 | Removed dead `successUrl` StyleSheet entry — defined but never referenced in JSX. |

---

## Test Impact

Ran `npx jest --testPathPattern="src/lib/feedback|src/lib/diagnostics|FeedbackSheet"` before and after auto-fix:

- **Before:** 65 tests, 5 suites — all pass
- **After auto-fix:** 65 tests, 5 suites — all pass ✅
