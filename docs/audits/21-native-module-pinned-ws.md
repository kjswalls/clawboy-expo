# Audit Plan: Native Module — expo-pinned-websocket

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/21-native-module-pinned-ws-findings.md` plus any allowed auto-fixes.
> **Native source (Swift/ObjC/Kotlin) in this module is read-only for analysis — do NOT modify native files.**
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
modules/expo-pinned-websocket/**
```

This includes all JS/TS, Swift, Objective-C, Kotlin, and Java files within the module directory.

## 2. Out of Scope

- `node_modules/`
- `ios/Pods/` — read for understanding only
- All other `src/` files
- `docs/audits/`

## 3. Required Reading

1. `.cursorrules` — **Security** rule 8 (certificate pinning design)
2. `docs/plans/tofu-spki-pinning-followup.md` (if present) — pinning design intent
3. [Expo Modules API docs](https://docs.expo.dev/modules/overview/) — module structure conventions
4. `docs/audits/_CHECKLIST.md`
5. `docs/audits/_RULES.md`

> **All native file findings are `proposed`** — changes require a new native build to validate. Do NOT auto-fix any Swift/ObjC/Kotlin file.

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` where applicable, plus these area-specific checks:

### Correctness (area-specific)

- [ ] SPKI pin comparison uses constant-time comparison to avoid timing attacks
- [ ] Pin mismatch closes the WebSocket connection immediately — not after sending any data
- [ ] Multiple accepted pins supported (for certificate rotation)
- [ ] TLS handshake failure vs pin mismatch: each surfaces a distinct error code to JS layer
- [ ] Pin bypass in dev: if there is a dev bypass, it is conditionally compiled — not present in release builds
- [ ] Module correctly handles WS close codes (1000, 1001, 1006, etc.) and surfaces them to JS
- [ ] Thread safety: native WS callbacks run on a background thread — verify they dispatch to correct thread before calling JS bridge
- [ ] Memory management: no retain cycles in native delegate/callback patterns

### Security (area-specific)

- [ ] **No dev-mode pin bypass compiled into release builds** — critical
- [ ] SPKI hash algorithm is SHA-256 (not SHA-1 or MD5)
- [ ] Certificate chain validation is NOT disabled (no `trustAllCerts` or equivalent)
- [ ] Native module does not log certificate data, pin hashes, or TLS session keys

### Performance (area-specific)

- [ ] Pin verification runs on background thread — not main thread
- [ ] WebSocket frame delivery to JS is batched appropriately — not a callback per byte

### Cleanliness / Maintainability (area-specific)

- [ ] JS/TS API surface is minimal and well-typed
- [ ] Module exports are documented with JSDoc or equivalent
- [ ] Native code follows Expo module conventions (not a fork of an unrelated library)

### Tests (area-specific)

- [ ] JS unit tests for the module's TypeScript API surface
- [ ] Note: native-side tests require a simulator — flag any native test infrastructure present or missing

### OSS-Readiness (area-specific)

- [ ] Module has its own `README.md` describing the API and usage
- [ ] Native code free of internal company references in comments
- [ ] License header present in native files (if required by OSS license)

### i18n / Accessibility (area-specific)

- N/A (pure networking module — no UI)

## 5. Deliverable

Write output to: `docs/audits/findings/21-native-module-pinned-ws-findings.md`

Finding IDs: `pinws-NNN`.

All native file findings must be `proposed`.

## 6. Exit Criteria

- [ ] `docs/audits/findings/21-native-module-pinned-ws-findings.md` written
- [ ] No native files modified
- [ ] SPKI comparison method documented (constant-time or flagged)
- [ ] Dev bypass presence/absence documented
- [ ] Severity counts accurate
- [ ] All JS/TS auto-fixable items fixed or deferred
- [ ] `npm test` passes
- [ ] Row 21 in `docs/audits/README.md` flipped to `done`
