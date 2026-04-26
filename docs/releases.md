# ClawBoy — Release Process

This document covers the end-to-end workflow for releasing ClawBoy, both as an
OTA JS update and as a full native binary submission.

---

## Version axes

| Axis | Where | Purpose |
|---|---|---|
| `version` in `app.json` + `package.json` | User-facing semver (`1.2.3`) | Shown in App Store, Settings → About |
| `ios.buildNumber` / `android.versionCode` | Auto-incremented by EAS | Required to be monotonically increasing per binary App Store submission |
| `runtimeVersion` | Derived from `version` via `"policy": "appVersion"` | Scopes which OTA bundles are compatible with which binary |

---

## OTA (JS-only) release — most releases

Use this path for bug fixes and feature work that does **not** touch native
code or config. OTA bundles reach users silently on next app launch, or
immediately if marked critical.

**Is my change OTA-safe?** Run `npx expo prebuild --clean` and check whether
any files in `ios/` or `android/` changed. If yes → you need a native build.

### Steps

```bash
# 1. Update CHANGELOG.md — rename [Unreleased] → [x.y.z] and add release date
# 2. Sync the in-app changelog constant
npm run sync-changelog

# 3. Bump version in both files (keep them in sync)
#    Edit app.json → "version": "1.2.4"
#    Edit package.json → "version": "1.2.4"

# 4. Commit and tag
git add CHANGELOG.md src/constants/changelog.ts app.json package.json
git commit -m "release: v1.2.4"
git tag v1.2.4

# 5. Publish the OTA update
#    Standard release:
eas update --branch production --message "v1.2.4: <one-line summary>"

#    Critical security release (forces a blocking restart in-app):
eas update --branch production --message "v1.2.4: security fix" \
  --private-key-path certs/private-key.pem \
  --extra '{"critical":true,"reason":"<brief description>"}'
```

> **Note on code signing**: always pass `--private-key-path certs/private-key.pem`
> when publishing to production. The `certs/certificate.pem` must already be
> embedded in the binary (built with it in `app.json`). In CI, write the
> private key from the `EXPO_PRIVATE_KEY_PEM` secret before running `eas update`.

---

## Native binary release — SDK upgrades, new plugins, permission changes

Any change that requires `npx expo prebuild` to regenerate native files needs
a new binary through the App Store / TestFlight pipeline.

### Steps

```bash
# 1–4 same as above (bump CHANGELOG, sync, bump version, commit + tag)
#    Use a minor or major bump for native releases (e.g. 1.3.0)

# 5. Build the binary (EAS auto-increments buildNumber)
eas build -p ios --profile production

# 6. Submit to App Store Connect
eas submit -p ios --latest

# 7. Copy the matching CHANGELOG section into App Store Connect "What's New"
#    (paste the content under ## [1.3.0] as plain text — no markdown)

# 8. After the binary passes review and goes live, future JS patches can
#    OTA against the new 1.3.x runtime without a rebuild.
```

---

## Preview / internal testing channel

```bash
# Build a preview binary (internal TestFlight distribution)
eas build -p ios --profile preview

# Push an OTA update to the preview channel for internal testing
eas update --branch preview --message "preview: <description>"
```

---

## Code signing setup (first time)

Run once when bootstrapping the project or rotating keys:

```bash
bash scripts/generate-update-cert.sh
```

This produces:
- `certs/private-key.pem` — **never commit**; add to CI as `EXPO_PRIVATE_KEY_PEM`
- `certs/certificate.pem` — safe to commit; referenced in `app.json`

After generating a new certificate, rebuild the native binary (EAS build) so
the cert is embedded. Existing binaries will not verify updates signed with
the new key.

---

## Marking an update critical

Set `critical: true` in the `--extra` JSON flag when running `eas update`:

```bash
eas update --branch production \
  --message "v1.2.4: patch CVE-xxxx-yyyy" \
  --extra '{"critical":true,"reason":"token-storage-vulnerability-fix"}'
```

On launch, the app downloads the update, reads `manifest.extra.critical`, and
shows a blocking "Security update required — restart now" modal. The user
cannot dismiss it; the app restarts immediately.

Non-critical updates download silently and apply on the next cold start.

---

## Checklist before every release

- [ ] `CHANGELOG.md` updated and `[Unreleased]` renamed to `[x.y.z] - YYYY-MM-DD`
- [ ] `npm run sync-changelog` run and `src/constants/changelog.ts` committed
- [ ] `version` bumped in **both** `app.json` and `package.json`
- [ ] `git tag vX.Y.Z` created
- [ ] OTA: `eas update --branch production` with `--private-key-path` for signed builds
- [ ] Native: App Store Connect "What's New" filled from CHANGELOG section
