/**
 * Custom Supabase Storage adapter backed by expo-secure-store.
 *
 * Supabase's default adapter uses localStorage / AsyncStorage, which stores
 * tokens in plaintext.  The access and refresh tokens are bearer credentials
 * for our cloud account and MUST live in the OS keychain.
 *
 * expo-secure-store is synchronous on iOS (Keychain) and Android (EncryptedSharedPreferences).
 * Supabase's Storage interface expects synchronous getItem/setItem/removeItem, so this
 * adapter maps directly with no async wrappers.
 *
 * Note: expo-secure-store has a 2 KB value limit per key on some platforms.
 * If a token exceeds this (rare) we chunk it across multiple keys.
 */

import * as SecureStore from 'expo-secure-store';
import type { SupportedStorage } from '@supabase/supabase-js';

const KEY_PREFIX = 'clawboy_sb_';
const CHUNK_SIZE = 1800; // bytes — safely under the 2 048-byte limit

function toKey(key: string): string {
  // Supabase keys can contain dots/dashes; SecureStore keys must match [a-zA-Z0-9._-]
  return KEY_PREFIX + key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function chunkKey(base: string, n: number): string {
  return `${base}_chunk_${n}`;
}

export const supabaseSecureStorage: SupportedStorage = {
  getItem(key: string): string | null {
    const baseKey = toKey(key);
    try {
      const value = SecureStore.getItem(baseKey);
      if (value === null) return null;

      // Check for chunked value
      if (value.startsWith('__chunked:')) {
        const count = parseInt(value.slice(10), 10);
        let assembled = '';
        for (let i = 0; i < count; i++) {
          assembled += SecureStore.getItem(chunkKey(baseKey, i)) ?? '';
        }
        return assembled;
      }

      return value;
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    const baseKey = toKey(key);
    try {
      if (value.length <= CHUNK_SIZE) {
        SecureStore.setItem(baseKey, value);
        return;
      }

      // Chunk large values
      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE));
      }
      SecureStore.setItem(baseKey, `__chunked:${chunks.length}`);
      chunks.forEach((chunk, i) => {
        SecureStore.setItem(chunkKey(baseKey, i), chunk);
      });
    } catch {
      // Storage failures must not crash the app — auth will degrade gracefully.
    }
  },

  async removeItem(key: string): Promise<void> {
    const baseKey = toKey(key);
    try {
      const existing = SecureStore.getItem(baseKey);
      if (existing?.startsWith('__chunked:')) {
        const count = parseInt(existing.slice(10), 10);
        for (let i = 0; i < count; i++) {
          await SecureStore.deleteItemAsync(chunkKey(baseKey, i));
        }
      }
      await SecureStore.deleteItemAsync(baseKey);
    } catch {
      // Best-effort cleanup.
    }
  },
};
