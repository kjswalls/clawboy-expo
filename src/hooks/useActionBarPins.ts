import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = '@clawboy/action_bar_pins';

/**
 * IDs pinned by default on first install. The slash command is pinned so it
 * stays immediately accessible without expanding the row. The user can unpin
 * it and that decision is remembered in AsyncStorage.
 */
const DEFAULT_PINNED_IDS = ['slash'];

/**
 * Persists which action bar command IDs the user has pinned to the
 * always-visible strip. Seeded with DEFAULT_PINNED_IDS when no stored value
 * exists yet. Distinguishes null (never written) from [] (user unpinned all).
 */
export function useActionBarPins(): {
  pinnedIds: Set<string>;
  togglePin: (id: string) => void;
} {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set(DEFAULT_PINNED_IDS));

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw === null) {
          // Key was never written — leave the seeded defaults in place.
          return;
        }
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // User has an explicit preference (possibly empty [] = all unpinned).
          setPinnedIds(new Set(parsed.filter((v): v is string => typeof v === 'string')));
        }
      })
      .catch(() => {
        // Read failures are non-critical — keep the seeded defaults.
      });
  }, []);

  const togglePin = useCallback((id: string): void => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  return { pinnedIds, togglePin };
}
