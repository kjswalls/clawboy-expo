// Device identity — Ed25519 keypair in SecureStore + gateway challenge signing (OpenClaw).
// MUST import crypto-polyfill first: wires expo-crypto SHA-512 into @noble/ed25519.
import './crypto-polyfill';
import { digestSha256Hex, secureRandomBytes } from './crypto-polyfill';

import * as ed25519 from '@noble/ed25519';
import * as SecureStore from 'expo-secure-store';
import {
  OPENCLAW_CLIENT_ID,
  OPENCLAW_CLIENT_MODE,
  OPENCLAW_ROLE,
} from './appMeta';

const IDENTITY_KEY = 'clawboy-device-identity';
const DEVICE_TOKEN_PREFIX = 'clawboy-device-token.';

export interface DeviceConnectField {
  id: string;
  publicKey: string;
  signature: string;
  signedAt: number;
  nonce: string;
}

export interface DeviceIdentity {
  readonly cryptoBackend: 'noble';
  id: string;
  publicKeyBase64url: string;
  /** 32-byte seed, base64url — stored only in SecureStore. */
  nobleSecretKeyBase64url: string;
}

function toBase64url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function secureGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

async function secureRemove(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* ignore */
  }
}

function parseStoredIdentity(stored: string): DeviceIdentity | null {
  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    const { id, publicKeyBase64url, nobleSecretKeyBase64url, cryptoBackend } = parsed;

    if (
      typeof id !== 'string' ||
      typeof publicKeyBase64url !== 'string' ||
      typeof nobleSecretKeyBase64url !== 'string' ||
      cryptoBackend !== 'noble'
    ) {
      return null;
    }

    return { cryptoBackend: 'noble', id, publicKeyBase64url, nobleSecretKeyBase64url };
  } catch {
    return null;
  }
}

async function createIdentity(): Promise<DeviceIdentity> {
  const seed = secureRandomBytes(32);
  const { secretKey, publicKey } = await ed25519.keygenAsync(seed);
  const publicKeyBase64url = toBase64url(publicKey);
  const id = await digestSha256Hex(publicKey);
  return {
    cryptoBackend: 'noble',
    id,
    publicKeyBase64url,
    nobleSecretKeyBase64url: toBase64url(secretKey),
  };
}

export async function clearDeviceIdentity(): Promise<void> {
  await secureRemove(IDENTITY_KEY);
}

/**
 * Format a 64-char hex SHA-256 string into 4-char space-separated groups for readability.
 * e.g. "a1b2c3d4…" → "a1b2 c3d4 …"
 */
export function formatDeviceFingerprint(hex: string): string {
  return hex.match(/.{1,4}/g)?.join(' ') ?? hex;
}

/**
 * Returns this device's Ed25519 public key as a SHA-256 fingerprint,
 * formatted in 4-char groups (e.g. "a1b2 c3d4 …").
 * Null if no identity can be created or loaded.
 */
export async function getDevicePublicKeyFingerprint(): Promise<string | null> {
  const identity = await getOrCreateDeviceIdentity();
  if (!identity) return null;
  return formatDeviceFingerprint(identity.id);
}

/**
 * Stable device id from the Ed25519 identity (SHA-256 of public key, hex).
 * Null if no identity exists and none can be created.
 */
export async function getDeviceId(): Promise<string | null> {
  const identity = await getOrCreateDeviceIdentity();
  return identity?.id ?? null;
}

export async function getOrCreateDeviceIdentity(): Promise<DeviceIdentity | null> {
  // Try loading an existing stored identity.
  try {
    const stored = await secureGet(IDENTITY_KEY);
    if (stored) {
      const identity = parseStoredIdentity(stored);
      if (identity) {
        return identity;
      }
      // Stored identity is corrupt or a legacy webcrypto format — wipe and regenerate.
      if (__DEV__) {
        console.warn('[device-identity] Stored identity unreadable; regenerating.');
      }
    }
  } catch (err) {
    if (__DEV__) {
      console.warn('[device-identity] SecureStore read failed:', err instanceof Error ? err.message : err);
    }
  }

  // Generate a fresh identity.
  try {
    const identity = await createIdentity();
    await secureSet(IDENTITY_KEY, JSON.stringify(identity));
    return identity;
  } catch (err) {
    if (__DEV__) {
      console.warn('[device-identity] Identity creation failed:', err instanceof Error ? err.message : err);
    }
    return null;
  }
}

export async function signChallenge(
  identity: DeviceIdentity,
  nonce: string,
  token: string,
  scopes: string[],
  overrides?: { clientId?: string; clientMode?: string; role?: string }
): Promise<DeviceConnectField> {
  const signedAt = Date.now();
  const clientId = overrides?.clientId ?? OPENCLAW_CLIENT_ID;
  const clientMode = overrides?.clientMode ?? OPENCLAW_CLIENT_MODE;
  const role = overrides?.role ?? OPENCLAW_ROLE;
  const scopesStr = scopes.join(',');
  const payload = `v2|${identity.id}|${clientId}|${clientMode}|${role}|${scopesStr}|${signedAt}|${token}|${nonce}`;

  const secretKey = fromBase64url(identity.nobleSecretKeyBase64url);
  const encoded = new TextEncoder().encode(payload);
  const signatureRaw = await ed25519.signAsync(encoded, secretKey);
  const signature = toBase64url(signatureRaw);

  return {
    id: identity.id,
    publicKey: identity.publicKeyBase64url,
    signature,
    signedAt,
    nonce,
  };
}

/** Replace characters not allowed in SecureStore keys with underscores. */
function sanitizeKeySegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function deviceTokenKey(serverHost: string, role?: string): string {
  const host = sanitizeKeySegment(serverHost);
  if (role && role !== 'operator') {
    return `${DEVICE_TOKEN_PREFIX}${host}.${sanitizeKeySegment(role)}`;
  }
  return `${DEVICE_TOKEN_PREFIX}${host}`;
}

export async function getDeviceToken(serverHost: string, role?: string): Promise<string | null> {
  return secureGet(deviceTokenKey(serverHost, role));
}

export async function saveDeviceToken(serverHost: string, token: string, role?: string): Promise<void> {
  await secureSet(deviceTokenKey(serverHost, role), token);
}

export async function clearDeviceToken(serverHost: string, role?: string): Promise<void> {
  await secureRemove(deviceTokenKey(serverHost, role));
}
