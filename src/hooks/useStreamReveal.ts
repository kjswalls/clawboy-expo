import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const DEFAULT_CHARS_PER_SEC = 250;
// Commit a setState only after this many new chars have accumulated.
// At 250 cps / 60 fps each frame reveals ~4 chars, so 16 ≈ every 4 frames
// (15 Hz) — quarter the markdown re-parse rate vs the old 8-char threshold
// with no perceptible smoothness loss.
const COMMIT_MIN_DELTA = 16;
// Hard cap on chars revealed in a single RAF tick. Guards against pathological
// cases where a very large chunk arrives after a period of inactivity, which
// would make the JS thread block for an entire burst in one commit.
const MAX_BURST_CHARS = 400;
// When a message grows beyond this size the per-frame typewriter animation
// provides diminishing UX value. Raise the effective min-delta to slow commits
// way down for very long messages, capping the markdown parse rate.
const LARGE_TEXT_THRESHOLD = 8_000;
const LARGE_TEXT_MIN_DELTA = 64; // ~4× normal, ≈ 4 Hz

/**
 * Returns a "revealed" prefix of `text` that advances toward `text.length`
 * at a steady rate using requestAnimationFrame, smoothing out burst chunks
 * that would otherwise pop a large block of characters into view at once.
 *
 * Behavior:
 * - While `isStreaming` is true and revealed < full length, a RAF loop
 *   increments revealedLength by `ceil(charsPerSec * dt)` each frame.
 * - When `isStreaming` flips to false, the full text is returned immediately
 *   in the same React commit — no stale "stuck on penultimate chunk" issue.
 * - When `text` shrinks (abort/replace), snaps immediately to the new length.
 * - When the reveal catches up to `text.length`, the RAF loop stops until
 *   more text arrives.
 *
 * Performance note: callers MUST render the revealed text in a way whose cost
 * is bounded per frame (e.g. via segmented markdown rendering with a memoized
 * stable prefix + small active tail). Re-running an O(N) markdown parse over
 * the entire growing string on every RAF call will peg the JS thread on long
 * messages — see `MessageBubble.tsx` for the segmentation pattern.
 */
export function useStreamReveal(
  text: string,
  isStreaming: boolean,
  charsPerSec: number = DEFAULT_CHARS_PER_SEC,
): string {
  const [revealedLen, setRevealedLen] = useState(() => text.length);

  const textRef = useRef(text);
  const isStreamingRef = useRef(isStreaming);
  const charsPerSecRef = useRef(charsPerSec);
  textRef.current = text;
  isStreamingRef.current = isStreaming;
  charsPerSecRef.current = charsPerSec;

  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const revealedLenRef = useRef(text.length);

  const cancelRaf = (): void => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTimeRef.current = null;
  };

  const scheduleRaf = (): void => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame((now) => {
      rafRef.current = null;
      const t = textRef.current;
      const streaming = isStreamingRef.current;

      if (!streaming) {
        lastTimeRef.current = null;
        if (revealedLenRef.current !== t.length) {
          revealedLenRef.current = t.length;
          setRevealedLen(t.length);
        }
        return;
      }

      const dt = lastTimeRef.current !== null ? (now - lastTimeRef.current) / 1000 : 0;
      lastTimeRef.current = now;

      const rawDelta = Math.ceil(charsPerSecRef.current * Math.min(dt, 0.1));
      // Cap burst and apply snapshot-mode throttle for very long messages.
      const delta = Math.min(MAX_BURST_CHARS, rawDelta);
      const next = Math.min(t.length, revealedLenRef.current + delta);
      const reachedEnd = next >= t.length;
      const effectiveMinDelta = t.length > LARGE_TEXT_THRESHOLD
        ? LARGE_TEXT_MIN_DELTA
        : COMMIT_MIN_DELTA;
      const enoughDelta = next - revealedLenRef.current >= effectiveMinDelta;
      if (next !== revealedLenRef.current && (enoughDelta || reachedEnd)) {
        revealedLenRef.current = next;
        setRevealedLen(next);
      } else if (next !== revealedLenRef.current) {
        // Advance the internal cursor without triggering a re-render yet.
        revealedLenRef.current = next;
      }

      if (next < t.length) {
        scheduleRaf();
      } else {
        lastTimeRef.current = null;
      }
    });
  };

  useLayoutEffect(() => {
    if (!isStreaming) {
      cancelRaf();
      if (revealedLenRef.current !== text.length) {
        revealedLenRef.current = text.length;
        setRevealedLen(text.length);
      }
      return;
    }

    if (text.length < revealedLenRef.current) {
      revealedLenRef.current = text.length;
      setRevealedLen(text.length);
      return;
    }

    if (text.length > revealedLenRef.current) {
      scheduleRaf();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, isStreaming]);

  useEffect(() => () => { cancelRaf(); }, []);

  const len = isStreaming ? revealedLen : text.length;
  return text.slice(0, len);
}
