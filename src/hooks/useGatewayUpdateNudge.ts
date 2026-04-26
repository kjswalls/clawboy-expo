/**
 * useGatewayUpdateNudge
 *
 * After the gateway connects, checks whether the server has signalled a
 * `minClientVersion` requirement (via `hello-ok policy.minClientVersion`).
 * If our running version is below that threshold, the hook:
 *   1. Kicks an EAS OTA check + silent download.
 *   2. Returns `nudgeVisible: true` so the caller can show a banner.
 *
 * The nudge dismisses itself when the user calls `dismissNudge()`.
 * It resets on each new connection.
 *
 * This is a lightweight, non-blocking complement to the boot-time
 * `useOTAUpdate` hook — it covers users who have not cold-started the app
 * since a critical update was published.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Updates from 'expo-updates';
import { useConnection } from '@/contexts/ConnectionContext';
import { APP_VERSION } from '@/lib/appMeta';

/** Naive semver comparison: returns true if `current` < `required`. */
function isBelowVersion(current: string, required: string): boolean {
  const parse = (v: string): number[] =>
    v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const c = parse(current);
  const r = parse(required);
  for (let i = 0; i < Math.max(c.length, r.length); i++) {
    const cv = c[i] ?? 0;
    const rv = r[i] ?? 0;
    if (cv < rv) return true;
    if (cv > rv) return false;
  }
  return false;
}

export function useGatewayUpdateNudge(): {
  nudgeVisible: boolean;
  dismissNudge: () => void;
} {
  const { connectionState, client } = useConnection();
  const [nudgeVisible, setNudgeVisible] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (connectionState.status !== 'connected') {
      // Reset when disconnected so we re-check on the next connect.
      checkedRef.current = false;
      return;
    }
    if (checkedRef.current) return;
    checkedRef.current = true;

    const minVer = client.current?.minClientVersion;
    if (!minVer || !isBelowVersion(APP_VERSION, minVer)) return;

    // Show the nudge immediately.
    setNudgeVisible(true);

    // Kick a background OTA check — ignore errors (nudge is already shown).
    if (!__DEV__ && Updates.isEnabled) {
      void (async () => {
        try {
          const check = await Updates.checkForUpdateAsync();
          if (check.isAvailable) {
            await Updates.fetchUpdateAsync();
          }
        } catch {
          // Non-fatal; the banner is already shown.
        }
      })();
    }
  }, [connectionState.status, client]);

  const dismissNudge = useCallback(() => setNudgeVisible(false), []);

  return { nudgeVisible, dismissNudge };
}
