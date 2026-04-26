import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREF_KEY = 'clawboy-media-cache-replay';

/**
 * Opt-in/out of persistent video caching.
 *
 * When `true` (default), downloaded videos are written to the persistent LRU
 * cache and replayed from disk on subsequent views.
 *
 * When `false`, each video is downloaded to a temporary file that is deleted
 * on unmount — no persistent footprint, re-download on every view.
 *
 * Returns `[enabled, setEnabled]`.  The preference is loaded once from
 * AsyncStorage on mount and persisted on every change.
 */
export function useMediaCacheReplay(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(PREF_KEY)
      .then((raw) => {
        if (raw !== null) {
          setEnabledState(JSON.parse(raw) as boolean);
        }
      })
      .catch(() => {});
  }, []);

  const setEnabled = useCallback((v: boolean): void => {
    setEnabledState(v);
    AsyncStorage.setItem(PREF_KEY, JSON.stringify(v)).catch(() => {});
  }, []);

  return [enabled, setEnabled];
}
