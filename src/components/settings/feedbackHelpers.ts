/**
 * Shared constants, helpers, and types for the FeedbackSheet component family.
 */
import type { FeedbackErrorCode, FeedbackKind } from '@/lib/feedback/submitFeedback';

export const TITLE_MIN = 4;
export const TITLE_MAX = 120;
export const BODY_MIN = 10;
export const BODY_MAX = 8000;
export const CONTACT_MAX = 200;

export interface ScreenshotItem {
  id: string;
  uri: string;
}

export function errorTitle(code: FeedbackErrorCode, t: (key: string) => string): string {
  switch (code) {
    case 'rate_limited': return t('feedback.errorRateLimited');
    case 'leak_blocked': return t('feedback.errorLeakBlocked');
    case 'validation': return t('feedback.errorValidation');
    case 'timeout': return t('feedback.errorTimeout');
    case 'network': return t('feedback.errorNetwork');
    case 'not_configured': return t('feedback.errorNotConfigured');
    case 'server': return t('feedback.errorServer');
  }
}

export function renderClipboardFallback(input: {
  kind: FeedbackKind;
  title: string;
  body: string;
  contact: string;
  diagnostics: string | null;
  hasScreenshots: boolean;
}): string {
  const lines: string[] = [];
  lines.push(`# [${input.kind === 'bug' ? 'Bug' : 'Feature'}] ${input.title}`);
  lines.push('');
  lines.push(input.body);
  lines.push('');
  if (input.hasScreenshots) {
    lines.push('_Screenshots were attached in-app but cannot be included in a clipboard copy. Please attach them manually when pasting._');
    lines.push('');
  }
  if (input.diagnostics) {
    lines.push('## Diagnostics');
    lines.push('');
    lines.push(input.diagnostics);
    lines.push('');
  }
  if (input.contact.length > 0) {
    lines.push(`> Contact: ${input.contact}`);
    lines.push('');
  }
  lines.push('<sub>Submitted via the in-app feedback form.</sub>');
  return lines.join('\n');
}
