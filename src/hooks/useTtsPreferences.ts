import { useCallback, useEffect, useState } from 'react';
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

/**
 * Persists TTS user preferences to AsyncStorage.
 *
 * Both values default to `false` (all TTS is opt-in).
 */
export function useTtsPreferences(): TtsPreferences {
  const [autoSpeakReplies, setAutoSpeakState] = useState(false);
  const [preferDeviceTts, setPreferDeviceState] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet([KEY_AUTO_SPEAK, KEY_PREFER_DEVICE])
      .then(([[, autoRaw], [, deviceRaw]]) => {
        if (autoRaw !== null) setAutoSpeakState(JSON.parse(autoRaw) as boolean);
        if (deviceRaw !== null) setPreferDeviceState(JSON.parse(deviceRaw) as boolean);
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

  return { autoSpeakReplies, setAutoSpeakReplies, preferDeviceTts, setPreferDeviceTts };
}
