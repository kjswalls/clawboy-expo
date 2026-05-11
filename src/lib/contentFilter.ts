/**
 * Message segment content filter — architectural seam for PRC compliance.
 *
 * In the global build (`ENABLE_CONTENT_MODERATION = false`) this is a no-op
 * pass-through. The bundler dead-code-eliminates the disabled branch entirely.
 *
 * In a future CN build (`ENABLE_CONTENT_MODERATION = true`) this function
 * intercepts each text chunk before it reaches the UI. The CN implementation
 * can call a CAC-approved moderation SDK or gateway-side filter here.
 *
 * Return values:
 *   string  — the (possibly sanitized) text to render
 *   null    — the segment is blocked; caller should skip it
 *
 * See docs/legal/cn-readiness/04-content-moderation.md for the decision
 * context and the three implementation paths.
 *
 * CONTRACT: This function must remain synchronous. The streaming pipeline
 * runs inside RAF callbacks where async operations would break frame timing.
 * If the CN implementation needs async moderation, batch-buffer segments and
 * flush on a timer rather than making this function async.
 */

import { ENABLE_CONTENT_MODERATION } from '@/constants/featureFlags';

export function filterMessageSegment(text: string): string | null {
  if (!ENABLE_CONTENT_MODERATION) {
    return text;
  }

  // -------------------------------------------------------------------------
  // CN build: insert content moderation here.
  //
  // Example (synchronous SDK call — replace with actual implementation):
  //
  //   const result = cnModerationSdk.checkSync(text);
  //   if (result.blocked) return null;
  //   return result.sanitized ?? text;
  //
  // If the moderation SDK is async-only, implement a buffered approach:
  //   1. Accumulate chunks in a local buffer.
  //   2. On each flush, submit the buffer to the async SDK.
  //   3. Hold rendering until the SDK responds.
  //   See docs/legal/cn-readiness/04-content-moderation.md, Path B.
  // -------------------------------------------------------------------------

  return text;
}
