import type { Model } from '@/types';

/**
 * Model id prefixes that are known to support native audio input even when the
 * gateway does not populate the `model.input` array. Kept as a simple prefix
 * allowlist so it is easy to extend without a regex engine.
 *
 * Fail-closed: any model NOT matched here is assumed to be text-only, which
 * means we transcribe by default instead of silently dropping audio.
 *
 * Note: the broad `'gpt-4o'` family fallback lives in `modelSupportsAudioInput`
 * below (after the exclusion check) rather than here, so the exclusion list can
 * block `gpt-4o-mini` without also blocking `gpt-4o-mini-audio-*`.
 */
export const AUDIO_CAPABLE_ID_PREFIXES: readonly string[] = [
  'gpt-4o-audio',
  'gpt-4o-mini-audio',
  'gpt-4o-realtime',
  // Gemini models (1.5, 2, 2.5 all support audio input natively)
  'gemini-1.5',
  'gemini-2',
  'gemini-exp',
];

/**
 * Model id prefixes that must NOT be treated as audio-capable even though a
 * broader prefix (e.g. `'gpt-4o'`) would otherwise match them. Checked after
 * the specific capable prefixes so that `gpt-4o-mini-audio` still wins.
 */
export const AUDIO_INCAPABLE_ID_PREFIXES: readonly string[] = [
  // gpt-4o-mini (without an -audio suffix) is a text-only model — it does NOT
  // accept raw audio blocks despite sharing the 'gpt-4o' prefix.
  'gpt-4o-mini',
];

/**
 * Returns true when the given model is known to accept raw audio attachments
 * in a chat message.
 *
 * Decision tree:
 * 1. Explicit `model.input` array from the gateway → authoritative; check for
 *    presence of the string `'audio'`.
 * 2. No `input` array (gateway omits the field) → fall back to id-prefix
 *    heuristic:
 *    a. Specific capable prefixes (e.g. `gpt-4o-audio`, `gpt-4o-mini-audio`).
 *    b. Explicit exclusion list (e.g. `gpt-4o-mini`) — prevents the broad
 *       gpt-4o family fallback from producing false positives.
 *    c. Broad gpt-4o family fallback (catches `gpt-4o`, `gpt-4o-2024-*`, etc.).
 *    d. Unknown ids resolve to false (text-only assumed).
 */
export function modelSupportsAudioInput(model: Model | null | undefined): boolean {
  if (!model) {
    return false;
  }

  if (Array.isArray(model.input) && model.input.length > 0) {
    return model.input.includes('audio');
  }

  const id = (model.id ?? '').toLowerCase();

  // Step 1 — specific capable prefixes (highest priority).
  // e.g. "gpt-4o-audio-*", "gpt-4o-mini-audio-*", "gemini-2*".
  // Checked first so an audio-capable variant always wins its base family.
  if (AUDIO_CAPABLE_ID_PREFIXES.some((prefix) => id.startsWith(prefix))) {
    return true;
  }

  // Step 2 — explicit exclusions (blocks the broad fallback below).
  // e.g. "gpt-4o-mini" would otherwise match the "gpt-4o" catch-all,
  // but it is text-only and must be excluded.
  if (AUDIO_INCAPABLE_ID_PREFIXES.some((prefix) => id.startsWith(prefix))) {
    return false;
  }

  // Step 3 — broad gpt-4o family fallback.
  // Catches "gpt-4o", "gpt-4o-2024-*", and any future variants not yet in
  // the allowlist, after known exclusions have already been ruled out above.
  return id.startsWith('gpt-4o');
}
