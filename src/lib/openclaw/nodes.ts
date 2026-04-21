// OpenClaw Client - Node API Methods

import type { Node, RpcCaller } from './types'

export async function listNodes(call: RpcCaller): Promise<Node[]> {
  try {
    const result = await call<{ ts: number; nodes: Node[] }>('node.list', {})
    return result?.nodes ?? []
  } catch (err) {
    console.warn('[nodes] Failed to list nodes:', err)
    return []
  }
}

// --- Exec Approvals ---

export interface ExecAllowlistEntry {
  id?: string
  pattern: string
  lastUsedAt?: number
  lastUsedCommand?: string
  lastResolvedPath?: string
}

export interface ExecApprovalsDefaults {
  security?: 'deny' | 'allowlist' | 'full'
  ask?: 'off' | 'on-miss' | 'always'
  askFallback?: 'deny' | 'allowlist' | 'full'
  autoAllowSkills?: boolean
}

export interface ExecApprovalsAgent extends ExecApprovalsDefaults {
  allowlist?: ExecAllowlistEntry[]
}

export interface ExecApprovalsFile {
  version: number
  socket?: { path?: string; token?: string }
  defaults?: ExecApprovalsDefaults
  agents?: Record<string, ExecApprovalsAgent>
}

export interface ExecApprovalsResponse {
  path: string
  exists: boolean
  hash: string
  file: ExecApprovalsFile
}

export async function getExecApprovals(call: RpcCaller): Promise<ExecApprovalsResponse | null> {
  try {
    return await call<ExecApprovalsResponse>('exec.approvals.get', {})
  } catch (err) {
    console.warn('[nodes] Failed to get exec approvals:', err)
    return null
  }
}

export async function getNodeExecApprovals(call: RpcCaller, nodeId: string): Promise<ExecApprovalsResponse | null> {
  try {
    return await call<ExecApprovalsResponse>('exec.approvals.node.get', { nodeId })
  } catch (err) {
    console.warn('[nodes] Failed to get node exec approvals:', err)
    return null
  }
}

// --- Exec Approval Resolution ---

export type ExecApprovalDecision = 'allow' | 'allow-always' | 'deny'

export async function resolveExecApproval(
  call: RpcCaller,
  approvalId: string,
  decision: ExecApprovalDecision
): Promise<void> {
  await call('exec.approval.resolve', { id: approvalId, decision })
}

// --- Device Pairing ---

export interface DeviceTokenSummary {
  count: number
  oldestCreatedAt?: number
  newestCreatedAt?: number
  newestRotatedAt?: number
}

export interface PairedDevice {
  deviceId: string
  displayName?: string
  platform?: string
  role?: string
  roles?: string[]
  scopes?: string[]
  remoteIp?: string
  tokens?: Record<string, DeviceTokenSummary>
}

export interface PairingRequest {
  requestId: string
  deviceId: string
  displayName?: string
  platform?: string
  role?: string
  roles?: string[]
  scopes?: string[]
  remoteIp?: string
  ts: number
}

export interface DevicePairListResponse {
  pending: PairingRequest[]
  paired: PairedDevice[]
}

export async function listDevicePairings(call: RpcCaller): Promise<DevicePairListResponse | null> {
  try {
    return await call<DevicePairListResponse>('device.pair.list', {})
  } catch (err) {
    console.warn('[nodes] Failed to list device pairings:', err)
    return null
  }
}

// --- Exec Approvals Mutations ---

export async function setExecApprovals(call: RpcCaller, file: ExecApprovalsFile, baseHash: string): Promise<void> {
  await call('exec.approvals.set', { file, baseHash })
}

export async function setNodeExecApprovals(call: RpcCaller, nodeId: string, file: ExecApprovalsFile, baseHash: string): Promise<void> {
  await call('exec.approvals.node.set', { nodeId, file, baseHash })
}

// --- Device Pairing Mutations ---

export async function approveDevicePairing(call: RpcCaller, requestId: string): Promise<void> {
  await call('device.pair.approve', { requestId })
}

export async function rejectDevicePairing(call: RpcCaller, requestId: string): Promise<void> {
  await call('device.pair.reject', { requestId })
}

export async function removeDevice(call: RpcCaller, deviceId: string): Promise<void> {
  await call('device.pair.remove', { deviceId })
}

export async function rotateDeviceToken(call: RpcCaller, deviceId: string, role: string, scopes?: string[]): Promise<void> {
  await call('device.token.rotate', { deviceId, role, ...(scopes ? { scopes } : {}) })
}

export async function revokeDeviceToken(call: RpcCaller, deviceId: string, role: string): Promise<void> {
  await call('device.token.revoke', { deviceId, role })
}
