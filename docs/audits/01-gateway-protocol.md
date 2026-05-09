# Audit Plan: Gateway Protocol Layer

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/01-gateway-protocol-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/lib/openclaw/agents.ts
src/lib/openclaw/canvas.ts
src/lib/openclaw/chat.ts
src/lib/openclaw/client.ts
src/lib/openclaw/clientContext.ts
src/lib/openclaw/commands.ts
src/lib/openclaw/config.ts
src/lib/openclaw/cron-jobs.ts
src/lib/openclaw/features.ts
src/lib/openclaw/hooks.ts
src/lib/openclaw/index.ts
src/lib/openclaw/installConventions.ts
src/lib/openclaw/interactive.ts
src/lib/openclaw/logs.ts
src/lib/openclaw/nodes.ts
src/lib/openclaw/sessions.ts
src/lib/openclaw/skills.ts
src/lib/openclaw/tool-display.ts
src/lib/openclaw/types.ts
src/lib/openclaw/utils.ts
modules/expo-pinned-websocket/**
src/lib/__tests__/ (files related to openclaw)
```

## 2. Out of Scope

- `src/hooks/useConnection.ts` — covered in plan 02
- `src/contexts/ConnectionContext.tsx` — covered in plan 02
- All other `src/` files not listed above
- `docs/audits/` (read-only)
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **Security** section (rules 1–10), **Protocol Layer** section, **WebSocket Protocol Essentials**, **Patterns to steal from ClawControl**
2. `docs/audits/_CHECKLIST.md`
3. `docs/audits/_RULES.md`

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] `_connectGeneration` counter incremented before every new connect attempt; every async op checks it before acting
- [ ] Stale response handling: responses from prior connect generations are silently discarded
- [ ] Reconnect backoff: exponential with jitter, 1–30 s range, max 20 attempts as documented
- [ ] Stream isolation: per-session `SessionStreamState` — first event type for a session claims it; interleaved events from other sessions do not corrupt the active stream
- [ ] Active stream key guard: only first session producing text gets the UI slot
- [ ] Per-session message cache: Map with a defined size cap (no unbounded growth)
- [ ] Response watchdog timer: started on `chat.send`, cleared on first chunk; fires on timeout
- [ ] Defensive response parsing: all 6+ documented server response shapes handled
- [ ] `chat.history` display-normalized: no double-processing of control tokens
- [ ] `connect.challenge` flow: nonce received → signed → sent before `connect` request
- [ ] WS close codes handled: normal close vs error close vs server-initiated
- [ ] All RPC methods return typed payloads; errors from `payload.error` are surfaced

### Security (area-specific)

- [ ] No WS frame is acted upon without schema validation (malformed frames rejected)
- [ ] No token or device key appears in any log call
- [ ] `wss://` enforced; `ws://` connection is warned or blocked
- [ ] `connect` handshake fails gracefully — no infinite retry on auth failure

### Performance (area-specific)

- [ ] No synchronous JSON parsing of large payloads in the main JS thread without chunking strategy
- [ ] Message cache eviction prevents memory bloat on long sessions
- [ ] No unnecessary object allocation in the hot streaming path

### Cleanliness / Maintainability (area-specific)

- [ ] `client.ts` is the only file with reconnect logic — no duplicate backoff elsewhere
- [ ] `types.ts` is the single source of truth for all protocol types — no inline type duplication
- [ ] `utils.ts` functions (`stripAnsi`, `parseMediaTokens`, `classifyMediaUrls`, `generateUUID`) are pure with no side effects
- [ ] No module-level mutable globals (all timers/counters in class instance or hook ref)

### Tests (area-specific)

- [ ] Locate and run any existing openclaw protocol tests (`src/lib/__tests__/`)
- [ ] Critical paths with no tests: `_connectGeneration` guard, challenge-response flow, stream isolation — note gaps

### OSS-Readiness (area-specific)

- [ ] No hard-coded gateway hostnames, Tailscale magic-DNS names, or test server URLs
- [ ] No dev tokens or test credentials in any comment or string literal
- [ ] Protocol version constant is a named export, not a magic string inline

### i18n / Accessibility (area-specific)

- N/A (pure logic layer — no UI)

## 5. Deliverable

Write output to: `docs/audits/findings/01-gateway-protocol-findings.md`

Use the findings structure from `docs/audits/_TEMPLATE.md` §5. Finding IDs: `gateway-NNN`.

## 6. Exit Criteria

- [ ] `docs/audits/findings/01-gateway-protocol-findings.md` written with all sections filled
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred with reason
- [ ] `npm test --selectProjects logic` passes
- [ ] Row 01 in `docs/audits/README.md` flipped to `done`
