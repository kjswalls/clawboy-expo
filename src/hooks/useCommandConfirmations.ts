import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_CONFIRM_DESTRUCTIVE = 'clawboy-confirm-destructive-commands';

export interface CommandConfirmations {
  /**
   * When true, /reset and /compact quick-command buttons show a confirmation
   * alert before executing. Defaults to true (opt-out) since both commands are
   * destructive — /reset clears the session, /compact rewrites context.
   *
   * This only applies to the action-bar quick-command buttons. Typing the
   * slash command directly in the input and sending is always immediate.
   */
  confirmDestructiveCommands: boolean;
  setConfirmDestructiveCommands: (v: boolean) => void;
}

export function useCommandConfirmations(): CommandConfirmations {
  const [confirmDestructiveCommands, setConfirmState] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(KEY_CONFIRM_DESTRUCTIVE)
      .then((raw) => {
        if (raw !== null) {
          setConfirmState(JSON.parse(raw) as boolean);
        }
      })
      .catch(() => {});
  }, []);

  const setConfirmDestructiveCommands = useCallback((v: boolean): void => {
    setConfirmState(v);
    AsyncStorage.setItem(KEY_CONFIRM_DESTRUCTIVE, JSON.stringify(v)).catch(() => {});
  }, []);

  return { confirmDestructiveCommands, setConfirmDestructiveCommands };
}
