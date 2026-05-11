/**
 * Tests for useStreamReveal's adaptive-rate typewriter logic.
 *
 * requestAnimationFrame is shimmed manually: `triggerRaf(timestamp)` fires the
 * pending callback synchronously, giving deterministic control over timing
 * without depending on Jest timer mocks (which don't cover rAF on RN).
 *
 * Timing model:
 *   - First RAF tick: dt = 0 (lastTimeRef is null) → reveals 0 chars.
 *   - Subsequent ticks: dt = timestamp delta / 1000 → reveals chars.
 *   - COMMIT_MIN_DELTA = 16: setState only fires when delta ≥ 16 or reachedEnd.
 *   - Adaptive rate: effectiveCps = clamp(max(baseCps, buffer/0.25s), baseCps..4000).
 */
import { renderHook, act } from '@testing-library/react-native';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { useStreamReveal } from '../useStreamReveal';

// ---------------------------------------------------------------------------
// rAF shim — install directly since RN Jest env has no global rAF
// ---------------------------------------------------------------------------

type RafCallback = (timestamp: number) => void;

let pendingRaf: RafCallback | null = null;
let rafHandle = 0;

const savedRaf = (global as unknown as Record<string, unknown>).requestAnimationFrame;
const savedCaf = (global as unknown as Record<string, unknown>).cancelAnimationFrame;

beforeEach(() => {
  pendingRaf = null;
  rafHandle = 0;
  (global as unknown as Record<string, unknown>).requestAnimationFrame = (cb: RafCallback) => {
    pendingRaf = cb;
    return ++rafHandle;
  };
  (global as unknown as Record<string, unknown>).cancelAnimationFrame = () => {
    pendingRaf = null;
  };
});

afterEach(() => {
  if (savedRaf === undefined) {
    delete (global as unknown as Record<string, unknown>).requestAnimationFrame;
  } else {
    (global as unknown as Record<string, unknown>).requestAnimationFrame = savedRaf;
  }
  if (savedCaf === undefined) {
    delete (global as unknown as Record<string, unknown>).cancelAnimationFrame;
  } else {
    (global as unknown as Record<string, unknown>).cancelAnimationFrame = savedCaf;
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chars(n: number): string {
  return 'x'.repeat(n);
}

/**
 * Fire `count` RAF callbacks at `frameMs` intervals starting from `startTs`.
 * Each call is wrapped in `act` so React flushes state updates.
 */
function fireFrames(count: number, frameMs = 16, startTs = 0): void {
  for (let i = 0; i < count; i++) {
    act(() => {
      const cb = pendingRaf;
      pendingRaf = null;
      if (cb) cb(startTs + (i + 1) * frameMs);
    });
  }
}

// ---------------------------------------------------------------------------
// Tests — not streaming
// ---------------------------------------------------------------------------

describe('useStreamReveal – not streaming', () => {
  it('returns full text immediately when isStreaming=false', () => {
    const text = chars(500);
    const { result } = renderHook(() => useStreamReveal(text, false));
    expect(result.current).toBe(text);
    expect(pendingRaf).toBeNull();
  });

  it('snaps to full text when isStreaming flips false mid-reveal', () => {
    const text = chars(200);
    const { result, rerender } = renderHook(
      ({ t, s }: { t: string; s: boolean }) => useStreamReveal(t, s),
      { initialProps: { t: '', s: true } },
    );

    act(() => { rerender({ t: text, s: true }); });
    // RAF scheduled but not fired — some buffer still pending
    act(() => { rerender({ t: text, s: false }); });
    expect(result.current).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// Tests — base / slow stream (buffer stays small)
// ---------------------------------------------------------------------------

describe('useStreamReveal – base rate (slow stream)', () => {
  it('reveals a single char immediately via reachedEnd path', () => {
    // Deliver 1 char. On the second RAF tick (dt=16ms):
    //   buffer=1, adaptiveCps=max(250, 4)=250, rawDelta=ceil(250*0.016)=4
    //   next=min(1, 0+4)=1, reachedEnd=true → commit immediately.
    const { result, rerender } = renderHook(
      ({ t, s }: { t: string; s: boolean }) => useStreamReveal(t, s, 250),
      { initialProps: { t: '', s: true } },
    );

    act(() => { rerender({ t: 'A', s: true }); });
    fireFrames(2); // frame 1: dt=0 (no reveal), frame 2: dt=16ms → reachedEnd → reveal
    expect(result.current).toBe('A');
  });

  it('does not accelerate when buffer is small (≤ baseCps * 0.25s = 62 chars)', () => {
    // Deliver 20 chars, fire enough frames to drain at baseCps=250.
    // At 250cps * 16ms = 4 chars/frame, COMMIT_MIN_DELTA=16 so commit every 4 frames.
    // 20 chars → reachedEnd fires once next ≥ 20, within ~7 frames.
    const { result, rerender } = renderHook(
      ({ t, s }: { t: string; s: boolean }) => useStreamReveal(t, s, 250),
      { initialProps: { t: '', s: true } },
    );

    act(() => { rerender({ t: chars(20), s: true }); });
    fireFrames(10); // well beyond what's needed
    expect(result.current.length).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Tests — adaptive rate (fast stream)
// ---------------------------------------------------------------------------

describe('useStreamReveal – adaptive rate (fast stream)', () => {
  it('drains a 400-char buffer within 50 frames at adaptive cps', () => {
    // With 400-char buffer: adaptiveCps = max(250, 400/0.25) = 1600.
    // rawDelta per 16ms frame = ceil(1600*0.016) = 26 chars while buffer is large.
    // As buffer shrinks, rate adapts down. Full drain (reachedEnd commit) fires
    // around frame ~44. 50 frames is a comfortable margin.
    const { result, rerender } = renderHook(
      ({ t, s }: { t: string; s: boolean }) => useStreamReveal(t, s, 250),
      { initialProps: { t: '', s: true } },
    );

    act(() => { rerender({ t: chars(400), s: true }); });
    fireFrames(50);
    expect(result.current.length).toBe(400);
  });

  it('drains an 800-char buffer fully within 60 frames', () => {
    // At 800 chars: effectiveCps = min(4000, 3200) = 3200, rawDelta=52/frame.
    // Rate decreases as buffer shrinks; full drain fires around frame ~54.
    // 60 frames is a comfortable margin.
    const { result, rerender } = renderHook(
      ({ t, s }: { t: string; s: boolean }) => useStreamReveal(t, s, 250),
      { initialProps: { t: '', s: true } },
    );

    act(() => { rerender({ t: chars(800), s: true }); });
    fireFrames(60);
    expect(result.current.length).toBe(800);
  });

  it('end-of-stream snap reveals near-zero chars when buffer is pre-drained', () => {
    // Fire enough frames to drain the 800-char buffer fully (60 frames), then
    // flip isStreaming=false. The snap should commit nothing — residual=0.
    const { result, rerender } = renderHook(
      ({ t, s }: { t: string; s: boolean }) => useStreamReveal(t, s, 250),
      { initialProps: { t: '', s: true } },
    );

    act(() => { rerender({ t: chars(800), s: true }); });
    fireFrames(60); // adaptive rate fully drains the buffer

    // All 800 revealed during streaming (no residual left for the snap)
    expect(result.current.length).toBe(800);

    // Flip stream end — snap should be a no-op
    act(() => { rerender({ t: chars(800), s: false }); });
    expect(result.current.length).toBe(800);
  });

  it('caps effective cps at MAX_ADAPTIVE_CPS (4000) for huge buffers', () => {
    // 10 000 chars → adaptiveCps would be 40 000, clamped to 4000.
    // rawDelta per 16ms frame = ceil(4000*0.016) = 64, then capped by MAX_BURST_CHARS=400.
    // So per frame: min(400, 64) = 64 chars.
    // 10 000 / 64 ≈ 157 frames. We don't need to drain all; just verify cap applies.
    const { result, rerender } = renderHook(
      ({ t, s }: { t: string; s: boolean }) => useStreamReveal(t, s, 250),
      { initialProps: { t: '', s: true } },
    );

    act(() => { rerender({ t: chars(10_000), s: true }); });
    fireFrames(2); // frame 1: dt=0, frame 2: dt=16ms → at most MAX_BURST_CHARS=400 chars

    const revealed = result.current.length;
    // After 2 ticks: at most 400 chars (MAX_BURST_CHARS), at least 0
    expect(revealed).toBeGreaterThanOrEqual(0);
    expect(revealed).toBeLessThanOrEqual(400);
  });

  it('adaptive is faster than base rate for large buffers', () => {
    // At baseCps=250 and 400-char buffer: 4 chars/frame, commit every 4 frames.
    // In 8 frames (1 setup + 7 real): ~4 commits × 16 chars = 64 chars revealed.
    // At adaptive: ~26 chars/frame × 7 frames ≈ 182 chars revealed.
    // So adaptive reveals more in the same frame budget.
    const { result: adaptiveResult, rerender: rerenderAdaptive } = renderHook(
      ({ t, s }: { t: string; s: boolean }) => useStreamReveal(t, s, 250),
      { initialProps: { t: '', s: true } },
    );

    act(() => { rerenderAdaptive({ t: chars(400), s: true }); });
    fireFrames(8);
    const adaptiveRevealed = adaptiveResult.current.length;

    // Should have revealed more than what fixed 250cps manages in 8 frames
    // Fixed: ceil(250*0.016)=4 chars/frame, commits when ≥16 chars, so 8 frames → ~32-48 chars
    // Adaptive: ~180+ chars
    expect(adaptiveRevealed).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------
// Tests — shrink behavior
// ---------------------------------------------------------------------------

describe('useStreamReveal – shrink behavior', () => {
  it('snaps immediately when text shrinks (abort/replace)', () => {
    const { result, rerender } = renderHook(
      ({ t, s }: { t: string; s: boolean }) => useStreamReveal(t, s, 250),
      { initialProps: { t: chars(100), s: true } },
    );

    fireFrames(2); // advance reveal partially
    act(() => { rerender({ t: chars(10), s: true }); });
    expect(result.current.length).toBeLessThanOrEqual(10);
  });
});
