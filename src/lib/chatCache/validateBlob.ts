import type { ChatMessage } from '@/types';

import type { CachedAgentSnapshot, CachedModelSnapshot, CachedSessionBlob } from '@/lib/chatCache/types';

function isChatMessage(x: unknown): x is ChatMessage {
  if (typeof x !== 'object' || x === null) {
    return false;
  }
  const o = x as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.role === 'string' && typeof o.content === 'string' && typeof o.timestamp === 'string';
}

function isDraftsRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function parseAgentSnapshot(x: unknown): CachedAgentSnapshot | undefined {
  if (typeof x !== 'object' || x === null) {
    return undefined;
  }
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string') {
    return undefined;
  }
  return {
    id: o.id,
    name: o.name,
    emoji: typeof o.emoji === 'string' ? o.emoji : undefined,
    dotBg: typeof o.dotBg === 'string' ? o.dotBg : undefined,
  };
}

function parseModelSnapshot(x: unknown): CachedModelSnapshot | undefined {
  if (typeof x !== 'object' || x === null) {
    return undefined;
  }
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string') {
    return undefined;
  }
  return {
    id: o.id,
    name: o.name,
    providerSlug: typeof o.providerSlug === 'string' ? (o.providerSlug as CachedModelSnapshot['providerSlug']) : undefined,
    dotBg: typeof o.dotBg === 'string' ? o.dotBg : undefined,
  };
}

export function parseCachedSessionBlob(raw: unknown, expectedProfileId: string): CachedSessionBlob | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const o = raw as Record<string, unknown>;

  const version = o.version;
  if (version !== 1 && version !== 2 && version !== 3) {
    return null;
  }
  if (typeof o.profileId !== 'string' || typeof o.sessionKey !== 'string') {
    return null;
  }
  if (o.profileId !== expectedProfileId) {
    return null;
  }
  if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt)) {
    return null;
  }
  if (!Array.isArray(o.messages)) {
    return null;
  }
  const messages = o.messages.filter(isChatMessage);
  if (messages.length === 0) {
    return null;
  }

  // Migrate v1/v2 → v3: inject empty drafts map for v1; carry drafts for v2+.
  const drafts: Record<string, { text: string; attachments?: unknown[]; updatedAt: number }> =
    (version === 2 || version === 3) && isDraftsRecord(o.drafts)
      ? (o.drafts as Record<string, { text: string; updatedAt: number }>)
      : {};

  // v3: parse agent/model snapshots directly.
  // v1/v2: synthesise minimal snapshots from deprecated agentId/modelId strings.
  let agent: CachedAgentSnapshot | undefined;
  let model: CachedModelSnapshot | undefined;

  if (version === 3) {
    agent = parseAgentSnapshot(o.agent);
    model = parseModelSnapshot(o.model);
  } else {
    // v1/v2 migration: only id+name available (no display metadata).
    if (typeof o.agentId === 'string' && o.agentId.length > 0) {
      agent = { id: o.agentId, name: o.agentId };
    }
    if (typeof o.modelId === 'string' && o.modelId.length > 0) {
      model = { id: o.modelId, name: o.modelId };
    }
  }

  return {
    version: 3,
    profileId: o.profileId,
    sessionKey: o.sessionKey,
    sessionTitle: typeof o.sessionTitle === 'string' ? o.sessionTitle : undefined,
    agent,
    model,
    updatedAt: o.updatedAt,
    messages,
    drafts: drafts as CachedSessionBlob['drafts'],
  };
}
