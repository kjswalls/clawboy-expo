# Cross-Cutting Plan: Performance Sweep

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/X3-performance-sweep-findings.md`.
> Safe auto-fixes (`React.memo`, `useCallback`, `useMemo` additions where provably safe) are allowed.
> Do NOT modify streaming or protocol logic.
> Do NOT modify this plan file.

**Run after:** Plans 04, 05, 06, 11 are `done`. Read their findings for context.

---

## 1. Scope

All source files under `src/` and `app/` — read-only analysis with targeted memoization fixes.

## 2. Out of Scope

- `node_modules/`
- `ios/`, `android/`
- `docs/audits/`

## 3. Required Reading

1. `.cursorrules` — **Performance** checklist items
2. Per-area findings from plans 04, 05, 06, 11
3. `docs/audits/_RULES.md`

## 4. Performance Checks

### Startup Time

- [ ] `app/_layout.tsx`: count providers wrapping the root — list each one; flag any that do expensive initialization synchronously
- [ ] `BootReadyContext.tsx` (if present): verify the startup gate works correctly and does not add unnecessary delay
- [ ] First render time of `index.tsx` (chat screen): identify any blocking operations before first paint
- [ ] Font loading, splash screen, and initial asset loading: deferred until assets are ready (not blocking first frame)

### List Performance

- [ ] `MessageList.tsx` / `FlashList`: verify `keyExtractor` returns stable keys, `estimatedItemSize` is set, `windowSize` is ≥ 5
- [ ] `SessionSidebarList.tsx`: same FlashList/FlatList audit
- [ ] `SlashCommandPalette`: if command list is long (> 20 items), uses a virtualized list — not `map` into a `ScrollView`
- [ ] `BadgeGrid.tsx`: uses `FlatList` / `FlashList`

### Re-render Hotspots

- [ ] `MessageBubble` wrapped in `React.memo` with correct equality (not shallow-equal issue)
- [ ] `SessionRow` wrapped in `React.memo`
- [ ] `ToolCallCard` wrapped in `React.memo`
- [ ] `ThinkingNode` wrapped in `React.memo`
- [ ] `ConnectionContext` value: verify using `useMemo` so object identity is stable
- [ ] `ThemeContext` value: same
- [ ] `AccountContext` value: same
- [ ] Event handler props passed to memoized children: verify wrapped in `useCallback`

### Animation Thread

- [ ] `StreamingCursor` animation: verify `useAnimatedStyle` / Reanimated, not `Animated.Value` on JS thread
- [ ] `ThinkingNode` expand/collapse: Reanimated `withTiming` on UI thread
- [ ] `InputRainbowGlow`: Reanimated `withRepeat` / `useAnimatedStyle` on UI thread
- [ ] `BrandAnimatedLogo`: same check
- [ ] Sidebar drawer: `react-native-gesture-handler` + Reanimated — not JS-driven `Animated`

### Image Caching

- [ ] All images use `expo-image` (`<Image>` from `expo-image`) — not `react-native` `<Image>` unless justified
- [ ] `expo-image` `cachePolicy` set appropriately (e.g. `memory-disk` for avatars, `none` for one-time media)
- [ ] No `<Image>` with a data URI that is recomputed each render

### Bundle Size

- [ ] Run `npx expo export --platform ios 2>&1 | tail -20` (do NOT deploy — just analyze) for a bundle size baseline
- [ ] Identify any unexpectedly large dependencies (e.g. `react-syntax-highlighter` bundles all languages — verify lazy loading or language subset)
- [ ] `simple-icons` package: verify it is tree-shakeable and only used icons are bundled

## 5. Deliverable

Write output to: `docs/audits/findings/X3-performance-sweep-findings.md`

Finding IDs: `perf-NNN`.

Include:
- Provider tree list with startup impact assessment
- Re-render audit table (component | memoized? | callback stable? | verdict)
- Animation thread audit table (component | thread | verdict)
- Bundle size baseline (or note if export not run)

## 6. Exit Criteria

- [ ] `docs/audits/findings/X3-performance-sweep-findings.md` written
- [ ] Re-render audit table complete
- [ ] All safe `React.memo` / `useCallback` / `useMemo` additions applied and logged
- [ ] Animation thread audit complete
- [ ] Row X3 in `docs/audits/README.md` flipped to `done`
