/**
 * Crypto polyfill for Hermes (React Native).
 *
 * Hermes ships `globalThis.crypto.getRandomValues` but NOT `crypto.subtle`.
 * @noble/ed25519 v3 requires an external SHA-512 implementation when subtle
 * is absent. We wire expo-crypto's native-backed digest here.
 *
 * MUST be imported (side-effect) before any @noble/ed25519 call.
 */
import { hashes } from '@noble/ed25519';
import {
  CryptoDigestAlgorithm,
  digest as expoDigest,
  getRandomBytes as expoGetRandomBytes,
} from 'expo-crypto';

// Wire SHA-512 into noble's hash slot. Both keygenAsync and signAsync use this.
(hashes as Record<string, unknown>).sha512Async = async (message: Uint8Array): Promise<Uint8Array> => {
  const buf = await expoDigest(CryptoDigestAlgorithm.SHA512, message as unknown as BufferSource);
  return new Uint8Array(buf);
};

/**
 * SHA-256 of raw bytes → lowercase hex string.
 * Uses expo-crypto's native digest, works on Hermes without crypto.subtle.
 */
export async function digestSha256Hex(data: Uint8Array): Promise<string> {
  const buf = await expoDigest(CryptoDigestAlgorithm.SHA256, data as unknown as BufferSource);
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Cryptographically secure random bytes via expo-crypto.
 * expo-crypto.getRandomBytes is limited to 1024 bytes per call — fine for
 * a 32-byte Ed25519 seed.
 */
export function secureRandomBytes(length: number): Uint8Array {
  return expoGetRandomBytes(length);
}
