/**
 * Boot-time OTA update check.
 *
 * Behaviour:
 *  - Runs once on app start (skipped in dev / when Updates.isEnabled is false).
 *  - Non-critical updates: downloaded silently; Expo applies on next cold start.
 *  - Critical updates (manifest.extra.critical === true): `isCritical` returns
 *    true so the caller can show a blocking restart modal.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Updates from 'expo-updates';

export type OTAState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'ready'; critical: boolean }
  | { phase: 'done' };

export function useOTAUpdate(): { state: OTAState; applyUpdate: () => Promise<void> } {
  const [state, setState] = useState<OTAState>({ phase: 'idle' });
  const ranRef = useRef(false);

  useEffect(() => {
    // Only run once per app launch; skip in Expo Go / local dev builds.
    if (ranRef.current || __DEV__ || !Updates.isEnabled) return;
    ranRef.current = true;

    void (async () => {
      setState({ phase: 'checking' });
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) {
          setState({ phase: 'done' });
          return;
        }
        const fetched = await Updates.fetchUpdateAsync();
        // Drill into manifest.extra — shape varies by manifest version.
        const extra = (fetched.manifest as Record<string, unknown> | null | undefined);
        const extraObj = extra?.['extra'];
        const critical =
          typeof extraObj === 'object' &&
          extraObj !== null &&
          (extraObj as Record<string, unknown>)['critical'] === true;

        setState({ phase: 'ready', critical });
      } catch {
        // Silently discard — failing to check for updates is non-fatal.
        setState({ phase: 'done' });
      }
    })();
  }, []);

  const applyUpdate = useCallback(async (): Promise<void> => {
    await Updates.reloadAsync();
  }, []);

  return { state, applyUpdate };
}
