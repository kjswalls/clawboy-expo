/**
 * Compresses and base64-encodes local image URIs for inclusion in a feedback
 * submission. Uses a feedback-specific size budget (separate from the gateway
 * attachment pipeline) so changes to one don't accidentally affect the other.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import { EncodingType, getInfoAsync, readAsStringAsync } from 'expo-file-system/legacy';

export type FeedbackScreenshotMimeType = 'image/jpeg';

export interface FeedbackScreenshot {
  mimeType: FeedbackScreenshotMimeType;
  base64: string;
}

// Feedback-specific budgets — intentionally different from gateway constants.
export const FEEDBACK_SCREENSHOT_MAX_COUNT = 3;
const FEEDBACK_SCREENSHOT_MAX_BYTES = 1.2 * 1024 * 1024; // 1.2 MiB per image (after compression)
const FEEDBACK_SCREENSHOTS_TOTAL_MAX_BYTES = 3 * 1024 * 1024; // 3 MiB total

export class FeedbackScreenshotError extends Error {
  constructor(
    message: string,
    readonly code: 'too_large' | 'read_failed' | 'too_many',
  ) {
    super(message);
    this.name = 'FeedbackScreenshotError';
  }
}

function base64DecodedLength(b64: string): number {
  const len = b64.length;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

/**
 * Converts a local image URI to a JPEG, downscaling if needed to stay
 * within the per-image budget. Always produces JPEG for consistent
 * worker-side magic-byte validation.
 */
async function compressScreenshot(uri: string): Promise<string> {
  const info = await getInfoAsync(uri);
  if (!info.exists || info.isDirectory) {
    throw new FeedbackScreenshotError('Screenshot file is missing', 'read_failed');
  }
  let size = info.size;

  if (size <= FEEDBACK_SCREENSHOT_MAX_BYTES) {
    // Convert to JPEG (handles HEIC, PNG, etc.) but don't resize.
    const r = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.82,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return r.uri;
  }

  // Over budget — resize progressively.
  let workUri = uri;
  let width = 1920;
  while (size > FEEDBACK_SCREENSHOT_MAX_BYTES && width >= 512) {
    const r = await ImageManipulator.manipulateAsync(workUri, [{ resize: { width } }], {
      compress: 0.78,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    workUri = r.uri;
    const next = await getInfoAsync(workUri);
    size = next.exists && !next.isDirectory ? next.size : 0;
    if (size > FEEDBACK_SCREENSHOT_MAX_BYTES) {
      width = Math.floor(width * 0.8);
    }
  }

  if (size > FEEDBACK_SCREENSHOT_MAX_BYTES) {
    throw new FeedbackScreenshotError(
      `Screenshot is too large after compression (${Math.round(size / 1024)} KB; max ${Math.round(FEEDBACK_SCREENSHOT_MAX_BYTES / 1024)} KB).`,
      'too_large',
    );
  }
  return workUri;
}

/**
 * Accepts up to FEEDBACK_SCREENSHOT_MAX_COUNT local image URIs, compresses
 * each to a feedback-appropriate JPEG, and returns ready-to-submit payloads.
 * Always allocates fresh memory — never logs or caches the base64 strings.
 */
export async function prepareFeedbackScreenshots(uris: string[]): Promise<FeedbackScreenshot[]> {
  if (uris.length === 0) return [];
  if (uris.length > FEEDBACK_SCREENSHOT_MAX_COUNT) {
    throw new FeedbackScreenshotError(
      `Maximum ${FEEDBACK_SCREENSHOT_MAX_COUNT} screenshots allowed.`,
      'too_many',
    );
  }

  let totalBytes = 0;
  const out: FeedbackScreenshot[] = [];

  for (const uri of uris) {
    const compressed = await compressScreenshot(uri);
    const b64 = await readAsStringAsync(compressed, { encoding: EncodingType.Base64 });
    const decodedLen = base64DecodedLength(b64);

    if (totalBytes + decodedLen > FEEDBACK_SCREENSHOTS_TOTAL_MAX_BYTES) {
      throw new FeedbackScreenshotError(
        'Total screenshot size is too large. Remove a screenshot and try again.',
        'too_large',
      );
    }
    totalBytes += decodedLen;
    out.push({ mimeType: 'image/jpeg', base64: b64 });
  }

  return out;
}
