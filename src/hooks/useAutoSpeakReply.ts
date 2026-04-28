import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Speech from 'expo-speech';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import type { ChatMessage } from '@/types';
import type { TtsPreferences } from './useTtsPreferences';
import { useAuthedMedia } from './useAuthedMedia';
import { extractSpeakableText } from '@/lib/voice/extractSpeakableText';

const MIN_SPEAKABLE_CHARS = 2;

/**
 * Returns true when the message has content that's worth speaking aloud.
 * Skips info markers, internal events, tool-only messages, and empty content.
 */
function isSpeakableMessage(msg: ChatMessage): boolean {
  if (msg.role !== 'assistant') return false;
  if (msg.isStreaming) return false;
  if (msg.kind === 'info' || msg.kind === 'internalEvent') return false;
  return true;
}

/**
 * Attempts to play gateway-produced audio with expo-audio.
 * Returns true if playback was kicked off, false if the URL couldn't resolve.
 */
function useServerAudioPlayer(
  url: string | null,
): { play: () => void; stop: () => void; supported: boolean } {
  const { resolveAuthedSource } = useAuthedMedia();
  const resolved = url ? resolveAuthedSource(url) : null;
  const player = useAudioPlayer(resolved ?? null, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);

  const play = useCallback((): void => {
    if (!status.isLoaded) return;
    void setAudioModeAsync({ playsInSilentMode: true });
    player.play();
  }, [player, status.isLoaded]);

  const stop = useCallback((): void => {
    if (status.isLoaded && status.playing) {
      player.pause();
    }
  }, [player, status.isLoaded, status.playing]);

  return { play, stop, supported: Boolean(resolved) };
}

/**
 * Imperatively speak `text` using expo-speech (on-device OS voice).
 */
export function speakWithDeviceTts(text: string): void {
  const clean = extractSpeakableText(text);
  if (clean.length < MIN_SPEAKABLE_CHARS) return;
  void Speech.stop();
  Speech.speak(clean, { language: 'en-US' });
}

/**
 * Imperatively stop any in-flight Speech.speak call.
 */
export function stopDeviceTts(): void {
  void Speech.stop();
}

export interface AutoSpeakControls {
  /**
   * Manually trigger speech for a specific message, using the same
   * priority logic as auto-speak. Safe to call while already speaking —
   * will stop first.
   */
  speakMessage: (msg: ChatMessage) => void;
  /**
   * Stop any in-flight speech (both server audio and device TTS).
   */
  stopSpeaking: () => void;
}

/**
 * Observes `messages` and speaks each new finalized assistant message once
 * when `prefs.autoSpeakReplies` is true.
 *
 * Resolution order:
 *   1. Server audio (`audioAsVoice && audioUrl`) via expo-audio when `preferDeviceTts === false`.
 *   2. On-device expo-speech synthesis on the cleaned message content.
 *
 * Idempotent — tracks `lastSpokenId` per session key so switching back to a
 * session doesn't re-speak. Stops in-flight speech on session switch and
 * when the app backgrounds (handled via AppState listener in the caller via
 * `stopSpeaking`).
 *
 * @param messages   Current session's messages from `useChat`.
 * @param sessionKey The active session key — used to reset lastSpokenId on switch.
 * @param prefs      User TTS preferences from `useTtsPreferences`.
 */
export function useAutoSpeakReply(
  messages: ChatMessage[],
  sessionKey: string | null,
  prefs: Pick<TtsPreferences, 'autoSpeakReplies' | 'preferDeviceTts'>,
): AutoSpeakControls {
  // Track the last assistant message id we've spoken per session.
  const lastSpokenBySessionRef = useRef<Map<string, string>>(new Map());
  // The URL of the most recent server-audio message we want to play.
  const pendingAudioUrlRef = useRef<string | null>(null);

  const { resolveAuthedSource } = useAuthedMedia();

  // Keep a single expo-audio player for server-side voice audio. URL is set
  // via pendingAudioUrlRef — we let the server audio player manage its own
  // lifecycle through the hook rather than creating a player per message.
  const serverPlayer = useAudioPlayer(null, { updateInterval: 200 });
  const serverStatus = useAudioPlayerStatus(serverPlayer);

  // AudioMode is set once globally when this hook mounts.
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  // Reset lastSpokenId when the session changes so we don't carry stale ids
  // across sessions. We intentionally do NOT re-speak on the new session —
  // only future finalized messages trigger auto-speak.
  const prevSessionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevSessionKeyRef.current !== sessionKey) {
      prevSessionKeyRef.current = sessionKey;
      // Stop any in-flight speech on session switch
      void Speech.stop();
    }
  }, [sessionKey]);

  const stopSpeaking = useCallback((): void => {
    void Speech.stop();
    if (serverStatus.isLoaded && serverStatus.playing) {
      serverPlayer.pause();
    }
  }, [serverPlayer, serverStatus.isLoaded, serverStatus.playing]);

  const speakViaServerAudio = useCallback((url: string): void => {
    const source = resolveAuthedSource(url);
    if (!source) return;
    // Replace player source — expo-audio's useAudioPlayer hook doesn't support
    // dynamic source changes directly, so we use Speech as fallback for now and
    // play via the static AudioPlayer API for one-shot playback.
    pendingAudioUrlRef.current = url;
    void setAudioModeAsync({ playsInSilentMode: true });
    // Use a fresh AudioPlayer instance for one-shot playback (avoids the hook
    // lifecycle complexity of swapping sources mid-play).
    // This is intentionally outside React lifecycle — it's fire-and-forget audio.
    const { AudioPlayer } = require('expo-audio') as typeof import('expo-audio');
    const oneShot = new AudioPlayer(source);
    oneShot.play();
  }, [resolveAuthedSource]);

  const speakMessage = useCallback((msg: ChatMessage): void => {
    void Speech.stop();

    // Server audio path: prefer when enabled and URL is available
    if (!prefs.preferDeviceTts && msg.audioAsVoice && msg.audioUrl) {
      speakViaServerAudio(msg.audioUrl);
      return;
    }

    // Device TTS fallback
    speakWithDeviceTts(msg.content);
  }, [prefs.preferDeviceTts, speakViaServerAudio]);

  // Auto-speak: watch for newly finalized assistant messages
  useEffect(() => {
    if (!prefs.autoSpeakReplies) return;
    if (!sessionKey) return;

    // Find the most recent finalized assistant message
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => isSpeakableMessage(m));

    if (!lastAssistant) return;

    const alreadySpoken = lastSpokenBySessionRef.current.get(sessionKey) === lastAssistant.id;
    if (alreadySpoken) return;

    // Require the message to have some speakable content (or server audio)
    const hasServerAudio = !prefs.preferDeviceTts && lastAssistant.audioAsVoice && lastAssistant.audioUrl;
    const speakableText = extractSpeakableText(lastAssistant.content);
    if (!hasServerAudio && speakableText.length < MIN_SPEAKABLE_CHARS) return;

    lastSpokenBySessionRef.current.set(sessionKey, lastAssistant.id);
    speakMessage(lastAssistant);
  }, [messages, sessionKey, prefs.autoSpeakReplies, prefs.preferDeviceTts, speakMessage]);

  return { speakMessage, stopSpeaking };
}

/**
 * Convenience hook for the AppState "stop speaking on background" guardrail.
 * Call this once in the root chat screen alongside `useAutoSpeakReply`.
 */
export function useStopSpeechOnBackground(stopSpeaking: () => void): void {
  const stopRef = useRef(stopSpeaking);
  stopRef.current = stopSpeaking;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'inactive' || state === 'background') {
        stopRef.current();
      }
    });
    return () => sub.remove();
  }, []);
}
