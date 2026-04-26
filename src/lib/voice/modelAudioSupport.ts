import type { Model } from '@/types';

/**
 * Model id prefixes/patterns that are known to support native audio input even
 * when the gateway does not populate the `model.input` array. Kept as a simple
 * prefix allowlist so it is easy to extend without a regex engine.
 *
 * Fail-closed: any model NOT matched here is assumed to be text-only, which
 * means we transcribe by default instead of silently dropping audio.
 */
export const AUDIO_CAPABLE_ID_PREFIXES: readonly string[] = [
  'gpt-4o-audio',
  'gpt-4o-mini-audio',
  'gpt-4o-realtime',
  // gpt-4o baseline family — these can accept audio blocks via the API
  'gpt-4o',
  // Gemini models (1.5, 2, 2.5 all support audio input natively)
  'gemini-1.5',
  'gemini-2',
  'gemini-exp',
];

/**
 * Returns true when the given model is known to accept raw audio attachments
 * in a chat message.
 *
 * Decision tree:
 * 1. Explicit `model.input` array from the gateway → authoritative; check for
 *    presence of the string `'audio'`.
 * 2. No `input` array (gateway omits the field) → fall back to the id-prefix
 *    allowlist above; unknown ids resolve to false (text-only assumed).
 */
export function modelSupportsAudioInput(model: Model | null | undefined): boolean {
  if (!model) {
    return false;
  }

  if (Array.isArray(model.input) && model.input.length > 0) {
    return model.input.includes('audio');
  }

  const id = (model.id ?? '').toLowerCase();
  return AUDIO_CAPABLE_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}
