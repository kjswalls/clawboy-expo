/**
 * Device Identity tests — Ed25519 keypair generation, signing, and storage.
 *
 * The `moduleNameMapper` in jest.config.js stubs all expo-* packages. This
 * test overrides that stub for expo-crypto and expo-secure-store to provide
 * real (or in-memory) implementations so the actual crypto logic can run.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import * as ed25519 from '@noble/ed25519'
import * as nodeCrypto from 'crypto'

// Mock the crypto-polyfill module (imported as a side-effect by device-identity.ts)
// using real Node.js crypto so noble/ed25519 can perform actual key operations.
// This bypasses the expo-crypto moduleNameMapper stub entirely.
jest.mock('../crypto-polyfill', () => {
  const nc = require('crypto') // eslint-disable-line @typescript-eslint/no-require-imports
  const ed = require('@noble/ed25519') // eslint-disable-line @typescript-eslint/no-require-imports

  // Wire real SHA-512 into noble's hash slot
  ed.hashes.sha512Async = async (msg) =>
    new Uint8Array(nc.createHash('sha512').update(Buffer.from(msg)).digest())

  return {
    digestSha256Hex: async (data) => {
      const hash = nc.createHash('sha256').update(Buffer.from(data)).digest()
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    },
    secureRandomBytes: (len) => new Uint8Array(nc.randomBytes(len)),
  }
})

// In-memory secure store — implementations wired in beforeEach so the db
// reference can be reset between tests without violating jest.mock rules.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: jest.fn(async (_algorithm: string, data: string) => {
    const nc = require('crypto') // eslint-disable-line @typescript-eslint/no-require-imports
    return nc.createHash('sha256').update(data).digest('hex')
  }),
}))

// Load the module under test AFTER mocks are declared (jest.mock is hoisted,
// so the mock factories run before the imports below are evaluated).
import * as mod from '../device-identity'

// --- In-memory store reset ------------------------------------------------

let db: Map<string, string>

beforeEach(() => {
  db = new Map()
  const ss = jest.requireMock('expo-secure-store') as {
    getItemAsync: jest.Mock
    setItemAsync: jest.Mock
    deleteItemAsync: jest.Mock
  }
  // Clear call counts from previous tests before re-wiring implementations
  ss.getItemAsync.mockClear()
  ss.setItemAsync.mockClear()
  ss.deleteItemAsync.mockClear()
  ss.getItemAsync.mockImplementation(async (key: string) => db.get(key) ?? null)
  ss.setItemAsync.mockImplementation(async (key: string, value: string) => { db.set(key, value) })
  ss.deleteItemAsync.mockImplementation(async (key: string) => { db.delete(key) })
})

// --- Tests ----------------------------------------------------------------

describe('getOrCreateDeviceIdentity', () => {
  it('generates a new Ed25519 identity when none is stored', async () => {
    const identity = await mod.getOrCreateDeviceIdentity()

    expect(identity).not.toBeNull()
    expect(identity!.cryptoBackend).toBe('noble')
    expect(typeof identity!.id).toBe('string')
    expect(identity!.id.length).toBeGreaterThan(0)
    expect(typeof identity!.publicKeyBase64url).toBe('string')
    expect(typeof identity!.nobleSecretKeyBase64url).toBe('string')
  })

  it('persists the identity to SecureStore on first call', async () => {
    const ss = jest.requireMock('expo-secure-store') as { setItemAsync: jest.Mock }
    await mod.getOrCreateDeviceIdentity()

    expect(ss.setItemAsync).toHaveBeenCalledTimes(1)
    expect(ss.setItemAsync.mock.calls[0]![0]).toBe('clawboy-device-identity')
    const storedJson = ss.setItemAsync.mock.calls[0]![1] as string
    const stored = JSON.parse(storedJson)
    expect(stored.cryptoBackend).toBe('noble')
  })

  it('returns the same identity on second call (reads from SecureStore)', async () => {
    const ss = jest.requireMock('expo-secure-store') as { setItemAsync: jest.Mock }
    const first = await mod.getOrCreateDeviceIdentity()
    const second = await mod.getOrCreateDeviceIdentity()

    expect(second).not.toBeNull()
    expect(second!.publicKeyBase64url).toBe(first!.publicKeyBase64url)
    // setItemAsync called only once — second call reads from in-memory store
    expect(ss.setItemAsync).toHaveBeenCalledTimes(1)
  })

  it('regenerates identity when stored value is malformed JSON', async () => {
    const ss = jest.requireMock('expo-secure-store') as {
      getItemAsync: jest.Mock
      setItemAsync: jest.Mock
    }
    ss.getItemAsync.mockResolvedValueOnce('not-valid-json')

    const identity = await mod.getOrCreateDeviceIdentity()
    expect(identity).not.toBeNull()
    expect(ss.setItemAsync).toHaveBeenCalledTimes(1)
  })
})

describe('getDeviceId', () => {
  it('returns a non-empty string derived from the public key', async () => {
    const id = await mod.getDeviceId()
    expect(typeof id).toBe('string')
    expect(id!.length).toBeGreaterThan(0)
  })
})

describe('signChallenge', () => {
  it('returns a DeviceConnectField whose signature verifies against the public key', async () => {
    const identity = await mod.getOrCreateDeviceIdentity()
    expect(identity).not.toBeNull()

    const nonce = 'test-nonce-xyz'
    const token = 'test-auth-token'
    const scopes = ['operator.read', 'operator.write']

    const field = await mod.signChallenge(identity!, nonce, token, scopes)

    expect(field.id).toBe(identity!.id)
    expect(field.publicKey).toBe(identity!.publicKeyBase64url)
    expect(field.nonce).toBe(nonce)
    expect(typeof field.signature).toBe('string')
    expect(field.signature.length).toBeGreaterThan(0)
    expect(typeof field.signedAt).toBe('number')

    // Decode from base64url to verify with noble
    const fromBase64url = (s: string): Uint8Array => {
      const pad = '='.repeat((4 - (s.length % 4)) % 4)
      const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
      const binary = atob(b64)
      const out = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) { out[i] = binary.charCodeAt(i) }
      return out
    }

    const publicKeyBytes = fromBase64url(identity!.publicKeyBase64url)
    const signatureBytes = fromBase64url(field.signature)
    const scopesStr = scopes.join(',')
    // Must match the format in device-identity.ts signChallenge()
    const payload = `v2|${identity!.id}|openclaw-control-ui|ui|operator|${scopesStr}|${field.signedAt}|${token}|${nonce}`
    const encoded = new TextEncoder().encode(payload)

    const valid = await ed25519.verifyAsync(signatureBytes, encoded, publicKeyBytes)
    expect(valid).toBe(true)
  })

  it('produces different signatures for different nonces', async () => {
    const identity = await mod.getOrCreateDeviceIdentity()
    expect(identity).not.toBeNull()

    const field1 = await mod.signChallenge(identity!, 'nonce-1', 'token', ['operator.read'])
    const field2 = await mod.signChallenge(identity!, 'nonce-2', 'token', ['operator.read'])

    expect(field1.signature).not.toBe(field2.signature)
  })
})

describe('clearDeviceIdentity', () => {
  it('removes the stored identity so the next call creates a fresh one', async () => {
    await mod.getOrCreateDeviceIdentity()
    expect(db.size).toBeGreaterThan(0)

    await mod.clearDeviceIdentity()
    expect(db.has('clawboy-device-identity')).toBe(false)
  })

  it('does not throw when no identity is stored', async () => {
    await expect(mod.clearDeviceIdentity()).resolves.toBeUndefined()
  })
})

describe('device token storage keys', () => {
  it('stores host keys using sha256-hash segments', async () => {
    const ss = jest.requireMock('expo-secure-store') as { setItemAsync: jest.Mock }
    await mod.saveDeviceToken('home:443', 'token-1')
    expect(ss.setItemAsync).toHaveBeenCalledTimes(1)
    const key = ss.setItemAsync.mock.calls[0]![0] as string
    expect(key).toMatch(/^clawboy-device-token\.[a-f0-9]{32}$/)
    expect(key).not.toContain('home:443')
  })

  it('does not collide keys for similar host strings', async () => {
    const ss = jest.requireMock('expo-secure-store') as { setItemAsync: jest.Mock }
    await mod.saveDeviceToken('a:b.example', 'token-1')
    await mod.saveDeviceToken('a_b.example', 'token-2')
    expect(ss.setItemAsync).toHaveBeenCalledTimes(2)
    const key1 = ss.setItemAsync.mock.calls[0]![0] as string
    const key2 = ss.setItemAsync.mock.calls[1]![0] as string
    expect(key1).not.toBe(key2)
  })
})
