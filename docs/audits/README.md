# ClawBoy Pre-Release Audit

Comprehensive feature-by-feature code review before App Store submission and open-source release. Each plan runs in a **fresh, isolated agent** so context windows stay clean.

---

## How to Run

1. Open a plan file (e.g. `docs/audits/01-gateway-protocol.md`).
2. Click **Run plan in new agent** (or start a fresh Cursor chat and attach the plan file).
3. The agent reads the plan, runs the checklist, writes `docs/audits/findings/<area>-findings.md`, applies allowed auto-fixes, updates its row below to `done`.
4. Per-area plans (`01`–`23`) are **independent** — fan out in parallel across multiple agents.
5. Cross-cutting plans (`X1`–`X7`) run **after** all per-area plans they depend on show `done`.
6. Final step: `X7-app-store-readiness.md` produces the release go/no-go doc.

### Agent instructions (paste at top of every new chat)

> You are running the audit plan at `docs/audits/<filename>.md`. Read that file in full before touching anything. Your allowed actions and forbidden actions are defined in `docs/audits/_RULES.md`. Write your findings to `docs/audits/findings/<area>-findings.md`. Update your status row in `docs/audits/README.md` to `done` when finished.

---

## Status Table

Update your row when you begin (`in_progress`) and when you finish (`done`). Do not modify other rows.

### Per-Area Plans

| ID | Plan File | Scope (summary) | Status | Findings | Sev: C/H/M/L/N | Updated |
|----|-----------|-----------------|--------|----------|-----------------|---------|
| 01 | [01-gateway-protocol.md](01-gateway-protocol.md) | `src/lib/openclaw/` + pinned-ws module | todo | — | — | — |
| 02 | [02-auth-pairing.md](02-auth-pairing.md) | device-identity, ConnectionContext, useConnection, auth-callback | todo | — | — | — |
| 03 | [03-server-profiles.md](03-server-profiles.md) | useServerConfig, ServerProfileSync, AddServerSheet, pinning UI | todo | — | — | — |
| 04 | [04-chat-streaming.md](04-chat-streaming.md) | chat components, useChat, chatCache, messageBlocks, streamReveal | todo | — | — | — |
| 05 | [05-input-slash-commands.md](05-input-slash-commands.md) | InputBar, SlashCommandPalette, useCommands, useDraft | todo | — | — | — |
| 06 | [06-sessions-sidebar.md](06-sessions-sidebar.md) | SessionSidebar, useSessions, gesture drawer | todo | — | — | — |
| 07 | [07-agents-models-skills.md](07-agents-models-skills.md) | useAgents, useModels, useAgentFiles, modelProvider | todo | — | — | — |
| 08 | [08-onboarding.md](08-onboarding.md) | OnboardingScreen (1101 lines — split candidate), app/onboarding | todo | — | — | — |
| 09 | [09-settings.md](09-settings.md) | settings components + app/settings/ screens | todo | — | — | — |
| 10 | [10-voice-tts.md](10-voice-tts.md) | src/lib/voice/, TTS hooks, voice settings | todo | — | — | — |
| 11 | [11-media-attachments.md](11-media-attachments.md) | src/lib/media/, attachments, MediaEmbed, VideoEmbed | todo | — | — | — |
| 12 | [12-annotations.md](12-annotations.md) | annotations.ts, AnnotationContext, annotation components | todo | — | — | — |
| 13 | [13-purchases-iap.md](13-purchases-iap.md) | src/lib/purchases/, PurchasesContext | todo | — | — | — |
| 14 | [14-account-supabase.md](14-account-supabase.md) | src/lib/supabase/, AccountContext, account UI | todo | — | — | — |
| 15 | [15-achievements-badges.md](15-achievements-badges.md) | badges components, achievements screen | todo | — | — | — |
| 16 | [16-demo-mode.md](16-demo-mode.md) | src/lib/demo/, DemoModeBanner, useChat demo branch | todo | — | — | — |
| 17 | [17-ota-updates.md](17-ota-updates.md) | useOTAUpdate, UpdateNudgeBanner, certs/, app.json updates | todo | — | — | — |
| 18 | [18-feedback-worker.md](18-feedback-worker.md) | infra/feedback-worker/, src/lib/feedback/, FeedbackSheet | todo | — | — | — |
| 19 | [19-conventions.md](19-conventions.md) | ConventionInstallContext, installConventions, conventions UI | todo | — | — | — |
| 20 | [20-theme-i18n-appearance.md](20-theme-i18n-appearance.md) | ThemeContext, LanguageContext, i18n/, appearance settings | todo | — | — | — |
| 21 | [21-native-module-pinned-ws.md](21-native-module-pinned-ws.md) | modules/expo-pinned-websocket/ (native Swift/ObjC + JS) | todo | — | — | — |
| 22 | [22-ios-native-config.md](22-ios-native-config.md) | ios/ClawBoy/, app.json, eas.json, permissions, privacy manifest | todo | — | — | — |
| 23 | [23-supabase-migrations.md](23-supabase-migrations.md) | supabase/migrations/, RLS policies | todo | — | — | — |

### Cross-Cutting Plans (run after per-area)

| ID | Plan File | Depends On | Status | Findings | Sev: C/H/M/L/N | Updated |
|----|-----------|------------|--------|----------|-----------------|---------|
| X1 | [X1-repo-hygiene-oss.md](X1-repo-hygiene-oss.md) | all 01–23 | todo | — | — | — |
| X2 | [X2-security-sweep.md](X2-security-sweep.md) | 01, 02, 03, 13, 14, 17 | todo | — | — | — |
| X3 | [X3-performance-sweep.md](X3-performance-sweep.md) | 04, 05, 06, 11 | todo | — | — | — |
| X4 | [X4-deps-and-licenses.md](X4-deps-and-licenses.md) | all 01–23 | todo | — | — | — |
| X5 | [X5-test-coverage.md](X5-test-coverage.md) | all 01–23 | todo | — | — | — |
| X6 | [X6-a11y-i18n.md](X6-a11y-i18n.md) | 20 | todo | — | — | — |
| X7 | [X7-app-store-readiness.md](X7-app-store-readiness.md) | X1, X2, X3, X4 | todo | — | — | — |

---

## Findings Conventions

- **Severity**: `critical` (data loss / security breach) · `high` (crashes, auth bugs, perf blockers) · `med` (correctness issues, UX breakage) · `low` (code smell, missing type, minor bug) · `nit` (style, grammar)
- **Status**: `fixed` (auto-fixed by agent) · `proposed` (patch written in findings, awaiting human approval) · `deferred` (known, won't fix now, reason stated) · `wontfix`
- **Finding IDs**: `<area>-NNN` e.g. `gateway-001`, `auth-003`, `X2-007`

---

## Release Go / No-Go

After all `X*` plans complete, a final **release-go-no-go** doc summarizing:

- Total severity counts across all findings
- Any unresolved `critical` or `high` items (blockers)
- Recommended fix order before TestFlight build
- Confirmed green test suite

Location: `docs/audits/findings/release-go-no-go.md`
