// OpenClaw Client - Server Config API Methods

import type { RpcCaller } from './types'

/**
 * Reads the full server config via config.get.
 * Returns the raw config object and the hash needed for config.patch.
 */
export async function getServerConfig(call: RpcCaller): Promise<{ config: any; hash: string }> {
  const result = await call<any>('config.get', {})
  const config = result?.config ?? null
  const hash = result?.hash ?? ''
  return { config, hash }
}

/**
 * Patches the server config via config.patch.
 * Uses baseHash for optimistic conflict detection.
 * Note: config.patch triggers a server restart via SIGUSR1.
 *
 * Sends both `raw` (stringified JSON, for pre-3.28 servers) and `patch`
 * (direct object, for v2026.3.28+). The server uses whichever it understands.
 */
export async function patchServerConfig(call: RpcCaller, patch: object, baseHash: string): Promise<void> {
  await call<any>('config.patch', { patch, raw: JSON.stringify(patch), baseHash })
}

/**
 * Validates a config patch without applying it (v2026.3.22 dry-run).
 * Returns structured validation errors if any.
 */
export async function validateServerConfig(
  call: RpcCaller,
  patch: object,
  baseHash: string
): Promise<{ valid: boolean; errors?: Array<{ path: string; message: string }> }> {
  try {
    const result = await call<any>('config.patch', { raw: JSON.stringify(patch), baseHash, dryRun: true })
    const errors = result?.errors
    if (Array.isArray(errors) && errors.length > 0) {
      return { valid: false, errors }
    }
    return { valid: true }
  } catch (err: any) {
    return { valid: false, errors: [{ path: '', message: err?.message || 'Validation failed' }] }
  }
}
