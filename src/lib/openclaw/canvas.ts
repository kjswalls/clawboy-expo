// OpenClaw Client - Canvas API Methods

import type { RpcCaller } from './types'

/**
 * Refresh canvas capability token (for future use with scoped access).
 * Currently not needed for operator connections where canvasHostUrl is directly usable.
 */
export async function refreshCanvasCapability(call: RpcCaller): Promise<void> {
  await call('node.canvas.capability.refresh')
}

/**
 * Build the full canvas URL from the canvasHostUrl provided in hello-ok.
 * The canvas host serves its UI at /__openclaw__/canvas/.
 */
export function buildCanvasUrl(baseUrl: string): string {
  return baseUrl.replace(/\/?$/, '') + '/__openclaw__/canvas/'
}
