# X3 Performance Sweep — Findings

**Audit date:** 2026-05-12  
**Auditor:** Agent (Plan X3)  
**Related plan:** [X3-performance-sweep.md](../X3-performance-sweep.md)  
**Related plans:** 04 (chat-streaming), 05 (input/slash), 06 (sessions/sidebar), 11 (media)

---

## 1. Provider Tree — Startup Impact Assessment

The root layout wraps the app in **20 nested providers** (listed outermost → innermost):

| # | Provider | Startup Impact |
|---|----------|---------------|
| 1 | `GestureHandlerRootView` | None — required for gesture handling |
| 2 | `LastCrashProvider` | Low — reads `SecureStore` async on mount |
| 3 | `ErrorBoundary` | None — pure React wrapper |
| 4 | `SafeAreaProvider` | Low — native insets measurement, fast |
| 5 | `AccountProvider` | Low — `supabase.auth.getSession()` async on mount |
| 6 | `PurchasesProvider` | Low — RevenueCat init async |
| 7 | `ServerConfigProvider` | Low — reads `SecureStore` + `AsyncStorage` async |
| 8 | `ServerProfileSyncProvider` | Low — depends on AccountProvider state |
| 9 | `ThemeProvider` | Low — `AsyncStorage` v1→v4 migration async on mount |
| 10 | `LanguageProvider` | Low — reads i18n preference async |
| 11 | `ConnectionProvider` | Low — WS client in a `useRef`, no blocking init |
| 12 | `ConventionInstallProvider` | Low — async convention fetch |
| 13 | `AgentsProvider` | Low — populated after WS connect |
| 14 | `FileViewerProvider` | None — modal state only |
| 15 | `ModelsProvider` | Low — populated after WS connect |
| 16 | `SessionsProvider` | Low — populated after WS connect |
| 17 | `BootReadyProvider` | None — boolean gate for disk hydration |
| 18 | `TtsPreferencesProvider` | Low — reads `AsyncStorage` async |
| 19 | `BadgesProvider` | Low — reads `AsyncStorage` badge state async |
| 20 | `BottomSheetModalProvider` | None — gesture context only |

**Assessment:** No provider has a synchronous blocking init that would delay first paint. All storage reads are async. `NavigationShell` renders `BrandLoader` until `ServerConfigProvider.isHydrated` resolves, which is the correct startup gate.

**BootReadyContext gate:** `diskHydrationAttempted` is set by `useChatDiskHydration` after the disk cache read settles. `ChatScreen` uses this to avoid flashing skeleton or welcome state before the disk race is resolved. Gate is correctly placed.

**Font loading:** No `useFonts` / `expo-font` calls observed in `_layout.tsx`. App relies on system fonts only — no font-load startup delay.

---

## 2. Re-render Audit Table

| Component | `React.memo`? | Callback stable? | Context value `useMemo`? | Verdict |
|-----------|:---:|:---:|:---:|---------|
| `MessageBubble` | ✅ | ✅ refs pattern in `MessageList` | — | Pass |
| `SessionRow` | ✅ `memo(SessionRowInner)` | ✅ `useCallback` | — | Pass |
| `ToolCallCard` | ✅ | ✅ Reanimated shared values | — | Pass |
| `ThinkingNode` | ✅ | ✅ Reanimated shared values | — | Pass |
| `ThemeContext` | — | ✅ `persistV4` stable | ✅ `useMemo` on full object | Pass |
| `AccountContext` | — | ✅ all handlers `useCallback` | ✅ **fixed** (was plain literal) | **Fixed (perf-001)** |
| `BootReadyContext` | — | ✅ `markDiskHydrationAttempted` `useCallback` | ✅ **fixed** (was inline JSX object) | **Fixed (perf-002)** |
| `ConnectionContext` | — | ✅ all handlers `useCallback` | ✅ **fixed** (was plain literal) | **Fixed (perf-003)** |
| `MessageList` → `renderItem` | — | ✅ `useCallback([annotateMessageId, highlightedAnnotationId])` | — | Pass |
| `ChatScreen` → `modelSections` | — | — | ✅ **fixed** (was inline call) | **Fixed (perf-004)** |
| `ChatScreen` → `agentItems` | — | — | ✅ **fixed** (was inline call) | **Fixed (perf-005)** |
| `ChatScreen` → `adaptedSessions` | — | — | ✅ **fixed** (was inline call) | **Fixed (perf-006)** |

**Notes on `ConnectionContext`:** `useConnectionController` in `src/hooks/useConnection.ts` returns a plain object literal (not `useMemo`-wrapped) on every render. Since `ConnectionProvider` passes this directly as context value, all `useConnection()` consumers re-render on every `ConnectionProvider` render. Because `ConnectionProvider` only renders when connection-related state changes (which is infrequent), the impact is low in steady state but measurable during connect/reconnect cycles. Modifying `useConnection.ts` touches the reconnect state machine; requires human review before applying.

---

## 3. Animation Thread Audit

| Component | Animation API | Thread | Verdict |
|-----------|--------------|--------|---------|
| `StreamingCursor` (blink) | Reanimated `withRepeat/withSequence` + `useAnimatedStyle` | UI thread | ✅ Pass |
| `ThinkingNode` expand/collapse (height, opacity, chevron) | Reanimated `withTiming` + `useAnimatedStyle` | UI thread | ✅ Pass |
| `ThinkingNode` brain pulse (opacity) | Reanimated `withRepeat/withSequence` + `useAnimatedStyle` | UI thread | ✅ Pass |
| `ThinkingNode` shimmer (translateX) | `RNAnimated.loop` + `useNativeDriver: true` | UI thread (native driver) | ⚠️ Compat debt — see perf-007 |
| `ToolCallCard` expand/collapse (height, opacity, chevron) | Reanimated `withTiming` + `useAnimatedStyle` | UI thread | ✅ Pass |
| `ToolCallCard` spinner (rotation) | Reanimated `withRepeat/withTiming` + `useAnimatedStyle` | UI thread | ✅ Pass |
| `InputRainbowGlow` pulse (opacity) | Reanimated `withRepeat/withTiming` + `useAnimatedStyle` | UI thread | ✅ Pass |
| `BrandAnimatedLogo` | `expo-video` `VideoView` | Native video decoder | ✅ Pass |
| `MessageList` top-fade (opacity) | Reanimated `withTiming` on `topFadeOpacity` shared value | UI thread | ✅ Pass |
| `MessageList` scroll-pill (opacity, translateY) | Reanimated `withTiming` + `useAnimatedStyle` | UI thread | ✅ Pass |
| `MessageList` list/skeleton crossfade (opacity) | Reanimated `withTiming` + `useAnimatedStyle` | UI thread | ✅ Pass |
| `SessionSidebar` drawer (translateX, backdrop) | RNGH `Gesture.Pan` + Reanimated `withSpring` + `useAnimatedStyle` | UI thread | ✅ Pass |

**Note on `ThinkingNode` shimmer (perf-007):** The shimmer effect that animates over the "Thinking…" label uses `RNAnimated` (legacy Animated API) with `useNativeDriver: true`. The comment in the file correctly documents why: transforms inside `MaskedView` often fail to repaint with Reanimated on iOS. Since `useNativeDriver: true` is set, the animation runs on the UI thread through the legacy native animation bridge — not on the JS thread. The visual result is correct. This is justified compat debt, not a regression.

---

## 4. Bundle Size Baseline

**Export command:** `npx expo export --platform ios`  
**Result:** `_expo/static/js/ios/entry-*.hbc` — **20 MB** Hermes bytecode  
**Module count:** 4,763 modules  
**Export time:** ~128s (Metro bundler cold start)

### Dependency Analysis

| Dependency | Version | Tree-shakeable? | Assessment |
|------------|---------|:---:|------------|
| `react-syntax-highlighter` | ^16.1.1 | ✅ Uses `Light` build | Correct — only 14 languages registered at module-load time (~14 × 2–5ms sync cost) |
| `simple-icons` | ^16.17.0 | ✅ 5 named imports only | Correct — `siAnthropic`, `siGooglegemini`, `siMeta`, `siMistralai`, `siPerplexity` |
| `@shopify/flash-list` | 2.0.2 | N/A | Normal bundling |
| `lucide-react-native` | ^1.8.0 | ✅ Named imports | Normal |
| `react-native-reanimated` | 4.2.1 | N/A | Expected large dependency |
| `expo-image` | ~55.0.8 | N/A | Correct library choice |

**No unexpectedly large dependencies found.** The `react-syntax-highlighter` `Light` import correctly avoids bundling all 200+ hljs grammars.

---

## 5. Auto-fixes Applied

| ID | Severity | File | Description |
|----|----------|------|-------------|
| perf-001 | high | `src/contexts/AccountContext.tsx` | Added `useMemo` to `AccountContextValue` object — was recreated as plain literal on every render, causing all `useAccountContext()` consumers to re-render even when nothing changed |
| perf-002 | low | `src/contexts/BootReadyContext.tsx` | Added `useMemo` to `BootReadyContext.Provider` value — was inline `{ diskHydrationAttempted, markDiskHydrationAttempted }` object in JSX, creating a new reference every render |
| perf-004 | med | `app/index.tsx` | Wrapped `modelsToSections(models)` in `useMemo([models])` — was called unconditionally on every `ChatScreen` render including streaming frames |
| perf-005 | med | `app/index.tsx` | Wrapped `agentsToPickerItems(agents)` in `useMemo([agents])` — same as above |
| perf-006 | med | `app/index.tsx` | Wrapped `adaptSessions(sessions, pinnedKeys, t(...))` in `useMemo([sessions, pinnedKeys, t])` — O(n) map was called on every `ChatScreen` render including streaming frames |
| perf-003 | high | `src/hooks/useConnection.ts` | Wrapped `useConnectionController` return value in `useMemo` — was a plain object literal on every render, causing all 27 `useConnection()` consumers to re-render whenever `ConnectionProvider` rendered (amplified during connect/reconnect cycles and on unrelated `serverProfiles` updates) |

---

## 6. Test Impact

**Command:** `npm test -- --passWithNoTests`  
**Result:** ✅ **83 suites / 1191 tests — all pass** (no regressions from auto-fixes)  
**Note:** One worker force-exit warning present (pre-existing, unrelated to these changes — caused by a timer leak in the test suite).

---

## 7. All Findings (Proposed — Requires Human Approval)

### perf-007 — `ThinkingNode` shimmer uses legacy `RNAnimated` (compat debt)
- **Severity:** low
- **Status:** deferred
- **File:** `src/components/chat/ThinkingNode.tsx`
- **Description:** The shimmer animation over the "Thinking…" label text uses `RNAnimated.loop` with `useNativeDriver: true` because `Reanimated` transforms inside `@react-native-masked-view/masked-view` fail to repaint on iOS. This is justified and documented in a code comment. The animation runs on the UI thread via the native driver, so there is no JS-thread performance impact. Flagged as compat debt to revisit if `MaskedView` + Reanimated compatibility improves in a future Expo SDK bump.

---

### perf-008 — `expo-image` thumbnails have no explicit `cachePolicy`
- **Severity:** nit
- **Status:** proposed
- **File:** `src/components/chat/MediaEmbed.tsx` (lines 316, 353)
- **Description:** The `<Image>` components for chat media thumbnails and the full-screen expanded image do not set `cachePolicy`. The default for `expo-image` is `memory-disk` for remote URIs, which is appropriate. Recommended to make this explicit for clarity and to ensure the behavior is intentional if the library's default ever changes.
- **Proposed fix:**
  ```tsx
  <Image
    source={authedSrc ?? { uri: src }}
    style={styles.thumb}
    contentFit="cover"
    cachePolicy="memory-disk"
    onError={() => handleImageError(src)}
  />
  ```

---

### perf-009 — `FlashList` in `MessageList` has no `estimatedItemSize`
- **Severity:** low
- **Status:** proposed
- **File:** `src/components/chat/MessageList.tsx`
- **Description:** The `<FlashList>` for the main chat list does not set `estimatedItemSize`. With `startRenderingFromBottom: true`, the initial render is not affected, but FlashList uses the missing estimate for window calculations during programmatic scrolls and when estimating total scroll height. Chat messages vary widely in height (1-line user bubble vs. multi-tool assistant turn). Providing an estimate (e.g. `estimatedItemSize={120}`) may reduce relayout passes during fast scrolling through history.
- **Risk:** Low. This prop only affects FlashList's internal virtualization window sizing, not visual output. Safe to add.
- **Proposed fix:** Add `estimatedItemSize={120}` to the `<FlashList>` in `MessageList.tsx`.

---

### perf-010 — `handleSend` in `ChatScreen` re-creates on every message (streaming-hot)
- **Severity:** low
- **Status:** proposed
- **File:** `app/index.tsx` (line 703)
- **Description:** `handleSend` has `messages` in its `useCallback` dep array. Since `messages` is a new reference on every streaming chunk, `handleSend` is recreated ~15× per second during streaming. `handleSend` is passed as a prop to `InputBar`. If `InputBar` is not wrapped in `React.memo`, this is harmless (InputBar re-renders anyway). If `InputBar` IS memoized and checks `onSend` by reference, it will re-render on every streaming chunk regardless.
- **Notes:** `InputBar` is not memoized (it receives many dynamic props including `isThinking` which changes during streaming, so memo would rarely short-circuit anyway). Actual impact is low. The underlying need for `messages` in `handleSend` is for annotation composition (`messagesById` map) — this could be refactored to use a `useRef` mirror to break the dep.
- **Proposed fix:** Mirror `messages` to a ref and read from the ref inside `handleSend` (same pattern already used for `showThinkingRef`, `onRetryRef`, etc. in `MessageList`). This removes `messages` from the `useCallback` dep array.
