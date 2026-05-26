# Changelog

All notable changes to ClawBoy will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

_No unreleased changes yet._

---

## [0.9.0] - 2026-05-12

First public release of ClawBoy. Initial App Store launch. Versioned **0.9.0** to signal pre-1.0 maturity; **1.0.0** will mark in-app purchase availability. Everything on the default branch through this entry is **v0.9.0** — there is not a separate in-tree “post-0.9” release line ahead of that tag.

### Added

- Native iOS/Android chat client for **OpenClaw** over WebSocket (`wss://`), with JSON-RPC request/response/events, keepalive/ticks, and defensive parsing of gateway payloads.
- **Device pairing** via Ed25519 identity keys stored only in Secure Store; challenge-response handshake before connecting.
- **Reconnection** with exponential backoff, jitter, capped attempts, and reconnect when the app returns to the foreground.
- **Session stream isolation** so switching sessions during streaming does not corrupt the UI; active-stream guards for chat events.
- Optional **SPKI certificate pinning** via the `expo-pinned-websocket` native module on iOS and Android; pin discovery (TOFU), pin mismatch handling, and Settings UI to manage pinned gateway keys.
- **Streaming assistant replies** with expandable thinking/reasoning blocks and tool-call cards (pending, running, completed, error).
- **Safe markdown** rendering for assistant content (no raw HTML injection).
- **Session management**: list, create, switch, and reset sessions; slide-out session sidebar with previews.
- **Agents** and **models** pickers wired to gateway catalogs.
- **Slash command palette** (`/`) with server-driven suggestions and **command confirmations** where the gateway requires them.
- **Multiple server profiles**: labeled gateways, per-profile gateway tokens in Secure Store only (never plaintext in AsyncStorage).
- **Connection status** and banners (connecting, pairing required, identity rejected, errors).
- **Settings**: server block (add/edit/remove profiles, logs), appearance (theme mode and dark variants), media-related options, **text-to-speech** controls (auto-speak replies, device vs gateway voice preferences), **About** screen with in-app changelog.
- **Onboarding** flow when no server profile exists yet.
- Optional **ClawBoy cloud identity** (Supabase): Sign in with Apple, Google (OAuth), and **email magic link**; account row in Settings is optional and does not block local-only gateway use; Supabase session tokens stored in Secure Store.
- **Feedback** submission to a configurable proxy endpoint; optional attachment of **recent screenshots** with privacy-conscious client preparation and a **Cloudflare Worker** companion for ingestion (see `infra/feedback-worker/`).
- **Encrypted on-disk chat cache** (AES-GCM) for faster cold-start UX; encryption key in Secure Store.
- **OTA updates** integration (`expo-updates`) with critical-update modal when applicable.
- **Infrastructure as code** for optional Supabase schema and Edge Functions under `infra/supabase/` (accounts, entitlements placeholder, account-delete, founders-related schema, **`purchases-webhook`** for store events), timestamped migrations, and local `supabase/config.toml` for CLI workflows — documented in `infra/supabase/README.md`.
- **Unit tests** (Jest) for protocol/helpers and key UI components; test configuration and mocks aligned with Expo/React Native.
- **Internationalization** (`i18n`): English and Simplified Chinese (`zh-CN`) string catalogs with a `LanguageProvider` and wired copy across onboarding, chat, input, settings, and common UI.
- **Demo mode**: local scripted OpenClaw client, demo storage, in-chat demo banner, and onboarding path to try the UI without a live gateway.
- **In-app purchases** (RevenueCat via `react-native-purchases`): `PurchasesContext`, product helpers, and Settings sections for **Founders** support and an optional **tip jar**; Founders badge for eligible accounts.
- **`serverPointers`** helper and related Supabase types for optional cloud-assisted server profile hints.
- **`ServerProfileSyncContext`**: optional sync path for server profile metadata with Supabase (plus unit tests for pointer resolution).
- **Account settings** screen and richer **Account** section (sign-in, account management) alongside existing Supabase auth flows.
- **Settings pairing card** for device pairing status and actions; **audio playing pill** in chat for inline playback/TTS affordance.
- **Hooks/utilities**: `useThrottledValue` for UI that should not update every frame; onboarding snapshot tests.
- **Badges / achievements system** (`src/badges/`): event-driven engine, unlock tracker, persistent store, tier definitions with color tokens, and `BadgesProvider`. Components: `BadgeCard`, `BadgeGrid`, `BadgePip`, `BadgeTierSegments`, `TrophyShelfScreen`, `UnlockToast`, `FoundersCountdown`, and `ProgressBar`.
- **Chat annotations**: `AnnotationContext`, `AnnotatedMessageBody`, `AnnotationsPill`, `InlineAnnotationRow`, `AnnotationPreviewModal`, and `AnnotationLayoutContext` — display and interact with inline source references attached to assistant replies.
- **Interactive options card** (`InteractiveOptionsCard`): renders gateway-driven choice buttons mid-conversation; full test coverage and protocol lib (`src/lib/openclaw/interactive.ts`).
- **Agent files viewer** (`AgentFileViewerModal`, `useAgentFiles`): browse and view files surfaced by the active agent during a session.
- **Streaming cursor** (`StreamingCursor`, `useStreamReveal`): animated blinking cursor that follows the live streaming edge of assistant text.
- **Section range picker** (`SectionRangePickerModal`): lets users select a line range within a file for targeted context attachment.
- **Conventions** (`ConventionInstallContext`, `src/lib/openclaw/installConventions.ts`, `SettingsConventionsSection`): install and manage project-level convention files from within the app.
- **Settings sub-screens** (`SettingsSubScreen`, `SettingsLinkRow`): reusable sub-screen wrapper + navigable link rows used by the new settings pages.
- **Settings split into file-based routes** (`app/settings/`): dedicated screens for About, Account, Achievements, Appearance, Conventions, Gateway Logs, Media, Pinned Keys, and Voice — each a focused page linked from the root Settings screen.
- **Brand components** (`BrandField`, `BrandLoader`, `BrandLogo`): shared branded UI primitives used in onboarding and settings.
- **Onboarding additions**: `AchievementsOptInStep` (opt-in to achievement tracking) and `AgentsMdPreviewModal` (preview an agent's AGENTS.md before connecting).
- **Message block parsing** (`src/lib/messageBlocks.ts`, `src/lib/messageMerge.ts`, `src/lib/openclaw/clientContext.ts`): structured decomposition of streamed assistant output into typed blocks for rendering.
- **`useInputTextController`**: dedicated hook managing draft text, cursor position, slash-command trigger detection, and paste handling; extracted from `InputBar`.
- **`useTokens`**: hook for tracking estimated token usage per session.
- **Debug ingest** (`src/lib/debugIngest.ts`): dev-only helper for ingesting and replaying raw gateway event logs.
- **Feedback dev bypass token** (`src/lib/feedback/devBypassToken.ts`): dev-mode token override for feedback submission without a live cloud account.
- **`useStreamReveal`**: hook that produces a progressively revealed string for streaming-text entry animations.
- **Utility modules** (`src/utils/links.ts`, `src/utils/markdownCache.ts`): safe URL helper and a keyed cache for parsed markdown ASTs to avoid redundant re-parses.
- **New test mocks**: `expo-network`, `file-viewer-context`, `reanimated-swipeable`, `use-agent-files`, `use-agents`.
- **New test coverage**: `InteractiveOptionsCard`, `StreamingTextRule`, `InputBarCard`, `useInputTextController`, `annotations`, `clientContext`, `installConventions`, `interactive`, `messageBlocks`, `messageMerge`, `messageParsing`, `links`, `demoIntegration`.
- **Feedback worker** (`infra/feedback-worker`): large expansion of the Cloudflare Worker — enriched ingestion pipeline, structured logging, and updated README.
- **Interactive options protocol doc** (`docs/interactive-options.md`): spec for gateway-driven interactive choice messages.
- **Haptics preferences**: `HapticsPreferencesContext` + `useHaptics` hook with a Settings toggle and EN/ZH-CN strings; call-site inventory documented in plan.
- **Auto-rename sessions** (experiment, env-overridable + persisted): apply the gateway's derived title after the first assistant turn unless the user has manually renamed. Sessions list/describe sanitize wrapped metadata so the sidebar shows the real prompt instead of the JSON envelope.
- **Exec approval card** (`ApprovalCard`) with allow-once / allow-always / deny, driven by `execApprovalRequested` / `execApprovalResolved` gateway events; `MessageList` renders a new `approvalGroup` kind; `useChat` exposes `resolveExecApproval` with optimistic status patching. Demo client gains `emitFakeExecApproval` plus required liveness stubs; debug section exposes a trigger button.
- **Annotation focus mode**: `CollapseWhen` wrapper + `useIsAnnotationFocusActive` collapse chat header, `InputBarHeader`, and info row while the annotation composer is focused; keyboard listener scrolls to tail only when the user was already near the bottom. Worklet-driven reveal scroll (Reanimated `scrollTo` synchronized with keyboard rise) replaces the rAF pipeline. `InlineAnnotationRow` gains a delete (X) button with confirmation dialog.
- **`InputBarAnnotationStrip`** (replaces `AnnotationsPill`); strip badge count excludes empty-draft annotations.
- **Developer mode** (`SettingsDeveloperSection`): 7-tap on the version footer reveals; `DevTokenRow` (compact input + border-only Save) moves here from the old `SettingsDebugSection`.
- **Experiments screen** + `ExperimentsContext`: runtime-togglable flags (`bareTextInput`, `suppressInputAccessibility`, paste-wrapper skip, intrinsic height, `stableProps`, `logDictation`, sidebar-gesture flags) lockable via env vars; `EXPO_PUBLIC_IOS_INPUT_VOICE_CONTROL_EXPERIMENTS` split into `EXPO_PUBLIC_IOS_INPUT_SKIP_PASTE_WRAPPER` + `EXPO_PUBLIC_IOS_INPUT_USE_INTRINSIC_HEIGHT` so paste-wrapper and mirror-height suspects can be bisected independently on TestFlight.
- **DictationProbeModal** + `dictationProbe` ring buffer (500 entries) for debug logging of dictation ticks; focus/blur events (`DictationFocusEntry`); source/isFocused/hasRef fields on text ticks; modal displays FOCUS/BLUR rows color-coded by type.
- **Gesture-driven sidebar open/close** (`useSessionSidebarGestures`): RNGH pan composes simultaneously with `MessageList`'s FlashList native scroll recognizer via `renderScrollComponent` wrapping the inner `Animated.ScrollView` in a `GestureDetector` carrying `Gesture.Native()`.
- **`ToolCallGroup`**: collapsible animated group for sequential tool calls, auto-collapse after 2.5s.
- **Multi-session streaming**: `useChat` tracks all streaming state per-session via Maps (`streamMessageIdRef`, `pendingBatchRef`, `streamingPhaseRef`, etc.); exposes `activityBySession` for sidebar spinners and per-session stream gating; socket-close pending recovery with reconcile-cancel logic.
- **Badges**: Wave 0 / Wave 1 release gating (`config.ts`), new badge definitions, `isFullyEarned` / `isNewYearMidnight` helpers, expanded events and store coverage.
- **Interactive options**: plain-JSON primary format (`data:application/json,{...}`) alongside legacy base64; doc updated.
- **Theme-aware splash screen** (`expo-splash-screen`) replaces the static asset; `SplashOverlay` holds the native splash visible until React has painted; `SplashWithTimeout` offers a soft `Updates.reloadAsync()` after 8s when hydration stalls.
- **ShellErrorFallback**: Try Again + Send Bug Report actions.
- **Chat primitives**: `ChatErrorBoundary`, `InfoMarker`, `CollapsibleSection`; utilities `computeBottomSpacer`, `pillState`, `pinToBottom`, `sendScrollTarget`.
- **About sub-cards**: `ChangelogSection`, `DebugFeedbackCard`, `PrivacySecurityCard`, `ThreatModelCard`.
- **iOS privacy manifest** + automatic UI style + splash configuration for store review.
- **OpenClaw capabilities system**: capability-watch GitHub Action + issue template, `OPENCLAW_CAPABILITIES.md`, `scripts/openclaw-capabilities/` extraction scripts.
- **Feedback worker** modules: `attachmentProxy`, `github`, `http`, `rateLimit`, `types`, `validation`.
- **Section layout registry** (`SectionLayoutRegistry`) for precise section-bottom measurement; `revealMessageBottom` gains `force` to bypass the near-bottom guard; `FocusModeScrollGuard` schedules scroll after focus-mode transitions settle.
- **License sync check** + Skia Jest mock.
- **Brand assets**: brandloader / brandfield SVGs.

### Changed

- Iterative refactors of the OpenClaw WebSocket **client** and **chat** modules for clearer stream handling, typed events, reconnect behavior, and alignment with gateway semantics.
- **UI polish** across chat (headers, banners, bubbles, lists), onboarding, settings (including server block and meta panels), and theme tokens for consistency with the intended design system.
- **Pairing-required** messaging moved out of a dedicated chat surface into **Settings** (`PairingRequiredCard` removed from chat in favor of a settings pairing card).
- **Message list / bubbles**, **slash command palette**, **tool and thinking** cards, **connection banners**, and **input bar** pieces updated for demo mode, i18n, media/audio cues, and layout consistency.
- **Jest** split into **logic** vs **components** projects with shared setup tweaks for faster, clearer test runs.
- **`useServerConfig`** and related settings flows expanded for multi-profile editing, sync, and server-row UX; **`infra/supabase/README`** updated for the new migrations and functions.
- `app/settings.tsx` removed; settings navigation now handled by `app/settings/_layout.tsx` and per-screen files under `app/settings/`.
- `MessageBubble` and `MessageList` heavily refactored to render annotation rows, streaming cursor, agent-file viewer trigger, and interactive option cards inline.
- `InputBar` extracted input text state into `useInputTextController`; action bar, card, header, info row, and rainbow glow cleaned up and aligned with new hook.
- `OnboardingScreen` extended with achievements opt-in step and agents-md preview modal.
- `AboutScreen` and `SettingsMetaPanels` updated to reflect new settings structure and badge/account sections.
- `SessionRow` and `sessionSidebarStyles` refreshed for badge pip display and visual consistency.
- `ThemeContext` and `theme.ts` extended with badge tier color tokens and brand-color palette additions.
- `useChat` updated for block-based streaming; `useChatDiskHydration` and chat cache types extended to persist block structure.
- `useConnection` and `useAutoReconnect` hardened with cleaner generation tracking and backoff edge cases.
- `useDraft` rewritten to delegate text state to `useInputTextController`.
- `DemoOpenClawClient` updated to emit interactive option events and block-structured messages.
- `i18n` (EN + zh-CN) expanded with strings for badges, achievements, annotations, interactive options, conventions, agent files, and new settings screens.
- `jest.config.js` updated to include new test suites and mock registrations.
- **Inline reply card** redesigned: single-Q now has a header bar (question prompt or "Reply" fallback), Clear is always visible in the footer (disabled until dirty), Send button matches the main chat input (rounded square, ↑ arrow). Multi-Q dots grouped beside Skip to make pagination context clear; active/answered dots use accent color. `SegmentedIconPill` active segment now fills with accent color (applies to Install Mode, Theme Mode, and UI Density selectors).
- **Inline reply primer** (convention v5) compacted ~35%, opens with the explicit framing that interactive cards are the primary way to ask the user questions in ClawBoy.
- **App icon** refreshed to `icon-grid` with 3D depth treatment (shine, vignette, gradient-filled glyph, deep drop shadow from `icon-purple-large`); constellation updated to NW + S middle + SE (was NW + W middle + SE).
- **Splash screen** now uses a transparent-background variant of the same icon (`icon-grid-transparent.svg`) so the grid and glyph composite cleanly over the dark splash `backgroundColor` (`#080B12`) without any gradient edge clash.
- **Accessibility and localization** pass across chat, settings, onboarding, and shared UI: clearer `accessibilityLabel` / role coverage, focus order fixes, and i18n string gaps closed (pre-release audit X6).
- **Voice / TTS**: shared preferences context, audio-session cleanup, and gateway vs device voice heuristics by model; follow-up fixes from voice code review.
- **Onboarding** refactored into `app/onboarding/steps/*` and `components/*` modules (smaller surfaces, same flow).
- **Slash command palette** split into `components/input/palette/*` with hooks extracted for maintainability.
- **Session sidebar**: loading skeleton and error fallback for session list fetch failures.
- **Feedback sheet** split into smaller components and helpers; feedback worker gains Vitest coverage and dependency updates.
- **Repo hygiene (OSS prep)**: reference prototype removed from tracking, audit-driven cleanup of hygiene items (X1).
- **BrandField** (onboarding + About backdrop) now renders with **@shopify/react-native-skia** instead of `MaskedView` and hundreds of RN animated mask views — same visual model (rotating theme gradient, sparse cell blink, reduced motion). Adds a native dependency; ship with a new store binary (not JS-only OTA). Expect a modest **binary size** increase; measure `.ipa` / `.aab` on your next release build for release notes.
- Large-variant grid geometry lives in **`brandLoaderGridConstants.ts`** (no React Native imports) for shared use by BrandLoader and BrandField layout; theme gradient color arrays and per-tile Skia clip `rrect`s are memoized to avoid churn on re-renders; **Jest logic tests** cover `brandFieldLayout` grid math.
- **Keyboard handling**: migrate to `react-native-keyboard-controller`; wrap app in `KeyboardProvider`; replace `KeyboardAvoidingView` and RN `Keyboard` events with keyboard-controller equivalents; `InputBar` paddingBottom animated via `useReanimatedKeyboardAnimation`.
- **Component decomposition**: split `MessageBubble` → `chat/messageBubble/` (`CachedMarkdown`, `MessageBlocks`, `MessageBody`, `MessageBubbleActions`, `MessageParts`, `ParagraphRevealRenderer`, `ParagraphFade`, `StreamingBottomFade`); `InteractiveOptionsCard` → directory (`CollapsedSummary`, `QuestionBody`, types, `cardStyles`); `AboutScreen` → `settings/about/`; `AddServerSheet` → `settings/addServer/` (`ServerAuthSection`, `ServerConnectionWarnings`, `ServerInfoCard`, `serverUrlHelpers`); `GatewayLogsModal` → `settings/logs/` (`LogFilterBar`, `LogHeader`, `LogToolbar`, `LogFooter`, `JumpToLatestPill`, `DaySeparatorRow`); `SettingsScreen` → `settings/sections/` (8 section components); remove `SettingsMetaPanels`.
- **Paragraph reveal**: replace `useStreamReveal` with `useParagraphReveal` + `SweepingText` for paragraph-level reveal animation.
- **ExecApprovalDecision**: `'allow'` → `'allow-once'` to match gateway contract.
- **`CollapseWhen`** height animation rewritten to `display:none` + opacity fade (fixes stale Yoga layout measurements on re-expand); adds `instantCollapse` prop to skip the 150ms animation; `app/index.tsx` uses `instantCollapse` for header and defers focus-mode chrome collapse until `keyboardDidHide` to prevent contentOffset clamp on Done tap.
- **`SessionSidebarList`**: replace FlashList with ScrollView.
- **`ChatHeader`** rename now shows optimistic title + `ActivityIndicator` spinner while the API call is in-flight; rolls back on failure. `useSessions` applies the optimistic title locally before round-trip. Demo mode gains `sessionOverrides` persistence so seeded sessions retain renames across `listSessions()` regenerations.
- **Camera / mic buttons**: always visible (no longer gated on `annotationTargetMode`).
- **EAS production profile**: `autoIncrement` enabled so iOS `buildNumber` and Android `versionCode` bump automatically on EAS servers (`appVersionSource: remote` tracked the field but did not increment it).
- **Demo streaming**: token-sized chunks with faster cadence (12–18 ms).
- **`ConnectionBanner`** layout: flex / flexShrink / maxWidth constraints prevent overflow.
- **`InputBarHandle`** exposes `blur()`; `exitAnnotationFocusMode` unified helper for blur + dismiss + state reset; `onScrollUserDismiss` lets a user drag dismiss annotation focus mode.
- **`MessageList`**: `armPendingReveal` + `notifyComposerFocus` on imperative handle; `useKeyboardHandler` replaces `KeyboardEvents`; `useAnimatedRef` + worklet `scrollTo` for native-thread scroll; MVCP gating via `annotationFocusActive`; `contentInset.bottom = 120` during focus mode.
- **Empty state** redesign: larger hero logo, staggered `FadeInUp`, copy tweak.
- **Website doc sync**: GitHub Action dispatches `kjswalls/v0-sunday-softworks-website` `clawboy-docs-sync` event on changes to `CHANGELOG.md` / legal docs on `main`; documented PR-creation policy and `SYNC_PR_CREATE_TOKEN`.

### Fixed

- **Apple Sign-In button localization** — declared `CFBundleLocalizations: [en, zh-Hans]` in `Info.plist` so iOS resolves the app's effective UI language correctly. On Simplified Chinese devices the native `ASAuthorizationAppleIDButton` now renders "通过 Apple 登录" instead of the English fallback. Side effect: system permission prompts, `Alert` default buttons, the share sheet, and other native iOS surfaces also now render in the device language for supported locales.
- **Pinned WebSocket** native module (iOS/Android) follow-ups from native-config audit.
- **Annotations, badges, chat, and common components**: wave-2 / wave-3 audit remediations (correctness, tests, smaller UI fixes).
- **Supabase**: `fix_purchased_at` migration for purchase timestamp backfill.
- **Performance and dependencies**: targeted re-render / memo fixes and license-metadata follow-ups (X3 / X4 audits).
- **Bug #11 (history truncation)**: `chat.history` RPC errors no longer swallowed; `loadHistory` returns a result code; cold-start reconcile retries ambiguous empty-over-disk responses with backoff instead of caching `[]`.
- **`messageMerge`**: `compositeKey` fallback recovers identity across id-drift; DEV-only field-level diff logging on mismatched `byId` hits.
- **`openclaw/utils.stripConversationMetadata`** skips `[clawboy-*]` labels so the sidebar preview shows the real prompt rather than the JSON envelope.
- **Animated overflow clip on Android**: use a static wrapper, not `useAnimatedStyle`.
- **`StreamingBottomFade`** alpha channel: append `'00'`, not `'transparent'`.
- **`ThinkingNode`**: cap expanded height at 220 px with a nested ScrollView.
- **Dictation probe**: stable snapshot avoids allocation on every `getDictationEntries()`.
- **iOS dictation drop-after-first-word**: two experiment flags (`bareTextInput` removes outer `Pressable` around composer TextInput; `suppressInputAccessibility` clears `accessibilityLabel` / `accessible`) to bisect cause on TestFlight.

### Security

- Gateway tokens, device identity material, Supabase session tokens when used, and chat-cache keys stored via **`expo-secure-store`** rather than AsyncStorage; RLS-oriented Supabase schema documented for cloud tables.
- Certificate pinning and explicit flows when a gateway certificate no longer matches a stored pin.
- **WebSocket ingress**: JSON text frames validated with **Zod** before dispatch to protocol handlers; stricter parsing of **auth callback** deep links (X2 security audit).

[Unreleased]: https://github.com/your-org/clawboy-expo/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/your-org/clawboy-expo/releases/tag/v0.9.0
