import { renderHook, act } from '@testing-library/react-native';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { useThrottledValue } from '../useThrottledValue';

describe('useThrottledValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the initial value immediately on mount', () => {
    const { result } = renderHook(() => useThrottledValue('hello', 100));
    expect(result.current).toBe('hello');
  });

  it('emits the first update immediately when enough time has passed (leading edge)', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useThrottledValue(value, 100),
      { initialProps: { value: 'a' } }
    );

    // Advance past the throttle window so the next update fires immediately.
    act(() => {
      jest.advanceTimersByTime(200);
    });

    rerender({ value: 'b' });
    expect(result.current).toBe('b');
  });

  it('schedules a trailing flush for rapid updates within the throttle window', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useThrottledValue(value, 100),
      { initialProps: { value: 'a' } }
    );

    // Advance past the throttle window so the next update fires on the leading edge.
    act(() => {
      jest.advanceTimersByTime(110);
    });

    rerender({ value: 'b' });
    expect(result.current).toBe('b'); // leading edge — fires immediately

    // Rapid follow-up within the 100 ms window — should be deferred.
    rerender({ value: 'c' });
    expect(result.current).toBe('b'); // still b, trailing timer pending

    // Advance past the throttle window — trailing flush fires with 'c'.
    act(() => {
      jest.advanceTimersByTime(110);
    });
    expect(result.current).toBe('c');
  });

  it('does not schedule redundant timers for rapid intermediate values', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useThrottledValue(value, 100),
      { initialProps: { value: 'a' } }
    );

    // Advance so the first rerender fires on the leading edge.
    act(() => {
      jest.advanceTimersByTime(110);
    });

    rerender({ value: 'b' }); // leading edge, immediate
    expect(result.current).toBe('b');

    // Rapid follow-ups within the throttle window — should all be deferred via
    // a single trailing timer (no redundant timers for each intermediate value).
    rerender({ value: 'c' }); // schedules trailing timer
    rerender({ value: 'd' }); // should reuse existing timer, not schedule another
    rerender({ value: 'e' }); // same

    expect(result.current).toBe('b'); // still b

    act(() => {
      jest.advanceTimersByTime(110);
    });
    // Only one trailing flush — fires with the latest value 'e'.
    expect(result.current).toBe('e');
  });

  it('flushes immediately when delayMs becomes 0 (stream ended)', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }: { value: string; delay: number }) =>
        useThrottledValue(value, delay),
      { initialProps: { value: 'streaming text', delay: 100 } }
    );

    // Set a trailing timer by updating within the throttle window.
    rerender({ value: 'more text', delay: 100 });
    rerender({ value: 'final text', delay: 100 });
    expect(result.current).toBe('streaming text');

    // Stream ends — delay flips to 0. Should flush the latest value synchronously.
    act(() => {
      rerender({ value: 'final text', delay: 0 });
    });
    expect(result.current).toBe('final text');
  });

  it('cancels a pending trailing timer when delayMs becomes 0', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }: { value: string; delay: number }) =>
        useThrottledValue(value, delay),
      { initialProps: { value: 'a', delay: 100 } }
    );

    rerender({ value: 'b', delay: 100 }); // leading edge
    rerender({ value: 'c', delay: 100 }); // queues trailing timer

    // Flush immediately — the pending timer must be cancelled, not fire later.
    act(() => {
      rerender({ value: 'c', delay: 0 });
    });
    expect(result.current).toBe('c');

    // Advance past the original trailing window — no second update should fire.
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current).toBe('c'); // still c, no spurious re-render
  });
});
