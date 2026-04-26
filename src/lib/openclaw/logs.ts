import type { RpcCaller } from './types'

export interface LogsTailParams {
  limit?: number
  maxBytes?: number
  cursor?: number
}

export interface LogsTailResult {
  path: string
  cursor: number
  size: number
  lines: string[]
}

export async function tailLogs(call: RpcCaller, params: LogsTailParams = {}): Promise<LogsTailResult> {
  return call<LogsTailResult>('logs.tail', {
    limit: 500,
    maxBytes: 256 * 1024,
    ...params,
  })
}
