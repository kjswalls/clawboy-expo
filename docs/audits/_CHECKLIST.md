# Standard Audit Checklist

Every per-area audit walks these concerns in order. Copy this into the plan file and add feature-specific bullets under each heading.

---

## 1. Correctness

- [ ] Behavior matches documented intent (read `.cursorrules` + any related `docs/plans/` doc)
- [ ] Edge cases handled: empty state, error state, slow/dropped network, reconnect mid-operation, app backgrounding/foregrounding
- [ ] Race conditions: async ops have cancellation / generation-counter guards where relevant
- [ ] `_connectGeneration` discipline: stale async results from old connect generations are discarded
- [ ] Error boundary coverage: major UI sections wrapped in `<ErrorBoundary>`
- [ ] All `Promise` rejections caught and surfaced (no unhandled rejections)
- [ ] State transitions are exhaustive — no impossible states, no silent no-ops on unexpected input

## 2. Security

> Reference: `.cursorrules` Security section (rules 1–10)

- [ ] No plaintext token / key logging (`console.log`, crash reporters, analytics)
- [ ] All auth tokens, device keys, and gateway tokens stored in `expo-secure-store` — never `AsyncStorage`, never component state longer than necessary
- [ ] All WebSocket frames validated against expected schema before acting on them
- [ ] No `dangerouslySetInnerHTML` or equivalent raw HTML injection
- [ ] TLS enforced: warn loudly on `http://` / `ws://` URLs; default to `wss://`
- [ ] Deeplink / auth-callback URLs validated before use (no open redirect)
- [ ] Clipboard hygiene: sensitive values copied to clipboard are cleared after timeout (or user is warned)
- [ ] `AsyncStorage` contains only non-sensitive data (preferences, cache — never credentials)
- [ ] Device Ed25519 keypair: generated once, stored in secure storage, never logged or exported
- [ ] Session tokens: error states are surfaced gracefully, not looped or crashed on
- [ ] No `eval`, no dynamic code execution, no remote code loading outside OTA

## 3. Performance

- [ ] List rows memoized with `React.memo` (`MessageBubble`, `SessionRow`, etc.)
- [ ] Stable callback refs: event handlers passed to memoized children wrapped in `useCallback`
- [ ] `FlashList` / `FlatList` configured: `keyExtractor`, `getItemLayout` (where items are fixed-height), appropriate `windowSize` / `maxToRenderPerBatch`
- [ ] Images loaded through `expo-image` with appropriate cache policy (not raw `<Image>` unless justified)
- [ ] Animations run on UI thread: Reanimated `useAnimatedStyle` / worklets used, not JS-driven `Animated.Value` for continuous animations
- [ ] No heavy synchronous work in render path
- [ ] Provider tree in `app/_layout.tsx` is minimal — no expensive computations at root render
- [ ] No unnecessary re-renders caused by context value object identity churn

## 4. Cleanliness / Maintainability

- [ ] No file exceeds ~300 lines (flag candidates; do NOT split automatically — propose in findings)
- [ ] No module-level mutable globals (timers, counters, caches live in hooks/refs)
- [ ] Hooks are single-responsibility; no god hooks
- [ ] Named exports throughout (no default exports except Expo Router screen files)
- [ ] Explicit `return` types on all hooks and utility functions
- [ ] No commented-out code blocks
- [ ] No narrative comments (comments that only restate what the code does)
- [ ] No dead branches or unreachable code
- [ ] Consistent error handling pattern — `try/catch` or `.catch()`, not mixed ad-hoc
- [ ] `const` over `let`; never `var`

## 5. Tests

- [ ] All existing tests in scope pass (`npm test --selectProjects <project>`)
- [ ] Snapshots are fresh (not stale from refactors)
- [ ] Non-trivial pure logic has unit test coverage (note gaps — do NOT auto-add large test suites)
- [ ] Hook tests use `renderHook` from `@testing-library/react-native`
- [ ] No test file imports from outside its component's directory tree (test locality)

## 6. OSS-Readiness

- [ ] No internal hostnames, Tailscale magic-DNS names, ngrok URLs, or private IPs hard-coded
- [ ] No dev / staging tokens or API keys committed
- [ ] No personal paths (e.g. `/Users/yourname/...`) in source
- [ ] No `TODO(name)` with private context or internal team references
- [ ] No internal Slack channel names, Linear issue IDs, or private project references in comments
- [ ] Strings and comments are safe for public eyes
- [ ] No files that should be in `.gitignore` are tracked (check with `git status`)

## 7. i18n / Accessibility

- [ ] All user-visible strings use `t()` from `react-i18next` — no hard-coded English copy outside `locales/en/common.json`
- [ ] New user-visible strings have corresponding keys added to `src/i18n/locales/en/common.json`
- [ ] Interactive elements have `accessibilityLabel` and `accessibilityRole`
- [ ] `accessibilityHint` present on non-obvious controls
- [ ] Dynamic type: `Text` components use relative font sizes or honor `allowFontScaling`
- [ ] RTL layout: no hard-coded `left`/`right` margins that would break in RTL (use `start`/`end` or symmetric padding)
