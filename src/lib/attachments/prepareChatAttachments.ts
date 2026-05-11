import * as ImageManipulator from 'expo-image-manipulator';
import { EncodingType, getInfoAsync, readAsStringAsync } from 'expo-file-system/legacy';

import {
  GATEWAY_ATTACHMENT_MAX_BYTES,
  GATEWAY_ATTACHMENTS_TOTAL_MAX_BYTES,
} from '@/constants/attachmentsGateway';
import type { ChatAttachmentInput } from '@/lib/openclaw/chat';

/** Narrow shape so hooks avoid importing UI modules. */
export interface PrepareAttachmentInput {
  id: string;
  name: string;
  type: 'image' | 'file' | 'video' | 'audio';
  uri: string;
  mimeType?: string;
}

export type AttachmentPrepareErrorCode =
  | 'invalid_data_uri'
  | 'unsupported_scheme'
  | 'image_missing'
  | 'image_compress_failed'
  | 'image_too_large_after_compression'
  | 'file_no_location'
  | 'file_too_large'
  | 'attachment_size_exceeded'
  | 'total_size_exceeded';

export class AttachmentPrepareError extends Error {
  readonly params?: Record<string, string | number>;

  constructor(
    message: string,
    readonly code: AttachmentPrepareErrorCode,
    params?: Record<string, string | number>,
  ) {
    super(message);
    this.name = 'AttachmentPrepareError';
    this.params = params;
  }
}

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.zip': 'application/zip',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

export function guessMimeType(fileName: string, uri: string, kind: PrepareAttachmentInput['type']): string {
  const lower = fileName.toLowerCase();
  for (const [ext, mime] of Object.entries(EXT_MIME)) {
    if (lower.endsWith(ext)) {
      return mime;
    }
  }
  const u = uri.toLowerCase();
  if (u.includes('mime=image')) return 'image/jpeg';
  if (kind === 'image') return 'image/jpeg';
  if (kind === 'video') return 'video/mp4';
  if (kind === 'audio') return 'audio/mp4';
  return 'application/octet-stream';
}

function parseDataUri(dataUri: string): { mimeType: string; base64: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUri.trim());
  const mimeType = m?.[1];
  const payload = m?.[2];
  if (!mimeType || payload === undefined) {
    return null;
  }
  return { mimeType, base64: payload.replace(/\s/g, '') };
}

function base64DecodedLength(b64: string): number {
  const len = b64.length;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

async function fileSizeBytes(uri: string): Promise<number> {
  if (uri.startsWith('data:')) {
    const p = parseDataUri(uri);
    if (!p) {
      return 0;
    }
    return base64DecodedLength(p.base64);
  }
  const info = await getInfoAsync(uri);
  if (!info.exists || info.isDirectory) {
    return 0;
  }
  return info.size;
}

async function readFileAsRawBase64(uri: string): Promise<{ base64: string; mimeOverride?: string }> {
  if (uri.startsWith('data:')) {
    const p = parseDataUri(uri);
    if (!p) {
      throw new AttachmentPrepareError('Invalid data URI', 'invalid_data_uri');
    }
    return { base64: p.base64, mimeOverride: p.mimeType };
  }
  if (!uri.startsWith('file://') && !uri.startsWith('content://')) {
    throw new AttachmentPrepareError('Attachment must use a local file or data URI', 'unsupported_scheme');
  }
  const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  return { base64: b64 };
}

async function shrinkImageToBudget(uri: string, maxBytes: number): Promise<{ uri: string; mimeType: string }> {
  let workUri = uri;
  let info = await getInfoAsync(workUri);
  if (!info.exists || info.isDirectory) {
    throw new AttachmentPrepareError('Image file is missing', 'image_missing');
  }
  let size = info.size;
  let width = 2048;
  while (size > maxBytes && width >= 512) {
    const result = await ImageManipulator.manipulateAsync(
      workUri,
      [{ resize: { width } }],
      { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG },
    );
    workUri = result.uri;
    const next = await getInfoAsync(workUri);
    if (!next.exists || next.isDirectory) {
      throw new AttachmentPrepareError('Could not compress image', 'image_compress_failed');
    }
    size = next.size;
    if (size > maxBytes) {
      width = Math.floor(width * 0.82);
    }
  }
  if (size > maxBytes) {
    const sizeKB = Math.round(size / 1024);
    const limitKB = Math.round(maxBytes / 1024);
    throw new AttachmentPrepareError(
      `Image is still too large after compression (${sizeKB} KB; max ${limitKB} KB).`,
      'image_too_large_after_compression',
      { sizeKB, limitKB },
    );
  }
  return { uri: workUri, mimeType: 'image/jpeg' };
}

function chatTypeForMime(mime: string, kind: PrepareAttachmentInput['type']): string | undefined {
  if (mime.startsWith('image/')) {
    return 'image';
  }
  if (kind === 'video' || mime.startsWith('video/')) {
    return 'video';
  }
  if (kind === 'audio' || mime.startsWith('audio/')) {
    return 'audio';
  }
  return undefined;
}

/**
 * Reads local attachment URIs, applies size limits and optional image downscale,
 * and returns gateway `chat.send` attachment objects (`content` = raw base64).
 */
export async function prepareChatAttachmentsFromInput(
  items: PrepareAttachmentInput[],
): Promise<ChatAttachmentInput[]> {
  if (items.length === 0) {
    return [];
  }

  let totalDecoded = 0;
  const out: ChatAttachmentInput[] = [];

  for (const item of items) {
    if (!item.uri) {
      throw new AttachmentPrepareError(`"${item.name}" has no file location`, 'file_no_location', { name: item.name });
    }

    let workUri = item.uri;
    let mimeType = item.mimeType?.trim() || guessMimeType(item.name, item.uri, item.type);

    const isRasterImage =
      item.type === 'image' ||
      (mimeType.startsWith('image/') &&
        !mimeType.includes('svg') &&
        (workUri.startsWith('file://') || workUri.startsWith('content://')));

    if (isRasterImage && (workUri.startsWith('file://') || workUri.startsWith('content://'))) {
      const sz = await fileSizeBytes(workUri);
      if (sz > GATEWAY_ATTACHMENT_MAX_BYTES) {
        const shrunk = await shrinkImageToBudget(workUri, GATEWAY_ATTACHMENT_MAX_BYTES);
        workUri = shrunk.uri;
        mimeType = shrunk.mimeType;
      }
    } else {
      const sz = await fileSizeBytes(workUri);
      if (sz > GATEWAY_ATTACHMENT_MAX_BYTES) {
        const sizeKB = Math.round(sz / 1024);
        const limitKB = Math.round(GATEWAY_ATTACHMENT_MAX_BYTES / 1024);
        throw new AttachmentPrepareError(
          `"${item.name}" is too large (${sizeKB} KB). Max per file is ${limitKB} KB.`,
          'file_too_large',
          { name: item.name, sizeKB, limitKB },
        );
      }
    }

    const { base64, mimeOverride } = await readFileAsRawBase64(workUri);
    if (mimeOverride) {
      mimeType = mimeOverride;
    }

    const decodedLen = base64DecodedLength(base64);
    if (decodedLen > GATEWAY_ATTACHMENT_MAX_BYTES) {
      throw new AttachmentPrepareError(
        `"${item.name}" exceeds the maximum attachment size.`,
        'attachment_size_exceeded',
        { name: item.name },
      );
    }
    if (totalDecoded + decodedLen > GATEWAY_ATTACHMENTS_TOTAL_MAX_BYTES) {
      throw new AttachmentPrepareError(
        'Total attachment size for this message is too large. Remove some files and try again.',
        'total_size_exceeded',
      );
    }
    totalDecoded += decodedLen;

    const type = chatTypeForMime(mimeType, item.type);
    out.push({
      type,
      mimeType,
      fileName: item.name,
      content: base64,
    });
  }

  return out;
}

/**
 * Normalizes a clipboard `data:image/...;base64,...` to a local JPEG file URI for previews + send pipeline.
 */
export async function writeClipboardDataImageToCache(dataUri: string): Promise<string> {
  const parsed = parseDataUri(dataUri);
  if (!parsed) {
    throw new AttachmentPrepareError('Clipboard does not contain a valid image', 'invalid_data_uri');
  }
  const manip = await ImageManipulator.manipulateAsync(
    dataUri,
    [],
    {
      compress: 0.85,
      format: parsed.mimeType.includes('png')
        ? ImageManipulator.SaveFormat.PNG
        : ImageManipulator.SaveFormat.JPEG,
    },
  );
  return manip.uri;
}
