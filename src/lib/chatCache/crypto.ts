import { gcm } from '@noble/ciphers/aes.js';
import * as SecureStore from 'expo-secure-store';
import { getRandomBytesAsync } from 'expo-crypto';

import { bytesToHex, hexToBytes } from '@/lib/chatCache/bytes';

const SECURE_KEY_NAME = 'clawboy-chat-cache-aes-key-v1';
const IV_LENGTH = 12;

async function getOrCreateAes256Key(): Promise<Uint8Array> {
  const existing = await SecureStore.getItemAsync(SECURE_KEY_NAME);
  if (existing) {
    return hexToBytes(existing);
  }
  const raw = new Uint8Array(await getRandomBytesAsync(32));
  await SecureStore.setItemAsync(SECURE_KEY_NAME, bytesToHex(raw));
  return raw;
}

async function getExistingAes256Key(): Promise<Uint8Array | null> {
  const existing = await SecureStore.getItemAsync(SECURE_KEY_NAME);
  if (!existing) {
    return null;
  }
  try {
    return hexToBytes(existing);
  } catch {
    return null;
  }
}

/**
 * AES-256-GCM seal: `iv (12) || ciphertext || tag (16)`.
 * Uses @noble/ciphers because Hermes does not expose `crypto.subtle`.
 */
export async function sealBytes(plaintext: Uint8Array): Promise<Uint8Array> {
  const key = await getOrCreateAes256Key();
  const iv = new Uint8Array(await getRandomBytesAsync(IV_LENGTH));
  const cipher = gcm(key, iv);
  const sealed = cipher.encrypt(plaintext);
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv, 0);
  out.set(sealed, iv.length);
  return out;
}

export async function openBytes(packet: Uint8Array): Promise<Uint8Array | null> {
  if (packet.length < IV_LENGTH + 17) {
    return null;
  }
  const key = await getExistingAes256Key();
  if (!key) {
    return null;
  }
  const iv = packet.subarray(0, IV_LENGTH);
  const sealed = packet.subarray(IV_LENGTH);
  try {
    const cipher = gcm(key, iv);
    return cipher.decrypt(sealed);
  } catch {
    return null;
  }
}
