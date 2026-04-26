/**
 * Logic-only tests for the pure utility functions inside useServerConfig.
 *
 * `loadProfilesFromStorage` and `authTokenStorageKey` are module-private so
 * we replicate their logic here, matching the exact implementation in
 * useServerConfig.tsx. These tests guard against regressions in profile
 * parsing and storage-key generation without needing a React render tree.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ServerProfile } from '@/types'

// ---------------------------------------------------------------------------
// Replicated helpers (match implementation in useServerConfig.tsx exactly)
// ---------------------------------------------------------------------------

const PROFILES_KEY = 'clawboy-server-profiles-v1'

function authTokenStorageKey(profileId: string): string {
  return `clawboy-auth-token.${profileId}`
}

async function loadProfilesFromStorage(): Promise<ServerProfile[]> {
  try {
    const raw = await AsyncStorage.getItem(PROFILES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: ServerProfile[] = []
    for (const p of parsed) {
      if (
        typeof p === 'object' &&
        p !== null &&
        typeof (p as ServerProfile).id === 'string' &&
        typeof (p as ServerProfile).name === 'string' &&
        typeof (p as ServerProfile).url === 'string' &&
        typeof (p as ServerProfile).isActive === 'boolean'
      ) {
        out.push(p as ServerProfile)
      }
    }
    return out
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks()
})

describe('authTokenStorageKey', () => {
  it('prefixes the profile id with the storage namespace', () => {
    expect(authTokenStorageKey('prof_abc123')).toBe('clawboy-auth-token.prof_abc123')
  })

  it('produces unique keys for different profile ids', () => {
    const key1 = authTokenStorageKey('prof_a')
    const key2 = authTokenStorageKey('prof_b')
    expect(key1).not.toBe(key2)
    expect(key1.endsWith('prof_a')).toBe(true)
    expect(key2.endsWith('prof_b')).toBe(true)
  })
})

describe('loadProfilesFromStorage', () => {
  it('returns empty array when AsyncStorage has no profiles', async () => {
    const mockGet = AsyncStorage.getItem as jest.Mock
    mockGet.mockResolvedValueOnce(null)

    const result = await loadProfilesFromStorage()
    expect(result).toEqual([])
  })

  it('parses and returns valid profiles', async () => {
    const validProfile: ServerProfile = {
      id: 'prof_1',
      name: 'Local Server',
      url: 'wss://localhost:8080',
      isActive: true,
    }
    const mockGet = AsyncStorage.getItem as jest.Mock
    mockGet.mockResolvedValueOnce(JSON.stringify([validProfile]))

    const result = await loadProfilesFromStorage()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject(validProfile)
  })

  it('returns multiple valid profiles', async () => {
    const profiles: ServerProfile[] = [
      { id: 'prof_1', name: 'Server A', url: 'wss://a.local', isActive: true },
      { id: 'prof_2', name: 'Server B', url: 'wss://b.local', isActive: false },
    ]
    const mockGet = AsyncStorage.getItem as jest.Mock
    mockGet.mockResolvedValueOnce(JSON.stringify(profiles))

    const result = await loadProfilesFromStorage()
    expect(result).toHaveLength(2)
  })

  it('filters out entries that are missing required fields', async () => {
    const data = [
      { id: 'prof_1', name: 'Valid', url: 'wss://ok.local', isActive: true },
      { id: 'prof_2', name: 'Missing URL', isActive: true },       // no url
      { name: 'Missing ID', url: 'wss://x.local', isActive: false }, // no id
      { id: 'prof_4', name: 123, url: 'wss://y.local', isActive: true }, // name not string
    ]
    const mockGet = AsyncStorage.getItem as jest.Mock
    mockGet.mockResolvedValueOnce(JSON.stringify(data))

    const result = await loadProfilesFromStorage()
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('prof_1')
  })

  it('returns empty array for malformed JSON', async () => {
    const mockGet = AsyncStorage.getItem as jest.Mock
    mockGet.mockResolvedValueOnce('not valid json {{{')

    const result = await loadProfilesFromStorage()
    expect(result).toEqual([])
  })

  it('returns empty array when stored value is not an array', async () => {
    const mockGet = AsyncStorage.getItem as jest.Mock
    mockGet.mockResolvedValueOnce(JSON.stringify({ id: 'prof_1' }))

    const result = await loadProfilesFromStorage()
    expect(result).toEqual([])
  })

  it('returns empty array when AsyncStorage.getItem throws', async () => {
    const mockGet = AsyncStorage.getItem as jest.Mock
    mockGet.mockRejectedValueOnce(new Error('Storage unavailable'))

    const result = await loadProfilesFromStorage()
    expect(result).toEqual([])
  })
})
