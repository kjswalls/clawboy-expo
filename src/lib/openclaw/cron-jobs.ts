// OpenClaw Client - Cron Job API Methods

import type { CronJob, RpcCaller } from './types'

function mapCronJob(c: any, fallbackId?: string): CronJob {
  // Build display string for schedule
  let schedule = c.schedule
  const scheduleRaw = typeof schedule === 'object' && schedule !== null ? schedule : undefined
  if (scheduleRaw) {
    if (scheduleRaw.kind === 'cron') schedule = scheduleRaw.expr || JSON.stringify(scheduleRaw)
    else if (scheduleRaw.kind === 'every') schedule = `every ${scheduleRaw.everyMs}ms`
    else if (scheduleRaw.kind === 'at') schedule = `at ${scheduleRaw.at}`
    else schedule = scheduleRaw.display || scheduleRaw.expr || JSON.stringify(scheduleRaw)
  }

  let nextRun = c.nextRun
  if (typeof nextRun === 'object' && nextRun !== null) {
    nextRun = nextRun.display || nextRun.time || JSON.stringify(nextRun)
  }

  const enabled = typeof c.enabled === 'boolean' ? c.enabled : (c.status !== 'paused')

  return {
    id: c.id || c.name || fallbackId || `cron-${Math.random()}`,
    name: c.name || 'Unnamed Job',
    schedule: String(schedule || 'N/A'),
    scheduleRaw: scheduleRaw || undefined,
    sessionTarget: c.sessionTarget,
    wakeMode: c.wakeMode,
    payload: c.payload,
    delivery: c.delivery,
    agentId: c.agentId ?? c.agent ?? undefined,
    deleteAfterRun: c.deleteAfterRun,
    status: enabled ? 'active' : 'paused',
    enabled,
    description: c.description,
    nextRun: nextRun ? String(nextRun) : undefined,
    content: c.content || c.markdown || c.readme || '',
    state: c.state,
  }
}

export async function listCronJobs(call: RpcCaller): Promise<CronJob[]> {
  try {
    const result = await call<any>('cron.list')
    const jobs = Array.isArray(result) ? result : (result?.cronJobs || result?.jobs || result?.cron || result?.items || result?.list || [])
    return jobs.map((c: any) => mapCronJob(c))
  } catch {
    return []
  }
}

export async function toggleCronJob(call: RpcCaller, cronId: string, enabled: boolean): Promise<void> {
  await call('cron.update', { id: cronId, patch: { enabled } })
}

export async function getCronJobDetails(call: RpcCaller, cronId: string): Promise<CronJob | null> {
  try {
    const result = await call<any>('cron.get', { id: cronId })
    if (!result) return null
    return mapCronJob(result, cronId)
  } catch {
    return null
  }
}

export async function addCronJob(call: RpcCaller, params: any): Promise<void> {
  await call('cron.add', params)
}

export async function updateCronJob(call: RpcCaller, cronId: string, params: any): Promise<void> {
  await call('cron.update', { id: cronId, patch: params })
}

export async function removeCronJob(call: RpcCaller, cronId: string): Promise<void> {
  await call('cron.remove', { id: cronId })
}

export async function runCronJob(call: RpcCaller, cronId: string): Promise<void> {
  await call('cron.run', { id: cronId })
}
