import * as FileSystem from 'expo-file-system/legacy';
import { EncodingType } from 'expo-file-system/legacy';

import { base64ToBytes, bytesToBase64 } from '@/lib/chatCache/bytes';
import { openBytes, sealBytes } from '@/lib/chatCache/crypto';
import type { CachedSessionBlob } from '@/lib/chatCache/types';
import { parseCachedSessionBlob } from '@/lib/chatCache/validateBlob';

const CACHE_SUBDIR = 'chatcache';

function documentBase(): string {
  const base = FileSystem.documentDirectory;
  if (!base) {
    throw new Error('documentDirectory is unavailable');
  }
  return base.endsWith('/') ? base : `${base}/`;
}

function cacheDirUri(): string {
  return `${documentBase()}${CACHE_SUBDIR}/`;
}

function profileFileUri(profileId: string): string {
  const safe = encodeURIComponent(profileId);
  return `${cacheDirUri()}${safe}.enc`;
}

function profileTempUri(profileId: string): string {
  const safe = encodeURIComponent(profileId);
  return `${cacheDirUri()}${safe}.enc.tmp`;
}

async function ensureCacheDir(): Promise<void> {
  const dir = cacheDirUri();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export async function writeCachedSession(profileId: string, blob: CachedSessionBlob): Promise<void> {
  const json = new TextEncoder().encode(JSON.stringify(blob));
  const sealed = await sealBytes(json);
  await ensureCacheDir();
  const tmp = profileTempUri(profileId);
  const finalUri = profileFileUri(profileId);
  const b64 = bytesToBase64(sealed);
  await FileSystem.writeAsStringAsync(tmp, b64, { encoding: EncodingType.Base64 });
  try {
    await FileSystem.deleteAsync(finalUri, { idempotent: true });
  } catch {
    /* ignore */
  }
  await FileSystem.moveAsync({ from: tmp, to: finalUri });
}

export async function readCachedSession(profileId: string): Promise<CachedSessionBlob | null> {
  const finalUri = profileFileUri(profileId);
  const info = await FileSystem.getInfoAsync(finalUri);
  if (!info.exists) {
    return null;
  }
  const b64 = await FileSystem.readAsStringAsync(finalUri, { encoding: EncodingType.Base64 });
  const packet = base64ToBytes(b64);
  const plain = await openBytes(packet);
  if (!plain) {
    await FileSystem.deleteAsync(finalUri, { idempotent: true }).catch(() => {});
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(plain)) as unknown;
  } catch {
    await FileSystem.deleteAsync(finalUri, { idempotent: true }).catch(() => {});
    return null;
  }
  return parseCachedSessionBlob(parsed, profileId);
}

export async function deleteCachedSession(profileId: string): Promise<void> {
  const finalUri = profileFileUri(profileId);
  const tmp = profileTempUri(profileId);
  await FileSystem.deleteAsync(finalUri, { idempotent: true }).catch(() => {});
  await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
}
