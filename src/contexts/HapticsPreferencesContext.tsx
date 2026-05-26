import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_HAPTICS_ENABLED = 'clawboy-haptics-enabled';

export interface HapticsPreferences {
  /**
   * When true (default), the `useHaptics()` dispatcher fires the appropriate
   * `expo-haptics` call for the action. When false, the dispatcher is a
   * no-op. Persisted to AsyncStorage so the choice survives app restarts.
   *
   * Default is `true` — haptics on — because the in-app feedback is one of
   * ClawBoy's signature interactions. Users who find it distracting can opt
   * out from Settings → Interface.
   */
  hapticsEnabled: boolean;
  setHapticsEnabled: (v: boolean) => void;
  /**
   * False until AsyncStorage hydration completes. `useHaptics()` gates
   * dispatch on this so opted-out users don't get a stray pulse during the
   * ~30–100ms window between mount and first read.
   */
  hydrated: boolean;
}

/**
 * Exposed so `useHaptics()` can do a *soft* read (defaulting to enabled when
 * called outside a provider — e.g. in unit tests or storybook). Settings UI
 * should continue to use `useHapticsPreferencesContext()` which throws when
 * the provider is missing.
 */
export const HapticsPreferencesContext = createContext<HapticsPreferences | null>(null);

/**
 * Owns the single shared haptics preference and persists it to AsyncStorage.
 * Mount once in the root layout above all screens so toggling in Settings is
 * immediately visible everywhere.
 */
export function HapticsPreferencesProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [hapticsEnabled, setHapticsState] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY_HAPTICS_ENABLED)
      .then((raw) => {
        if (raw !== null && raw !== undefined) {
          setHapticsState(JSON.parse(raw) as boolean);
        }
      })
      .catch(() => {})
      .finally(() => {
        setHydrated(true);
      });
  }, []);

  const setHapticsEnabled = useCallback((v: boolean): void => {
    setHapticsState(v);
    AsyncStorage.setItem(KEY_HAPTICS_ENABLED, JSON.stringify(v)).catch(() => {});
  }, []);

  return (
    <HapticsPreferencesContext.Provider value={{ hapticsEnabled, setHapticsEnabled, hydrated }}>
      {children}
    </HapticsPreferencesContext.Provider>
  );
}

/**
 * Returns the shared haptics preferences. Throws when called outside a
 * `HapticsPreferencesProvider` — settings UI relies on this. The `useHaptics`
 * hook reads the raw context directly so it can fall back to enabled when no
 * provider is mounted (tests, storybook).
 */
export function useHapticsPreferencesContext(): HapticsPreferences {
  const ctx = useContext(HapticsPreferencesContext);
  if (!ctx) {
    throw new Error('useHapticsPreferencesContext must be used within a HapticsPreferencesProvider');
  }
  return ctx;
}
