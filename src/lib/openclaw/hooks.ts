// OpenClaw Client - Hooks API Methods
// Hooks are config-based (no dedicated RPC) — uses config.get/config.patch

import type { Hook, HooksConfig, RpcCaller } from './types'
import { getServerConfig, patchServerConfig } from './config'

export interface HooksState {
  hooks: Hook[]
  hooksConfig: HooksConfig
  configHash: string
}

export async function fetchHooks(call: RpcCaller): Promise<HooksState> {
  try {
    const { config, hash } = await getServerConfig(call)
    const hooksConfig: HooksConfig = config?.hooks ?? {}
    const internalEntries = hooksConfig.internal?.entries ?? {}

    const hooks: Hook[] = Object.entries(internalEntries).map(([key, entry]: [string, any]) => ({
      id: key,
      name: key,
      enabled: entry.enabled !== false,
      events: Array.isArray(entry.events) ? entry.events : [],
      description: typeof entry.description === 'string' ? entry.description : '',
      emoji: typeof entry.emoji === 'string' ? entry.emoji : undefined,
      source: typeof entry.source === 'string' ? entry.source as Hook['source'] : undefined,
      filePath: typeof entry.filePath === 'string' ? entry.filePath : undefined,
      env: entry.env && typeof entry.env === 'object' ? entry.env : undefined,
      always: typeof entry.always === 'boolean' ? entry.always : undefined,
      eligible: typeof entry.eligible === 'boolean' ? entry.eligible : undefined,
      requirements: entry.requirements,
      missing: entry.missing
    }))

    return { hooks, hooksConfig, configHash: hash }
  } catch {
    return { hooks: [], hooksConfig: {}, configHash: '' }
  }
}

export async function toggleHookEnabled(
  call: RpcCaller,
  hookId: string,
  enabled: boolean
): Promise<void> {
  const { hash } = await getServerConfig(call)
  const patch = {
    hooks: {
      internal: {
        entries: {
          [hookId]: { enabled }
        }
      }
    }
  }
  await patchServerConfig(call, patch, hash)
}

export async function toggleInternalHooksEnabled(
  call: RpcCaller,
  enabled: boolean
): Promise<void> {
  const { hash } = await getServerConfig(call)
  const patch = {
    hooks: {
      internal: { enabled }
    }
  }
  await patchServerConfig(call, patch, hash)
}

export async function updateHookEnv(
  call: RpcCaller,
  hookId: string,
  env: Record<string, string>
): Promise<void> {
  const { hash } = await getServerConfig(call)
  const patch = {
    hooks: {
      internal: {
        entries: {
          [hookId]: { env }
        }
      }
    }
  }
  await patchServerConfig(call, patch, hash)
}
