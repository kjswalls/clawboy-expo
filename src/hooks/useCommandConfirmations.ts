import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_CONFIRM_DESTRUCTIVE = 'clawboy-confirm-destructive-commands';

// Module-level singleton so all mounted instances share the same value.
// Without this, the chat screen and settings panel each hold independent React
// state from the same AsyncStorage key — toggling in settings wouldn't update
// the copy used by handleSend until the chat screen remounts.
let moduleValue = true;
const listeners = new Set<(v: boolean) => void>();

function notifyListeners(v: boolean): void {
  listeners.forEach((l) => l(v));
}

let loadedFromStorage = false;

export interface CommandConfirmations {
  /**
   * When true, /reset and /compact commands show a confirmation alert before
   * executing. Defaults to true (opt-out) since both commands are destructive.
   */
  confirmDestructiveCommands: boolean;
  setConfirmDestructiveCommands: (v: boolean) => void;
}

export function useCommandConfirmations(): CommandConfirmations {
  const [value, setValue] = useState(moduleValue);

  useEffect(() => {
    listeners.add(setValue);
    if (!loadedFromStorage) {
      loadedFromStorage = true;
      AsyncStorage.getItem(KEY_CONFIRM_DESTRUCTIVE)
        .then((raw) => {
          if (raw !== null) {
            moduleValue = JSON.parse(raw) as boolean;
            notifyListeners(moduleValue);
          }
        })
        .catch(() => {});
    }
    return () => {
      listeners.delete(setValue);
    };
  }, []);

  const setConfirmDestructiveCommands = useCallback((v: boolean): void => {
    moduleValue = v;
    notifyListeners(v);
    AsyncStorage.setItem(KEY_CONFIRM_DESTRUCTIVE, JSON.stringify(v)).catch(() => {});
  }, []);

  return { confirmDestructiveCommands: value, setConfirmDestructiveCommands };
}
