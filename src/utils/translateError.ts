import i18n from '@/i18n';
import { ClawError } from '@/lib/errors';
import { AttachmentPrepareError } from '@/lib/attachments/prepareChatAttachments';

/**
 * Translates a thrown value into a user-facing string.
 *
 * - ClawError → looks up `errors.<code>` with params.
 * - AttachmentPrepareError → looks up `chat.attachments.errors.<code>` with params.
 * - Any other Error → passes `e.message` through (covers Native SDK errors already
 *   localised by iOS, and raw gateway messages acceptable to power users).
 * - Unknown → falls back to the provided fallback key (default: `errors.unknown`).
 */
export function translateClawError(e: unknown, fallbackKey = 'errors.unknown'): string {
  if (e instanceof ClawError) {
    return i18n.t(`errors.${e.code}`, e.params ?? {});
  }
  if (e instanceof AttachmentPrepareError) {
    return i18n.t(`chat.attachments.errors.${e.code}`, e.params ?? {});
  }
  if (e instanceof Error && e.message) {
    return e.message;
  }
  return i18n.t(fallbackKey);
}
