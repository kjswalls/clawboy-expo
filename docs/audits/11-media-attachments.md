# Audit Plan: Media & Attachments

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/11-media-attachments-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/lib/media/**
src/lib/attachments/**
src/components/chat/MediaEmbed.tsx
src/components/chat/VideoEmbed.tsx
src/components/chat/FileAttachmentCard.tsx
src/components/chat/AgentFileViewerModal.tsx
src/components/chat/MediaFallbackCard.tsx
src/hooks/useAuthedMedia.ts
src/lib/media/__tests__/**
src/lib/attachments/__tests__/**
src/hooks/__tests__/ (media-related files)
```

## 2. Out of Scope

- `src/lib/voice/` — covered in plan 10
- All other files not listed
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **Security** rules 1, 3; **v0 → Expo** image mapping (`expo-image`)
2. `docs/plans/fix-video-gateway-media-and-cache.md` (if present)
3. `docs/plans/gateway-media-local-roots.md` (if present)
4. `docs/plans/gateway-range-support.md` (if present)
5. `docs/audits/_CHECKLIST.md`
6. `docs/audits/_RULES.md`

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] `gatewayMedia.ts`: URL construction for gateway media is correct for all path formats (absolute, relative, with/without auth token)
- [ ] `useAuthedMedia`: auth header injected correctly; handles token refresh if session expires mid-download
- [ ] `downloadMedia.ts`: download progress reported, errors surfaced, partial downloads cleaned up
- [ ] `diagnoseMediaFailure.ts`: failure diagnosis covers network errors, auth errors, and missing files
- [ ] `deriveFallbackName.ts` / `guessMediaPath.ts`: fallback logic produces reasonable names, no crashes on unexpected input
- [ ] `mediaActions.ts`: share / save-to-library actions request correct permissions before acting
- [ ] `VideoEmbed.tsx`: video player does not auto-play with sound (iOS default behavior)
- [ ] `AgentFileViewerModal`: handles large files gracefully (pagination or virtual scroll), does not load entire file into memory
- [ ] `persistPastedImages.ts`: pasted images persisted to temp location before upload, cleaned up after send
- [ ] `prepareChatAttachments.ts`: file size limits checked before upload; oversized files surface error

### Security (area-specific)

- [ ] Media URLs from gateway are from expected origins — no open URL redirect through the media proxy
- [ ] `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription` set in `app.json` (flag here; detailed check in plan 22)
- [ ] Pasted image data not logged
- [ ] `mediaActions.ts` save-to-library: requests `expo-media-library` write permission at point of use, not at startup
- [ ] Downloaded media stored in app's sandboxed temp directory — not accessible to other apps

### Performance (area-specific)

- [ ] `expo-image` used for all image rendering (not `<Image>` from `react-native`) — enables progressive loading and memory management
- [ ] `MediaEmbed` does not re-fetch on every re-render — URL and headers are stable references
- [ ] Large file downloads happen on background thread (Expo FileSystem handles this — verify not blocked on JS thread)
- [ ] Attachment previews in `InputBarAttachmentPreviews`: thumbnail generation does not block input

### Cleanliness / Maintainability (area-specific)

- [ ] `gatewayMedia.ts` is the single place gateway media URL construction lives — no ad-hoc URL construction in components
- [ ] `AgentFileViewerModal.tsx` under ~300 lines; flag if not

### Tests (area-specific)

- [ ] `deriveFallbackName` / `guessMediaPath` have unit tests
- [ ] `prepareChatAttachments` file size check has a unit test

### OSS-Readiness (area-specific)

- [ ] No hard-coded media server hostnames beyond the gateway URL pattern
- [ ] No developer's personal file paths in any default or test constant

### i18n / Accessibility (area-specific)

- [ ] `MediaEmbed` has `accessibilityLabel` describing the media
- [ ] "Save to library" / "Share" buttons have `accessibilityLabel`
- [ ] Video player controls have `accessibilityLabel`

## 5. Deliverable

Write output to: `docs/audits/findings/11-media-attachments-findings.md`

Finding IDs: `media-NNN`.

## 6. Exit Criteria

- [ ] `docs/audits/findings/11-media-attachments-findings.md` written
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test --selectProjects logic` passes
- [ ] Row 11 in `docs/audits/README.md` flipped to `done`
