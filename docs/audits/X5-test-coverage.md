# Cross-Cutting Plan: Test Coverage

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/X5-test-coverage-findings.md`.
> Do NOT add large test suites — report coverage gaps, propose tests for the riskiest areas.
> Do NOT modify this plan file.

**Run after:** All per-area plans 01–23 are `done`. Read their test-section findings for context.

---

## 1. Scope

```
src/**/__tests__/**
src/components/**/__tests__/**
jest.config.js
jest.setup.js
```

Plus read-only analysis of all source files to assess what is untested.

## 2. Out of Scope

- `node_modules/`
- `ios/`
- `infra/feedback-worker/` (has its own test setup if any)
- `docs/audits/`

## 3. Required Reading

1. `jest.config.js` — understand the two Jest projects (`logic` and `components`)
2. `jest.setup.js` — understand mocks and global setup
3. Per-area test findings from all plans 01–23
4. `docs/audits/_RULES.md`

## 4. Test Coverage Checks

### Run Tests

- [ ] Run `npm test -- --coverage --coverageReporters json-summary 2>&1` (or `npm run test:logic` and `npm run test:components` separately)
- [ ] Record: total line coverage %, branch coverage %, function coverage %
- [ ] Record: any test failures (must be 0 for exit criteria)
- [ ] Record: any snapshots that are out of date

### Snapshot Freshness

- [ ] `rg "\.snap" src/ --type ts` — locate all snapshot files
- [ ] For each snapshot: verify it reflects current component output (not a stale ref from a past version)
- [ ] Run `npm test -- -u` to update snapshots (only if you are confident they are stale — list which ones were updated)

### Critical Logic Without Tests

For each of the following, note whether unit tests exist and if coverage is adequate:

- [ ] `src/lib/openclaw/utils.ts` — `stripAnsi`, `parseMediaTokens`, `classifyMediaUrls`, `generateUUID`
- [ ] `src/lib/openclaw/client.ts` — `_connectGeneration` guard, backoff logic, stream isolation
- [ ] `src/lib/device-identity.ts` — signing, keypair persistence (requires secure-store mock)
- [ ] `src/lib/messageBlocks.ts` — all block types
- [ ] `src/lib/messageMerge.ts` — merge correctness, abort, empty stream
- [ ] `src/lib/chatCache/crypto.ts` — encryption/decryption round-trip
- [ ] `src/lib/chatCache/validateBlob.ts` — validation rules
- [ ] `src/lib/pickBestServerProfile.ts` — all selection paths
- [ ] `src/lib/voice/extractSpeakableText.ts` — markdown stripping
- [ ] `src/lib/voice/effectivePreferDeviceTts.ts` — all branches (pure function)
- [ ] `src/lib/purchases/` — entitlement check logic (mock RevenueCat)
- [ ] `src/lib/supabase/serverPointers.ts` — sync idempotency
- [ ] `src/lib/annotations.ts` — position computation
- [ ] `src/lib/feedback/devBypassToken.ts` — dev-only guard

### Proposed Tests (high-risk, untested)

For any of the above without adequate coverage, write a `proposed` finding that includes:
- What the test should assert
- What mock/setup is needed
- Approximate complexity (trivial / moderate / complex)

Do NOT add the test files without human approval, except for truly trivial cases (< 10 lines, no new deps).

### Test Infrastructure

- [ ] `jest.setup.js`: mocks are appropriate and not over-broad (e.g. mocking entire `expo-secure-store` is correct; mocking `React` itself is not)
- [ ] `__mocks__/` directory: verify manual mocks are correct and up to date
- [ ] No tests that `console.error` suppress warnings that mask real issues

## 5. Deliverable

Write output to: `docs/audits/findings/X5-test-coverage-findings.md`

Finding IDs: `test-NNN`.

Include:
- Overall coverage summary (lines / branches / functions)
- Test run result (pass/fail counts)
- Stale snapshots list and update log
- Coverage gap table (module | tested? | coverage % | risk level | proposed test summary)

## 6. Exit Criteria

- [ ] `docs/audits/findings/X5-test-coverage-findings.md` written
- [ ] Tests run and results recorded
- [ ] No test failures
- [ ] Stale snapshots updated (logged)
- [ ] Coverage gaps documented with risk assessment
- [ ] Row X5 in `docs/audits/README.md` flipped to `done`
