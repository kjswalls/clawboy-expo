/**
 * Pin-to-bottom latch state — armed by reload paths (session switch, history
 * load, cold-start reconcile) and consumed by `onContentSizeChange` once the
 * new content has actually been measured.
 *
 *  - `force: true`  → scroll even if the user is currently scrolled up
 *    (explicit reload intent: refresh tap, session swap).
 *  - `force: false` → scroll only if the user was already near the bottom
 *    (re-pin existing position, no surprise jumps).
 *
 * Pure so we can unit-test the decision matrix independently of MessageList's
 * imperative ref plumbing.
 */
export interface PinLatch {
  force: boolean;
}

export function shouldFirePinLatch(latch: PinLatch | null, nearBottom: boolean): boolean {
  if (!latch) return false;
  return latch.force || nearBottom;
}
