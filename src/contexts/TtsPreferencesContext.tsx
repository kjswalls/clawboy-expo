import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_AUTO_SPEAK = 'clawboy-tts-auto-speak';
const KEY_PREFER_DEVICE = 'clawboy-tts-prefer-device';

export interface TtsPreferences {
  /**
   * When true, assistant replies are spoken automatically once streaming ends.
   * Defaults to false — off by default because ClawBoy may read sensitive
   * content (email, banking, etc.) aloud in shared spaces.
   */
  autoSpeakReplies: boolean;
  setAutoSpeakReplies: (v: boolean) => void;
  /**
   * When true, force on-device expo-speech synthesis even when the server
   * has produced an audioUrl. Defaults to false (prefer server audio when
   * available for higher-quality voice).
   */
  preferDeviceTts: boolean;
  setPreferDeviceTts: (v: boolean) => void;
}

const TtsPreferencesContext = createContext<TtsPreferences | null>(null);

/**
 * Owns the single shared instance of TTS preferences and persists them to
 * AsyncStorage. Mount once in the root layout above all screens so that
 * toggling a preference in Settings is immediately visible everywhere — no
 * remount required.
 */
export function TtsPreferencesProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [autoSpeakReplies, setAutoSpeakState] = useState(false);
  const [preferDeviceTts, setPreferDeviceState] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet([KEY_AUTO_SPEAK, KEY_PREFER_DEVICE])
      .then((pairs) => {
        const autoRaw = pairs.find((e) => e[0] === KEY_AUTO_SPEAK)?.[1];
        const deviceRaw = pairs.find((e) => e[0] === KEY_PREFER_DEVICE)?.[1];
        if (autoRaw !== null && autoRaw !== undefined) setAutoSpeakState(JSON.parse(autoRaw) as boolean);
        if (deviceRaw !== null && deviceRaw !== undefined) setPreferDeviceState(JSON.parse(deviceRaw) as boolean);
      })
      .catch(() => {});
  }, []);

  const setAutoSpeakReplies = useCallback((v: boolean): void => {
    setAutoSpeakState(v);
    AsyncStorage.setItem(KEY_AUTO_SPEAK, JSON.stringify(v)).catch(() => {});
  }, []);

  const setPreferDeviceTts = useCallback((v: boolean): void => {
    setPreferDeviceState(v);
    AsyncStorage.setItem(KEY_PREFER_DEVICE, JSON.stringify(v)).catch(() => {});
  }, []);

  return (
    <TtsPreferencesContext.Provider
      value={{ autoSpeakReplies, setAutoSpeakReplies, preferDeviceTts, setPreferDeviceTts }}
    >
      {children}
    </TtsPreferencesContext.Provider>
  );
}

/**
 * Returns the shared TTS preferences. Must be called within a
 * `TtsPreferencesProvider`. All call sites should use this (or the
 * `useTtsPreferences` re-export in `@/hooks/useTtsPreferences`) rather than
 * maintaining their own independent state.
 */
export function useTtsPreferencesContext(): TtsPreferences {
  const ctx = useContext(TtsPreferencesContext);
  if (!ctx) {
    throw new Error('useTtsPreferencesContext must be used within a TtsPreferencesProvider');
  }
  return ctx;
}
