# X4 — Deps & Licenses Findings

**Plan:** `docs/audits/X4-deps-and-licenses.md`
**Date:** 2026-05-12
**Auditor:** automated agent (Sonnet 4.6)
**Status:** report-only — no source files or package files were modified

---

## 1. npm Audit Summary

Command: `npm audit` (11 vulnerabilities total)

| Severity | Count | Packages Affected | Prod or Dev? |
|----------|-------|-------------------|--------------|
| Critical | 0 | — | — |
| High | 0 | — | — |
| Moderate | 6 | `markdown-it` (ReDoS), `postcss` (XSS in build) | 1 prod dep · 5 dev/build chain |
| Low | 5 | `@tootallnate/once` (control-flow) | dev/test chain only |

**Full vulnerability details:**

### deps-001 — `markdown-it` ReDoS (GHSA-38c4-r59v-3vqw) · severity: **med**

- **Package:** `markdown-it 13.0.0–14.1.0` (no fix available)
- **Via:** `@ronradtke/react-native-markdown-display ^8.1.0` → `markdown-it` (production dep)
- **Impact:** Regular Expression Denial of Service; attacker-controlled markdown can cause catastrophic backtracking. On a mobile client this means the app hangs/freezes rendering a malicious AI response.
- **Note:** No upstream fix available. Upstream `@ronradtke/react-native-markdown-display` has not yet shipped a `markdown-it` 14.2+ upgrade.
- **Recommendation:** Monitor for a new release; consider vendoring or forking if no fix ships before App Store submission.

### deps-002 — `postcss <8.5.10` XSS (GHSA-qx2v-qp2m-jg93) · severity: **low** (build-only)

- **Via:** `@expo/metro-config` → `@expo/cli` → `expo`
- **Impact:** XSS via unescaped `</style>` in CSS stringify output — affects Metro bundler CSS processing only; not present in the iOS app bundle at runtime.
- **Fix:** Would require `npm audit fix --force`, downgrading expo to 49.x — unacceptable. Expo upstream owns this.
- **Note:** Dev-machine / CI risk only.

### deps-003 — `@tootallnate/once <3.0.1` (GHSA-vpq2-c234-7xj6) · severity: **low** (dev-only)

- **Via:** `jest-expo >=48` → `jest-environment-jsdom` → `jsdom` → `http-proxy-agent`
- **Impact:** Incorrect control flow scoping in test environment. No production exposure.
- **Fix:** Would require downgrading `jest-expo` to 47.x — breaking change. Dev-only.

---

## 2. npm Outdated Table

Command: `npm outdated`

| Package | Current | Wanted | Latest | Prod/Dev | Flag? |
|---------|---------|--------|--------|----------|-------|
| `@gorhom/bottom-sheet` | 5.2.9 | 5.2.14 | 5.2.14 | prod | — patch behind |
| `@react-native-async-storage/async-storage` | 2.2.0 | 2.2.0 | 3.0.2 | prod | ⚠️ 1 major behind |
| `@shopify/flash-list` | 2.0.2 | 2.0.2 | 2.3.1 | prod | — exact pinned, minor behind |
| `@supabase/supabase-js` | 2.104.1 | 2.105.4 | 2.105.4 | prod | — patch behind |
| `babel-preset-expo` | 55.0.18 | 55.0.21 | 55.0.21 | dev | — patch behind |
| `expo` | 55.0.15 | 55.0.23 | 55.0.23 | prod | — patch behind (SDK 55 ✅) |
| `expo-constants` | 55.0.15 | 55.0.16 | 55.0.16 | prod | — patch behind |
| `expo-device` | 55.0.15 | 55.0.16 | 55.0.16 | prod | — patch behind |
| `expo-file-system` | 55.0.17 | 55.0.19 | 55.0.19 | prod | — patch behind |
| `expo-image` | 55.0.8 | 55.0.10 | 55.0.10 | prod | — patch behind |
| `expo-image-manipulator` | 55.0.15 | 55.0.16 | 55.0.16 | prod | — patch behind |
| `expo-image-picker` | 55.0.18 | 55.0.20 | 55.0.20 | prod | — patch behind |
| `expo-linking` | 55.0.14 | 55.0.15 | 55.0.15 | prod | — patch behind |
| `expo-media-library` | 55.0.15 | 55.0.16 | 55.0.16 | prod | — patch behind |
| `expo-router` | 55.0.12 | 55.0.14 | 55.0.14 | prod | — patch behind |
| `expo-status-bar` | 55.0.5 | 55.0.6 | 55.0.6 | prod | — patch behind |
| `expo-video` | 55.0.15 | 55.0.16 | 55.0.16 | prod | — patch behind |
| `expo-web-browser` | 55.0.14 | 55.0.15 | 55.0.15 | prod | — patch behind |
| `i18next` | 26.0.8 | 26.1.0 | 26.1.0 | prod | — minor behind |
| `jest` | 29.7.0 | 29.7.0 | 30.4.2 | dev | ⚠️ 1 major behind (dev) |
| `jest-expo` | 55.0.16 | 55.0.17 | 55.0.17 | dev | — patch behind |
| `lucide-react-native` | 1.8.0 | 1.14.0 | 1.14.0 | prod | — 6 minor behind |
| `react` | 19.2.0 | 19.2.0 | 19.2.6 | prod | — patch behind |
| `react-i18next` | 17.0.6 | 17.0.7 | 17.0.7 | prod | — patch behind |
| `react-native` | 0.83.4 | 0.83.4 | 0.85.3 | prod | — 0.85 is Expo SDK 56 territory; 0.83.x is correct for SDK 55 ✅ |
| `react-native-gesture-handler` | 2.30.1 | 2.30.1 | 2.31.2 | prod | — minor behind |
| `react-native-purchases` | 10.0.1 | 10.1.0 | 10.1.0 | prod | — minor behind |
| `react-native-reanimated` | 4.2.1 | 4.2.1 | 4.3.1 | prod | — minor behind |
| `react-native-safe-area-context` | 5.6.2 | 5.6.2 | 5.7.0 | prod | — minor behind |
| `react-native-screens` | 4.23.0 | 4.23.0 | 4.25.0 | prod | — minor behind |
| `react-native-svg` | 15.15.3 | 15.15.3 | 15.15.5 | prod | — patch behind, exact pinned |
| `react-native-worklets` | 0.7.2 | 0.7.2 | 0.8.3 | prod | — minor behind |
| `react-test-renderer` | 19.2.0 | 19.2.0 | 19.2.6 | dev | — patch behind |
| `simple-icons` | 16.17.0 | 16.19.0 | 16.19.0 | prod | — minor behind |
| `typescript` | 5.9.3 | 5.9.3 | 6.0.3 | dev | ⚠️ 1 major behind (dev) |

**Notable flags:**
- `@react-native-async-storage/async-storage` 2.2.0 → 3.0.2: 1 major behind. v3 is compatible with RN 0.71+ but may have API changes. Pinned exact at 2.2.0 intentionally; upgrade requires testing.
- `jest` 29.7.0 → 30.4.2: dev-only; jest 30 has breaking changes. Low urgency.
- `typescript` 5.9.3 → 6.0.3: dev-only; TS 6 is a significant upgrade with strictness changes.
- `react-native` 0.83.4 vs latest 0.85.3: **not a concern** — 0.83.x is the correct version for Expo SDK 55. Latest (0.85.x) belongs to SDK 56+.
- No Expo SDK packages are more than 2 major versions behind. All are correctly on SDK 55.x.

---

## 3. Version Pinning Assessment

### Expo-managed packages using `^` instead of `~` (should be `~`)

| Package | Current Pin | Should Be | Finding |
|---------|-------------|-----------|---------|
| `expo` | `^55` | `~55.0.x` | deps-004 · nit |
| `expo-apple-authentication` | `^55.0.13` | `~55.0.13` | deps-004 · nit |
| `expo-auth-session` | `^55.0.15` | `~55.0.15` | deps-004 · nit |
| `expo-localization` | `^55.0.13` | `~55.0.13` | deps-004 · nit |

All other `expo-*` packages correctly use `~`. Using `^` on Expo SDK packages risks pulling in a breaking 56.x release on `npm install` in CI.

### Security-sensitive packages using `^` (should be exact-pinned)

| Package | Current Pin | Assessment | Finding |
|---------|-------------|------------|---------|
| `@noble/ed25519` | `^3.1.0` | Device identity Ed25519 signing. Crypto libs should be exact-pinned to prevent supply-chain surprise upgrades. | deps-005 · med |
| `@noble/ciphers` | `^2.2.0` | Used for symmetric crypto. Same concern. | deps-005 · med |

### Exact-pinned third-party packages (good practice)

| Package | Pin |
|---------|-----|
| `@react-native-async-storage/async-storage` | `2.2.0` |
| `@react-native-masked-view/masked-view` | `0.3.2` |
| `@shopify/flash-list` | `2.0.2` |
| `react` | `19.2.0` |
| `react-native` | `0.83.4` |
| `react-native-reanimated` | `4.2.1` |
| `react-native-svg` | `15.15.3` |
| `react-native-worklets` | `0.7.2` |
| `react-test-renderer` | `19.2.0` |

### `overrides` section: `@expo/vector-icons` → `15.1.1`

**Reason (inferred):** Expo SDK 55 ships `@expo/vector-icons` 14.x in its transitive dependency tree, but the codebase requires 15.x APIs or fixes (e.g., `lucide-react-native` and `@expo/vector-icons` 15 use compatible icon naming). The override forces all consumers to resolve to `15.1.1`, preventing duplicate installs of 14.x and 15.x side by side. This is a standard hoisting/deduplication override for Expo ecosystem packages that lag behind in SDK's own lockfile.

---

## 4. License Compatibility Table

Command: `npx license-checker --summary --excludePrivatePackages`

### Summary by license

| License | Count | Verdict |
|---------|-------|---------|
| MIT | 773 | ✅ safe |
| ISC | 41 | ✅ safe |
| BSD-3-Clause | 23 | ✅ safe |
| BSD-2-Clause | 17 | ✅ safe |
| Apache-2.0 | 14 | ✅ safe |
| BlueOak-1.0.0 | 6 | ✅ safe (permissive) |
| CC0-1.0 | 3 | ✅ safe |
| Unlicense | 2 | ✅ safe |
| 0BSD | 2 | ✅ safe |
| (MIT OR CC0-1.0) | 2 | ✅ safe |
| (MIT OR Apache-2.0) | 1 | ✅ safe |
| MIT AND Apache-2.0 | 1 | ✅ safe |
| MPL-2.0 | 2 | ⚠️ review — see below |
| Python-2.0 | 1 | ⚠️ review — see below |
| CC-BY-4.0 | 1 | ⚠️ review — see below |
| (BSD-3-Clause OR GPL-2.0) | 1 | ⚠️ review — see below |
| Beerware | 1 | ⚠️ review — see below |

### Flagged packages detail

| Package | Version | License | Prod or Dev | Verdict | Finding |
|---------|---------|---------|-------------|---------|---------|
| `lightningcss` | 1.32.0 | MPL-2.0 | dev (Metro bundler) | ⚠️ review | deps-006 · low |
| `lightningcss-darwin-x64` | 1.32.0 | MPL-2.0 | dev (Metro bundler) | ⚠️ review | deps-006 · low |
| `argparse` | 2.0.1 | Python-2.0 | dev only (`@expo/xcpretty` → `@expo/cli`) | ✅ acceptable | — |
| `caniuse-lite` | 1.0.30001788 | CC-BY-4.0 | dev (Babel targets) | ✅ acceptable | — |
| `node-forge` | 1.4.0 | (BSD-3-Clause OR GPL-2.0) | dev/build (`expo-updates` → `@expo/code-signing-certificates`) | ✅ acceptable | — |
| `react-native-fit-image` | 1.5.5 | Beerware | prod (transitive via `@ronradtke/react-native-markdown-display`) | ⚠️ review | deps-007 · low |

**Notes:**
- **MPL-2.0 (`lightningcss`):** Mozilla Public License 2.0 is file-level weak copyleft. It is a build tool only — it does not run in the iOS app. No App Store issue. Review confirms acceptable; no action needed.
- **Python-2.0 (`argparse`):** Open Software License-style; used only in `@expo/xcpretty` (dev build tool, not bundled). Acceptable.
- **CC-BY-4.0 (`caniuse-lite`):** Data file for browser targets used only by Babel at build time. Not distributed with the app. Acceptable.
- **BSD-3-Clause OR GPL-2.0 (`node-forge`):** Dual-licensed; app uses BSD-3-Clause branch. Pull chain is build tooling only (`expo-updates` code-signing cert validation), not in app bundle at runtime. Acceptable.
- **Beerware (`react-native-fit-image`):** Informally permissive ("do what you like, buy me a beer"). Ships in the production bundle as a transitive dep of `@ronradtke/react-native-markdown-display`. Legally, Beerware is effectively public domain with attribution. No App Store compliance risk. Flagged for awareness.

---

## 5. Pod License Table

All pods resolved from `ios/Podfile.lock`. Expo-managed pods (all `Expo*`, `EX*`, React Native core pods) are MIT licensed. Third-party pods:

| Pod | Version | License | Verdict |
|-----|---------|---------|---------|
| `RevenueCat` | 5.68.0 | MIT | ✅ safe |
| `PurchasesHybridCommon` | 18.1.0 | MIT | ✅ safe |
| `RNPurchases` | 10.0.1 | MIT | ✅ safe |
| `SDWebImage` | ~5.21.0 | MIT | ✅ safe |
| `SDWebImageAVIFCoder` | ~0.11.0 | MIT | ✅ safe |
| `SDWebImageSVGCoder` | ~1.7.0 | MIT | ✅ safe |
| `SDWebImageWebPCoder` | ~0.14.6 | MIT | ✅ safe |
| `libavif` | (bundled) | BSD-2-Clause | ✅ safe |
| `libdav1d` | (bundled) | BSD-2-Clause | ✅ safe |
| `libwebp` | (bundled) | BSD-3-Clause | ✅ safe |
| `ReachabilitySwift` | (bundled) | MIT | ✅ safe |
| `hermes-engine` | (bundled) | MIT | ✅ safe |
| `RNCAsyncStorage` | (local) | MIT | ✅ safe |
| `RNCMaskedView` | (local) | MIT | ✅ safe |
| `RNGestureHandler` | (local) | MIT | ✅ safe |
| `RNReanimated` | (local) | MIT | ✅ safe |
| `RNScreens` | (local) | MIT | ✅ safe |
| `RNSVG` | (local) | MIT | ✅ safe |
| `RNWorklets` | (local) | MIT | ✅ safe |
| `ExpoPasteInput` | 1.0.0 | MIT (local module) | ✅ safe |
| `ExpoPinnedWebsocket` | 1.0.0 | MIT (local module) | ✅ safe |

**No proprietary or restrictive-licensed pods found.** RevenueCat iOS SDK is MIT (confirmed). All SDWebImage family are MIT.

---

## 6. Expo SDK 55 Compatibility

### Core runtime versions

| Package | Installed | Expected for SDK 55 | Status |
|---------|-----------|---------------------|--------|
| `expo` | 55.0.15 | 55.x | ✅ |
| `react-native` | 0.83.4 | 0.83.x | ✅ |
| `react` | 19.2.0 | 19.x | ✅ |
| `react-native-reanimated` | 4.2.1 | 4.x (required for RN 0.83) | ✅ |
| `react-native-gesture-handler` | 2.30.1 | ~2.30.0 | ✅ |
| `react-native-screens` | 4.23.0 | ~4.23.0 | ✅ |
| `react-native-safe-area-context` | 5.6.2 | ~5.6.0 | ✅ |

### Audited packages

| Package | Installed | Assessment |
|---------|-----------|------------|
| `react-native-reanimated 4.2.1` | 4.2.1 | ✅ SDK 55 ships with Reanimated 4.x. RN 0.83 requires Reanimated 4. 4.2.1 is compatible; latest is 4.3.1 (minor improvement, not breaking). |
| `react-native-gesture-handler ~2.30.0` | 2.30.1 | ✅ SDK 55 compatible. Latest 2.31.2 is a minor release. |
| `@shopify/flash-list 2.0.2` | 2.0.2 | ✅ SDK 55 compatible. Latest 2.3.1 adds minor improvements. Exact pin is intentional. |
| `jest-expo ~55.0.16` | 55.0.16 | ✅ SDK 55 range. |

**No SDK 53/54-only packages detected.** All `expo-*` packages are on `55.x` versions.

---

## 7. Unused / Redundant Dependencies

### `punycode ^2.3.1` — declared as prod dep, used only in test chain

- **Usage in `src/`:** None found (`grep` returned no results in `src/**/*.ts` / `src/**/*.tsx`)
- **Why it's a dep:** `punycode` is a polyfill for the deprecated Node.js built-in `punycode` module. It is required transitively by `jest-expo` → `jest-environment-jsdom` → `jsdom` → `tough-cookie` → `psl` and `tr46`.
- **Problem:** It is declared as a top-level `dependencies` entry, but its only consumer is the test environment. It should be in `devDependencies`.
- **Finding:** deps-008 · nit

### `react-syntax-highlighter ^16.1.1` — used in `src/components/chat/CodeBlock.tsx`

Confirmed used. Not redundant.

### `simple-icons ^16.17.0` — used in `src/components/common/ProviderIcon.tsx`

Confirmed used. Not redundant.

### `@ronradtke/react-native-markdown-display ^8.1.0` — brings in `react-native-fit-image`

The `react-native-fit-image` transitive dep is brought in unconditionally by `@ronradtke/react-native-markdown-display`. It is a real prod dep but has a Beerware license (noted in §4) and is a relatively inactive package (last updated 2019). Not technically redundant.

---

## 8. Auto-Fixes Applied

**None.** This audit is report-only. No `npm audit fix`, no package.json changes, no source edits were made.

---

## 9. Test Impact

**None.** No fixes applied; no tests were run or affected by this audit.

---

## Finding Index

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| deps-001 | `markdown-it` ReDoS (GHSA-38c4-r59v-3vqw) in prod dep `@ronradtke/react-native-markdown-display`; no upstream fix available | med | deferred (awaiting upstream) |
| deps-002 | `postcss <8.5.10` XSS (GHSA-qx2v-qp2m-jg93) in Expo build toolchain; not in app bundle | low | deferred (Expo upstream owns) |
| deps-003 | `@tootallnate/once` control-flow vuln in `jest-expo` dev chain; no prod exposure | low | deferred (dev-only) |
| deps-004 | `expo`, `expo-apple-authentication`, `expo-auth-session`, `expo-localization` use `^` instead of `~` | nit | proposed |
| deps-005 | `@noble/ed25519` and `@noble/ciphers` use `^` — crypto identity libs should be exact-pinned | med | proposed |
| deps-006 | `lightningcss` MPL-2.0 — build-tool only, review confirms acceptable | low | wontfix (acceptable) |
| deps-007 | `react-native-fit-image` Beerware license as transitive prod dep — permissive in practice | low | wontfix (acceptable) |
| deps-008 | `punycode` declared in `dependencies` instead of `devDependencies` | nit | proposed |
| deps-009 | `@react-native-async-storage/async-storage` 1 major behind (2.x → 3.x); exact-pinned intentionally | low | deferred |

**Severity totals: C:0 / H:0 / M:2 / L:4 / N:3**
