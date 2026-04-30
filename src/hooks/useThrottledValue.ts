import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Returns a throttled copy of `value` that updates at most once every `delayMs`.
 *
 * - Trailing-edge guaranteed: the pending timer always fires with the *latest* value
 *   (tracked via ref), so the last streaming chunk is never swallowed.
 * - Immediate flush when `delayMs <= 0`: forces a synchronous update, used when
 *   streaming ends so the finalized text renders in the same React commit.
 */
export function useThrottledValue<T>(value: T, delayMs: number): T {
  const [throttled, setThrottled] = useState<T>(value);
  // Start at -Infinity so the very first update always fires on the leading edge.
  const lastEmitRef = useRef<number>(-Infinity);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always holds the most-recent value so the trailing timer picks it up.
  const latestRef = useRef<T>(value);
  latestRef.current = value;

  // useLayoutEffect fires synchronously after each render so throttle decisions
  // and immediate setThrottled calls are visible in the same React commit.
  useLayoutEffect(() => {
    if (delayMs <= 0) {
      if (pendingRef.current !== null) {
        clearTimeout(pendingRef.current);
        pendingRef.current = null;
      }
      lastEmitRef.current = Date.now();
      setThrottled(latestRef.current);
      return;
    }

    const now = Date.now();
    const elapsed = now - lastEmitRef.current;

    if (elapsed >= delayMs) {
      lastEmitRef.current = now;
      setThrottled(latestRef.current);
      return;
    }

    // Trailing flush already scheduled — it reads latestRef when it fires,
    // so no need to reschedule on every intermediate update.
    if (pendingRef.current !== null) return;

    pendingRef.current = setTimeout(() => {
      pendingRef.current = null;
      lastEmitRef.current = Date.now();
      setThrottled(latestRef.current);
    }, delayMs - elapsed);
  }, [value, delayMs]);

  // Cleanup on unmount.
  useEffect(
    () => () => {
      if (pendingRef.current !== null) {
        clearTimeout(pendingRef.current);
      }
    },
    []
  );

  return throttled;
}
