// Device identity — Ed25519 keypair in SecureStore + gateway challenge signing (OpenClaw).

import * as ed25519 from '@noble/ed25519'
import * as SecureStore from 'expo-secure-store'
import * as Device from 'expo-device'
import {
  OPENCLAW_CLIENT_ID,
  OPENCLAW_CLIENT_MODE,
  OPENCLAW_ROLE
} from './appMeta'

const IDENTITY_KEY = 'clawboy-device-identity'
const DEVICE_TOKEN_PREFIX = 'clawboy-device-token:'

/** True when running on a physical device (false in many simulators / emulators). */
export function isPhysicalDevice(): boolean {
  return Device.isDevice
}

export interface DeviceConnectField {
  id: string
  publicKey: string
  signature: string
  signedAt: number
  nonce: string
}

export type DeviceIdentity =
  | {
      readonly cryptoBackend: 'webcrypto'
      id: string
      publicKeyBase64url: string
      privateKeyJwk: JsonWebKey
    }
  | {
      readonly cryptoBackend: 'noble'
      id: string
      publicKeyBase64url: string
      /** 32-byte seed, base64url — stored only in SecureStore. */
      nobleSecretKeyBase64url: string
    }

function toBase64url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0')
  }
  return hex
}

async function secureGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key)
  } catch {
    return null
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value)
}

async function secureRemove(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key)
  } catch {
    /* ignore */
  }
}

async function digestSha256(data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('Web Crypto is not available')
  }
  const hash = await subtle.digest('SHA-256', data as BufferSource)
  return toHex(hash)
}

async function isWebCryptoEd25519Available(): Promise<boolean> {
  try {
    const subtle = globalThis.crypto?.subtle
    if (!subtle) return false
    const testKey = await subtle.generateKey('Ed25519', true, ['sign', 'verify'])
    await subtle.exportKey('raw', (testKey as CryptoKeyPair).publicKey)
    return true
  } catch {
    return false
  }
}

function parseStoredIdentity(stored: string): DeviceIdentity | null {
  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>
    const id = parsed.id
    const publicKeyBase64url = parsed.publicKeyBase64url
    if (typeof id !== 'string' || typeof publicKeyBase64url !== 'string') {
      return null
    }

    if (parsed.cryptoBackend === 'noble' && typeof parsed.nobleSecretKeyBase64url === 'string') {
      return {
        cryptoBackend: 'noble',
        id,
        publicKeyBase64url,
        nobleSecretKeyBase64url: parsed.nobleSecretKeyBase64url
      }
    }

    const jwk = parsed.privateKeyJwk
    if (jwk && typeof jwk === 'object') {
      return {
        cryptoBackend: 'webcrypto',
        id,
        publicKeyBase64url,
        privateKeyJwk: jwk as JsonWebKey
      }
    }
  } catch {
    /* corrupt */
  }
  return null
}

async function createIdentityWebCrypto(): Promise<DeviceIdentity> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('Web Crypto is not available')
  }
  const keyPair = (await subtle.generateKey('Ed25519', true, [
    'sign',
    'verify'
  ])) as CryptoKeyPair

  const publicKeyRaw = await subtle.exportKey('raw', keyPair.publicKey)
  const publicKeyU8 = new Uint8Array(publicKeyRaw)
  const publicKeyBase64url = toBase64url(publicKeyU8)
  const id = await digestSha256(publicKeyU8)
  const privateKeyJwk = (await subtle.exportKey('jwk', keyPair.privateKey)) as JsonWebKey

  return {
    cryptoBackend: 'webcrypto',
    id,
    publicKeyBase64url,
    privateKeyJwk
  }
}

async function createIdentityNoble(): Promise<DeviceIdentity> {
  try {
    const { secretKey, publicKey } = await ed25519.keygenAsync()
    const publicKeyBase64url = toBase64url(publicKey)
    const id = await digestSha256(publicKey)
    return {
      cryptoBackend: 'noble',
      id,
      publicKeyBase64url,
      nobleSecretKeyBase64url: toBase64url(secretKey)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    throw new Error(`Noble Ed25519 keygen failed: ${message}`)
  }
}

export async function clearDeviceIdentity(): Promise<void> {
  await secureRemove(IDENTITY_KEY)
}

/**
 * Stable device id from the Ed25519 identity (SHA-256 of public key, hex).
 * Null if no identity exists and none can be created.
 */
export async function getDeviceId(): Promise<string | null> {
  const identity = await getOrCreateDeviceIdentity()
  return identity?.id ?? null
}

export async function getOrCreateDeviceIdentity(): Promise<DeviceIdentity | null> {
  try {
    const existing = await secureGet(IDENTITY_KEY)
    if (existing) {
      const identity = parseStoredIdentity(existing)
      if (identity) {
        return identity
      }
    }
  } catch {
    /* regenerate */
  }

  const useWebCrypto = await isWebCryptoEd25519Available()
  try {
    const identity = useWebCrypto
      ? await createIdentityWebCrypto()
      : await createIdentityNoble()

    await secureSet(IDENTITY_KEY, JSON.stringify(identity))
    return identity
  } catch {
    return null
  }
}

export async function signChallenge(
  identity: DeviceIdentity,
  nonce: string,
  token: string,
  scopes: string[],
  overrides?: { clientId?: string; clientMode?: string; role?: string }
): Promise<DeviceConnectField> {
  const signedAt = Date.now()
  const clientId = overrides?.clientId ?? OPENCLAW_CLIENT_ID
  const clientMode = overrides?.clientMode ?? OPENCLAW_CLIENT_MODE
  const role = overrides?.role ?? OPENCLAW_ROLE
  const scopesStr = scopes.join(',')
  const payload = `v2|${identity.id}|${clientId}|${clientMode}|${role}|${scopesStr}|${signedAt}|${token}|${nonce}`

  let signature: string

  if (identity.cryptoBackend === 'webcrypto') {
    try {
      const subtle = globalThis.crypto?.subtle
      if (!subtle) {
        throw new Error('Web Crypto is not available')
      }
      const privateKey = await subtle.importKey(
        'jwk',
        identity.privateKeyJwk,
        'Ed25519',
        false,
        ['sign']
      )
      const encoded = new TextEncoder().encode(payload)
      const signatureRaw = await subtle.sign('Ed25519', privateKey, encoded)
      signature = toBase64url(signatureRaw)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error'
      throw new Error(`Web Crypto signing failed: ${message}`)
    }
  } else {
    try {
      const secretKey = fromBase64url(identity.nobleSecretKeyBase64url)
      const encoded = new TextEncoder().encode(payload)
      const signatureRaw = await ed25519.signAsync(encoded, secretKey)
      signature = toBase64url(signatureRaw)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error'
      throw new Error(`Ed25519 signing failed: ${message}`)
    }
  }

  return {
    id: identity.id,
    publicKey: identity.publicKeyBase64url,
    signature,
    signedAt,
    nonce
  }
}

function deviceTokenKey(serverHost: string, role?: string): string {
  if (role && role !== 'operator') {
    return `${DEVICE_TOKEN_PREFIX}${serverHost}:${role}`
  }
  return `${DEVICE_TOKEN_PREFIX}${serverHost}`
}

export async function getDeviceToken(serverHost: string, role?: string): Promise<string | null> {
  return secureGet(deviceTokenKey(serverHost, role))
}

export async function saveDeviceToken(serverHost: string, token: string, role?: string): Promise<void> {
  await secureSet(deviceTokenKey(serverHost, role), token)
}

export async function clearDeviceToken(serverHost: string, role?: string): Promise<void> {
  await secureRemove(deviceTokenKey(serverHost, role))
}
