# Audit Plan: Voice & TTS

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/10-voice-tts-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/lib/voice/**
src/hooks/useServerTts.ts
src/hooks/useTtsPreferences.ts
src/hooks/useAutoSpeakReply.ts
src/hooks/effectivePreferDeviceTts.ts
app/settings/voice.tsx
src/lib/voice/__tests__/**
src/hooks/__tests__/ (voice/TTS-related files)
```

## 2. Out of Scope

- `src/components/chat/AudioPlayingPill.tsx` — include if it has logic; exclude if purely presentational
- All other files not listed
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **Tech Stack** (expo-speech, expo-audio, expo-speech-recognition); **Security** rule 1 (no logging)
2. `docs/audits/_CHECKLIST.md`
3. `docs/audits/_RULES.md`

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] `applyAudioPolicy.ts`: audio session configured correctly for iOS (category, mode, options) before playback begins
- [ ] TTS stops cleanly when: user navigates away, session switches, new message starts streaming
- [ ] `useAutoSpeakReply`: does not auto-speak if app is in background; does not double-speak if stream produces multiple chunks
- [ ] `extractSpeakableText.ts`: strips markdown, code blocks, and tool call output correctly — only natural-language portions spoken
- [ ] `transcribeAudio.ts`: handles mic permission denied gracefully (no crash, clear error state)
- [ ] `effectivePreferDeviceTts.ts`: logic correctly resolves preference given server TTS availability and user setting
- [ ] Server TTS error: falls back to device TTS or silence (not a crash)
- [ ] `modelAudioSupport.ts`: audio capability list is accurate and does not hard-code stale model names

### Security (area-specific)

- [ ] Microphone permission prompt: `NSSpeechRecognitionUsageDescription` and `NSMicrophoneUsageDescription` are set in `app.json` / iOS Info.plist (flag if missing — detailed check in plan 22)
- [ ] Audio recordings (transcription input) not persisted to disk unless explicitly intended
- [ ] TTS output not logged

### Performance (area-specific)

- [ ] `useAutoSpeakReply` does not trigger on every stream chunk — debounced or triggered on stream end
- [ ] Server TTS: audio data streamed, not buffered in full before playback starts (check if streaming playback is supported)
- [ ] `extractSpeakableText` does not run synchronously on every render

### Cleanliness / Maintainability (area-specific)

- [ ] `useServerTts` and `useTtsPreferences` are separate concerns — no interleaving
- [ ] Audio session policy logic is in `applyAudioPolicy.ts`, not scattered across hooks

### Tests (area-specific)

- [ ] `extractSpeakableText` has unit tests for markdown, code blocks, tool call output
- [ ] `effectivePreferDeviceTts` has unit tests for all preference combinations

### OSS-Readiness (area-specific)

- [ ] No private TTS API keys or provider-specific endpoints hard-coded
- [ ] No developer's voice preference hard-coded as default

### i18n / Accessibility (area-specific)

- [ ] Voice settings screen all labels use `t()` keys
- [ ] TTS playback button has `accessibilityLabel` reflecting play/stop state

## 5. Deliverable

Write output to: `docs/audits/findings/10-voice-tts-findings.md`

Finding IDs: `voice-NNN`.

## 6. Exit Criteria

- [ ] `docs/audits/findings/10-voice-tts-findings.md` written
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test --selectProjects logic` passes
- [ ] Row 10 in `docs/audits/README.md` flipped to `done`
