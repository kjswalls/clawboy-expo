# Releasing ClawBoy

This document describes how to decide on version numbers, when to ship an OTA update vs a store build, and the step-by-step release workflow.

---

## Version number rules (semver)

ClawBoy follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): `MAJOR.MINOR.PATCH`.

| Type | When to use | Example |
|------|-------------|---------|
| **PATCH** | Bug fix, perf improvement, copy change, internal refactor. No new user-visible feature. | `1.0.0 → 1.0.1` |
| **MINOR** | New screen, new setting, new user-visible feature. Additive. No breaking change. | `1.0.0 → 1.1.0` |
| **MAJOR** | Breaking: chat-cache schema reset requiring data migration, forced re-pair, removed feature, gateway protocol incompatibility, minimum OS version bump. | `1.0.0 → 2.0.0` |

A version bump always means a **store build**. OTA-only fixes do not get a version bump — they accumulate under `## [Unreleased]` until the next store release.

**Same-version ship train:** While `main` is still shipping one store version (for example **v0.9.0** before the next semver bump), add bullets under that version's `## [0.9.0] - …` heading — not a separate “post-0.9” narrative. Reserve `## [Unreleased]` for work that already targets the *next* semver after you cut the line.

---

## OTA update vs. store build

`app.json` uses `runtimeVersion.policy: "appVersion"`. This means **OTA bundles only reach devices running the exact same `version`**. Bumping the version in a store build cuts off OTA delivery to old installs until they update. Keep this in mind.

### Decision tree

```
Is your diff touching any of:
  - app.json (plugins / permissions / icon / runtimeVersion / scheme)
  - modules/ (native Expo modules)
  - ios/ or android/ directories
  - Expo SDK version bump
  - A natively loaded asset (app icon, splash screen)
  └─ YES → Store build required (see Store release workflow below)
  └─ NO, JS/TS only in src/ or app/
        └─ OTA-eligible (see OTA workflow below)
```

### OTA workflow (no version bump)

1. Make your JS/TS changes in `src/` or `app/`.
2. Add a changelog bullet under `## [Unreleased]` **or**, while still on the same store version as `main`, under that version's heading (for example `## [0.9.0] - …`).
3. Run `npm run sync-changelog` and commit.
4. Ship:
   ```sh
   eas update --channel production --message "short description"
   ```

### Store release workflow (with version bump)

1. Make sure `## [Unreleased]` in `CHANGELOG.md` has at least one bullet describing the changes.
2. Run the release script, choosing the right bump type:
   ```sh
   npm run release:patch   # or :minor or :major
   ```
   This will:
   - Bump `app.json` and `package.json` to the next version.
   - Move `[Unreleased]` content into a dated section in `CHANGELOG.md`.
   - Regenerate `src/constants/changelog.ts`.
   - Regenerate `docs/legal/open-source-licenses.md` (direct runtime deps + license texts).
   - Print the git commands to use next.
3. Upload the regenerated licenses file to the website:
   ```sh
   # Upload docs/legal/open-source-licenses.md to:
   # https://sundaysoftworks.com/clawboy/licenses
   ```
   The in-app "Open Source Licenses" link in Settings → About points to this URL.
4. Commit and tag:
   ```sh
   git add -A
   git commit -m "chore(release): v<version>"
   git tag v<version>
   git push && git push --tags
   ```
5. Build and submit:
   ```sh
   eas build --profile production --platform all
   eas submit --platform ios
   ```

---

## Changelog workflow

Notable changes go in `CHANGELOG.md`.

- **While shipping a single store version from `main`:** add bullets under that version's heading (for example `## [0.9.0] - …`) using Keep a Changelog sections (`### Added`, `### Changed`, `### Fixed`, `### Removed`, `### Security`).
- **After the next semver is live and you are accumulating toward the following store release:** add bullets under `## [Unreleased]` until you run `npm run release:*`, which promotes them into a new dated section.
- **Add bullets as you work**, not in a batch at release time. That way the diff stays readable.
- `src/constants/changelog.ts` is generated from `CHANGELOG.md` — **never edit it by hand**.
- After editing `CHANGELOG.md`, run `npm run sync-changelog` to regenerate.

The `npm test` (`pretest`) step runs two guards automatically:

| Guard | What it checks |
|-------|---------------|
| `check-versions-synced` | `app.json expo.version` matches `package.json version` |
| `check-changelog-synced` | `src/constants/changelog.ts` is in sync with `CHANGELOG.md` |

If either guard fails, fix it before committing.

---

## TestFlight and pre-launch conventions

While the app is in **TestFlight** or otherwise shipping a **fixed semver line** from `main` (for example **v0.9.0** before the next bump):

- The store-facing `version` in `app.json` is that line (for example `0.9.0`).
- Cumulative notes for that train go under the matching dated heading in `CHANGELOG.md` (for example `## [0.9.0] - …`). Keep `## [Unreleased]` as the empty placeholder until work explicitly targets the **next** semver (see **Changelog workflow** above).
- Builds are also identified by **build number** (EAS / App Store Connect).
- When you cut the next store version, run `npm run release:*` so `[Unreleased]` content (once you add it) becomes a new dated section and versions bump.

After the first **1.0.0** (or your chosen “GA”) store release, the same semver rules apply: every new store build gets a version bump via `npm run release`.

---

## Source of truth

All version-related files and their roles:

| File | Role |
|------|------|
| `app.json` `expo.version` | **Primary source of truth.** Read at runtime by `APP_VERSION` in `src/lib/appMeta.ts`. Shown in Settings footer and About screen. |
| `package.json` `version` | Must always match `app.json`. Updated by `npm run release`. |
| `CHANGELOG.md` | Human-edited release notes. During a same-version train, bullets live under that version's heading; `[Unreleased]` is promoted to a new dated section by `npm run release`. |
| `src/constants/changelog.ts` | Generated from `CHANGELOG.md`. Never edit by hand. Provides `CHANGELOG_ENTRIES` to the in-app About screen. |
| `scripts/release.mjs` | Bumps both JSON files, updates `CHANGELOG.md`, runs `sync-changelog` and `generate-licenses`. |
| `scripts/sync-changelog.mjs` | Parses `CHANGELOG.md` and rewrites `changelog.ts`. |
| `scripts/generate-licenses.mjs` | Walks `package.json` runtime deps, reads `node_modules/*/LICENSE` files, and rewrites `docs/legal/open-source-licenses.md`. Run via `npm run generate-licenses` or automatically on release. |
| `docs/legal/open-source-licenses.md` | Generated OSS attribution file. Upload to `sundaysoftworks.com/clawboy/licenses` after each release. Never edit by hand. |
| `scripts/check-versions-synced.mjs` | Guard: verifies version parity between `app.json` and `package.json`. |
| `scripts/check-changelog-synced.mjs` | Guard: verifies `changelog.ts` matches what `sync-changelog` would generate. |
