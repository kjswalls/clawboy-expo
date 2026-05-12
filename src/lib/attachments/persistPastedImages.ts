import * as FileSystem from 'expo-file-system/legacy';

import { generateUUID } from '@/lib/openclaw/utils';
import { guessMimeType } from './prepareChatAttachments';

export interface PersistedPastedImage {
  uri: string;
  mimeType: string;
  name: string;
}

const SUPPORTED_EXTENSIONS = ['.gif', '.png', '.jpg', '.jpeg', '.heic', '.heif', '.webp'];

function extensionFromUri(uri: string): string {
  const lower = uri.toLowerCase().split('?')[0] ?? '';
  for (const ext of SUPPORTED_EXTENSIONS) {
    if (lower.endsWith(ext)) return ext;
  }
  return '.jpg';
}

/**
 * Copies temp paste URIs (from expo-paste-input) into a stable app-cache directory
 * so they survive beyond the library's temp lifetime. No re-encoding — preserves
 * GIF animation and sticker quality. The existing send pipeline handles downscaling.
 */
export async function persistPastedImageUris(
  uris: string[],
): Promise<PersistedPastedImage[]> {
  const destDir = `${FileSystem.cacheDirectory}clipboard/`;
  const dirInfo = await FileSystem.getInfoAsync(destDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
  }

  const results: PersistedPastedImage[] = [];

  for (const uri of uris) {
    const ext = extensionFromUri(uri);
    const name = `pasted-${generateUUID()}${ext}`;
    const destUri = destDir + name;
    await FileSystem.copyAsync({ from: uri, to: destUri });
    const mimeType = guessMimeType(name, destUri, 'image');
    results.push({ uri: destUri, mimeType, name });
  }

  return results;
}
