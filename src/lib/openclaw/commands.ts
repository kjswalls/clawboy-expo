// OpenClaw Client - Commands API

import type { RpcCaller } from './types'

export interface CommandEntry {
  key: string
  name?: string
  textAliases?: string[]
  description?: string
  category?: string
  tier?: string
  args?: Array<{
    name: string
    required?: boolean
    choices?: Array<string | { value: string; label: string }>
  }>
}

export interface CommandsListResult {
  commands: CommandEntry[]
}

export interface ListCommandsParams {
  agentId?: string | null
  scope?: 'text' | 'all'
  includeArgs?: boolean
}

/**
 * Fetch the agent-aware command list from the gateway.
 * Returns the raw commands array for the caller to merge with built-ins.
 * Throws if the RPC fails (caller should handle with try/catch and fall back to built-ins).
 */
export async function listCommands(
  caller: RpcCaller,
  params: ListCommandsParams = {},
): Promise<CommandEntry[]> {
  const reqParams: Record<string, unknown> = {
    scope: params.scope ?? 'text',
    includeArgs: params.includeArgs ?? true,
  }
  if (params.agentId) {
    reqParams.agentId = params.agentId
  }
  const result = await caller<CommandsListResult>('commands.list', reqParams)
  const commands = result?.commands
  if (!Array.isArray(commands)) return []
  return commands.filter(
    (c): c is CommandEntry => c !== null && typeof c === 'object',
  )
}
