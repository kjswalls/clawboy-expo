import type { InputAttachment } from '@/components/input/types';
import type { ChatMessage } from '@/types';
import type { ProviderSlug } from '@/lib/modelProvider';
import type { Annotation } from '@/lib/annotations';

export interface DraftEntry {
  text: string;
  /** Persisted draft attachments (local `file://` / `content://` URIs in app sandbox). */
  attachments?: InputAttachment[];
  /** Pending annotations for the multi-point annotation reply feature. */
  annotations?: Annotation[];
  updatedAt: number;
}

/** Minimal display data needed to render the agent pill before the WS list loads. */
export interface CachedAgentSnapshot {
  id: string;
  name: string;
  emoji?: string;
  dotBg?: string;
}

/** Minimal display data needed to render the model pill before the WS list loads. */
export interface CachedModelSnapshot {
  id: string;
  name: string;
  providerSlug?: ProviderSlug;
  dotBg?: string;
}

/** v1 — no drafts field. */
export interface CachedSessionBlobV1 {
  version: 1;
  profileId: string;
  sessionKey: string;
  sessionTitle?: string;
  /** @deprecated Replaced by `agent` in v3. */
  agentId?: string;
  /** @deprecated Replaced by `model` in v3. */
  modelId?: string;
  updatedAt: number;
  messages: ChatMessage[];
}

/** v2 — adds per-session drafts (keyed by sessionKey). */
export interface CachedSessionBlobV2 {
  version: 2;
  profileId: string;
  sessionKey: string;
  sessionTitle?: string;
  /** @deprecated Replaced by `agent` in v3. */
  agentId?: string;
  /** @deprecated Replaced by `model` in v3. */
  modelId?: string;
  updatedAt: number;
  messages: ChatMessage[];
  /** Keyed by sessionKey — preserves in-progress drafts across sessions. */
  drafts: Record<string, DraftEntry>;
}

/** v3 — replaces agentId/modelId flat strings with display snapshots. */
export interface CachedSessionBlobV3 {
  version: 3;
  profileId: string;
  sessionKey: string;
  sessionTitle?: string;
  agent?: CachedAgentSnapshot;
  model?: CachedModelSnapshot;
  updatedAt: number;
  messages: ChatMessage[];
  /** Keyed by sessionKey — preserves in-progress drafts across sessions. */
  drafts: Record<string, DraftEntry>;
}

/** v4 — DraftEntry gains optional `annotations` field. No structural change to blob shape. */
export interface CachedSessionBlobV4 {
  version: 4;
  profileId: string;
  sessionKey: string;
  sessionTitle?: string;
  agent?: CachedAgentSnapshot;
  model?: CachedModelSnapshot;
  updatedAt: number;
  messages: ChatMessage[];
  /** Keyed by sessionKey — preserves in-progress drafts across sessions. */
  drafts: Record<string, DraftEntry>;
}

/** Canonical on-disk type going forward. */
export type CachedSessionBlob = CachedSessionBlobV4;
