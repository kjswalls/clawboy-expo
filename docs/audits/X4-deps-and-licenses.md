# Cross-Cutting Plan: Dependencies & Licenses

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/X4-deps-and-licenses-findings.md`.
> Do NOT upgrade or add dependencies — report only.
> Do NOT modify this plan file.

**Run after:** All per-area plans 01–23 are `done`.

---

## 1. Scope

```
package.json
package-lock.json
ios/Podfile.lock (READ ONLY)
```

Analysis of transitive dependencies from npm and CocoaPods.

## 2. Out of Scope

- `node_modules/` contents (use CLI tools only)
- All source files
- `docs/audits/`

## 3. Required Reading

1. `.cursorrules` — **Tech Stack** section (Expo SDK 55, React 19, RN 0.83)
2. `docs/audits/_RULES.md`

## 4. Dependency Checks

### Security Audit

- [ ] Run `npm audit` — record output
- [ ] Classify findings: critical/high vulnerabilities must be flagged; dev-only vulnerabilities noted separately
- [ ] Note: do NOT run `npm audit fix` — report only, human decides on upgrades

### Outdated Packages

- [ ] Run `npm outdated` — list packages with newer versions available
- [ ] Flag: any package more than 2 major versions behind
- [ ] Flag: Expo SDK packages that are not pinned to SDK 55 range
- [ ] Flag: `react-native` not on expected version for Expo SDK 55

### Version Pinning Discipline

- [ ] `package.json` `dependencies`: distinguish between caret (`^`), tilde (`~`), and exact pins
- [ ] Expo-managed packages should use `~` (patch-only) — flag any using `^` or exact
- [ ] Third-party non-Expo packages: assess whether `^` is appropriate or if exact pinning is safer for a production app
- [ ] `overrides` section: document why `@expo/vector-icons` is overridden to `15.1.1`

### License Scan

- [ ] Run `npx license-checker --summary --excludePrivatePackages` (or `npx license-checker --csv`)
- [ ] Flag licenses incompatible with OSS release:
  - [ ] GPL (v2, v3) — copyleft, may require entire app to be GPL
  - [ ] AGPL — copyleft, stricter
  - [ ] Proprietary / Commercial — may require purchase for distribution
  - [ ] LGPL — usually OK but flag for review
  - [ ] Creative Commons (non-commercial variants) — flag
- [ ] List all MIT, Apache-2.0, BSD, ISC packages (typically safe)
- [ ] Flag any package with no license field

### Native Pod Licenses

- [ ] Parse `ios/Podfile.lock` — list all pods and their versions
- [ ] For any non-standard pods: note license source
- [ ] Flag any pods that are proprietary or have restrictive licenses

### Expo SDK 55 Compatibility

- [ ] All `expo-*` packages are compatible with Expo SDK 55 — flag any that are SDK 53/54 only
- [ ] `react-native-reanimated` version `4.2.1` — verify it is the correct version for SDK 55 + RN 0.83
- [ ] `react-native-gesture-handler ~2.30.0` — verify SDK 55 compatibility
- [ ] `@shopify/flash-list 2.0.2` — verify SDK 55 compatibility

### Unused / Redundant Dependencies

- [ ] Look for packages that appear in `dependencies` but are never imported in source: `rg "import.*from 'punycode'" src/` — verify each declared dep is actually used
- [ ] `punycode`: included as direct dep (it is deprecated in Node.js built-ins) — document why

## 5. Deliverable

Write output to: `docs/audits/findings/X4-deps-and-licenses-findings.md`

Finding IDs: `deps-NNN`.

Include:
- `npm audit` summary table (severity | count | packages)
- `npm outdated` table (package | current | wanted | latest | type)
- License compatibility table (package | license | verdict)
- Pod license table
- Version pinning assessment

## 6. Exit Criteria

- [ ] `docs/audits/findings/X4-deps-and-licenses-findings.md` written
- [ ] `npm audit` run and results recorded
- [ ] `npm outdated` run and results recorded
- [ ] License scan run and results recorded
- [ ] No dependency changes made
- [ ] Row X4 in `docs/audits/README.md` flipped to `done`
