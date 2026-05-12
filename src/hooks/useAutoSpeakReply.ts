import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import type { ChatMessage } from '@/types';
import type { TtsPreferences } from './useTtsPreferences';
import { useAuthedMedia } from './useAuthedMedia';
import { extractSpeakableText } from '@/lib/voice/extractSpeakableText';
import i18n from '@/i18n';

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
 * Imperatively speak `text` using expo-speech (on-device OS voice).
 */
export function speakWithDeviceTts(text: string): void {
  const clean = extractSpeakableText(text);
  if (clean.length < MIN_SPEAKABLE_CHARS) return;
  void Speech.stop();
  Speech.speak(clean, { language: i18n.language });
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
  /**
   * True while audio is actively being spoken (device TTS or server audio).
   * Resets to false when speech ends naturally or stopSpeaking is called.
   */
  isSpeaking: boolean;
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
 * @remarks Must be paired with `useStopSpeechOnBackground` in the chat screen
 * to stop speech when the app is backgrounded. The auto-speak effect also
 * guards on `AppState.currentState === 'active'` at trigger time, but the
 * companion hook handles mid-speech backgrounding.
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

  const [isSpeaking, setIsSpeaking] = useState(false);

  const { resolveAuthedSource } = useAuthedMedia();

  // Tracks the active one-shot server audio player so stopSpeaking can stop it.
  const activeShotPlayerRef = useRef<AudioPlayer | null>(null);
  // Tracks the playbackStatusUpdate subscription for the active player.
  const activeShotSubRef = useRef<{ remove: () => void } | null>(null);

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
      // Stop any in-flight speech (device TTS and server audio) on session switch.
      void Speech.stop();
      if (activeShotSubRef.current) {
        activeShotSubRef.current.remove();
        activeShotSubRef.current = null;
      }
      if (activeShotPlayerRef.current) {
        activeShotPlayerRef.current.release();
        activeShotPlayerRef.current = null;
      }
    }
  }, [sessionKey]);

  // Release native audio resources on unmount.
  useEffect(() => {
    return () => {
      activeShotSubRef.current?.remove();
      activeShotSubRef.current = null;
      activeShotPlayerRef.current?.release();
      activeShotPlayerRef.current = null;
    };
  }, []);

  const stopSpeaking = useCallback((): void => {
    void Speech.stop();
    if (activeShotSubRef.current) {
      activeShotSubRef.current.remove();
      activeShotSubRef.current = null;
    }
    if (activeShotPlayerRef.current) {
      activeShotPlayerRef.current.release();
      activeShotPlayerRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const speakViaServerAudio = useCallback((url: string): void => {
    const source = resolveAuthedSource(url);
    if (!source) return;
    pendingAudioUrlRef.current = url;
    void setAudioModeAsync({ playsInSilentMode: true });
    // Release any in-flight one-shot player before starting a new one.
    if (activeShotSubRef.current) {
      activeShotSubRef.current.remove();
      activeShotSubRef.current = null;
    }
    if (activeShotPlayerRef.current) {
      activeShotPlayerRef.current.release();
      activeShotPlayerRef.current = null;
    }
    const oneShot = createAudioPlayer(source);
    activeShotPlayerRef.current = oneShot;
    setIsSpeaking(true);
    oneShot.play();
    const sub = oneShot.addListener('playbackStatusUpdate', (status: { didJustFinish?: boolean }) => {
      if (status.didJustFinish) {
        sub.remove();
        activeShotSubRef.current = null;
        activeShotPlayerRef.current = null;
        setIsSpeaking(false);
      }
    });
    activeShotSubRef.current = sub;
  }, [resolveAuthedSource]);

  const speakMessage = useCallback((msg: ChatMessage): void => {
    void Speech.stop();

    // Server audio path: prefer when enabled and URL is available
    if (!prefs.preferDeviceTts && msg.audioAsVoice && msg.audioUrl) {
      speakViaServerAudio(msg.audioUrl);
      return;
    }

    // Device TTS path — use callbacks to track playing state
    const clean = extractSpeakableText(msg.content);
    if (clean.length < MIN_SPEAKABLE_CHARS) return;
    Speech.speak(clean, {
      language: i18n.language,
      onStart: () => setIsSpeaking(true),
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  }, [prefs.preferDeviceTts, speakViaServerAudio]);

  // Auto-speak: watch for newly finalized assistant messages
  useEffect(() => {
    if (!prefs.autoSpeakReplies) return;
    if (!sessionKey) return;
    if (AppState.currentState !== 'active') return;

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

  return { speakMessage, stopSpeaking, isSpeaking };
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
