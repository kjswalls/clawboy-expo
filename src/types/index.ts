// Shared app types — protocol-aligned where noted in `.cursorrules`.

import { Colors } from '@/constants/theme';
import type { Message as OpenClawMessage, MessageImage, MessageFile } from '@/lib/openclaw/types';
import { parseInternalContextBlock, isFullyInternalContextMessage } from '@/lib/openclaw/utils';
import type { InternalContextEvent } from '@/lib/openclaw/utils';
import type { ClawboyOptionsPrompt } from '@/lib/openclaw/interactive';
import { extractInteractiveFromContent } from '@/lib/openclaw/interactive';
import { stripClientContextDirective } from '@/lib/openclaw/clientContext';

export type { ClawboyOptionsPrompt };

export type { InternalContextEvent };

export type { MessageImage, MessageFile };

/** Connection state union from `.cursorrules`. */
export type ConnectionState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'connected'; serverVersion: string }
  | {
      status: 'error';
      error: 'auth_failed' | 'cert_error' | 'timeout' | 'network';
      message: string;
      /** Contextual hint for the user — e.g. Tailscale not running, no internet. */
      hint?: 'check_tailscale' | 'no_internet';
    }
  | { status: 'pairing_required'; deviceId: string }
  /**
   * Gateway rejected the device's Ed25519 signature — the keypair is no
   * longer recognised server-side. The user must either re-pair with the
   * existing keypair or generate a fresh identity.
   */
  | {
      status: 'identity_rejected';
      deviceId: string;
      reason: 'signature_invalid' | 'unknown_device';
    }
  /**
   * SPKI pin mismatch — the gateway's certificate public key does not match
   * any of the pinned hashes for this profile. The user must approve the new
   * key or disconnect and forget the server.
   */
  | {
      status: 'pin_mismatch';
      observedSpki: string;
      allowedSpkis: string[];
    };

export type ChatToolStatus = 'pending' | 'running' | 'completed' | 'error';

export interface ChatToolCall {
  id: string;
  name: string;
  status: ChatToolStatus;
  args?: Record<string, unknown>;
  result?: string;
  meta?: string;
}

export interface ChatThinkingBlock {
  id: string;
  content: string;
  isExpanded: boolean;
}

/**
 * An ordered sequential part within an assistant message, built as events
 * arrive during streaming. Captures true arrival order (thinking → tool →
 * text etc.) so the UI can render blocks in sequence rather than in fixed
 * section groups. `startedAt` / `completedAt` are client-side `Date.now()`
 * timestamps used to derive human-readable duration labels.
 */
export type ChatMessagePart =
  | { kind: 'text'; id: string; text: string }
  | {
      kind: 'thinking';
      id: string;
      text: string;
      startedAt: number;
      completedAt?: number;
    }
  | {
      kind: 'tool';
      id: string;
      name: string;
      status: ChatToolStatus;
      args?: Record<string, unknown>;
      result?: string;
      meta?: string;
      startedAt: number;
      completedAt?: number;
    }
;

/** UI message layer — extends protocol messages with streaming affordances. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  thinking?: string;
  thinkingBlocks?: ChatThinkingBlock[];
  toolCalls?: ChatToolCall[];
  /**
   * Sequential ordered parts built during live streaming. When present,
   * the UI renders this in order instead of the fixed
   * [thinking → tools → body] grouping. Absent on history-loaded messages.
   */
  parts?: ChatMessagePart[];
  images?: MessageImage[];
  audioUrl?: string;
  videoUrl?: string;
  audioAsVoice?: boolean;
  /** Non-image files (documents, PDFs, etc.) received from the assistant. */
  files?: MessageFile[];
  /** Non-image attachments on this message (PDF, audio file name, etc.) — UI only for optimistic sends. */
  attachedFiles?: Array<{ name: string; mimeType?: string }>;
  isStreaming?: boolean;
  failedContent?: string;
  /** Signals a non-chat info marker (e.g. 'Session reset.'). Rendered as a centered separator. */
  kind?: 'info' | 'internalEvent';
  /** Parsed internal context event payload — present when kind === 'internalEvent'. */
  internalEvent?: InternalContextEvent;
  /** Set when a streaming response was cut by a network drop before the gateway finished. */
  interrupted?: boolean;
  /** ID of the user message that produced this assistant turn — used by retryMessage(). */
  retryFromMessageId?: string;
  /**
   * Canonical server-assigned id for a message that was originally tracked under
   * a local `stream-<uuid>` placeholder. Set in `onMessage` finalization (F2) so
   * FlatList keeps the cell mounted across stream finalize and chat.history reconciles.
   */
  serverId?: string;
  /**
   * True when media URLs were guessed from a bare filename in cross-channel history.
   * Renderers show a fallback card if the guessed URL fails to load.
   */
  guessedMedia?: boolean;
  /**
   * Parsed interactive reply-options directive extracted from the assistant's
   * message content. Present when the gateway response contained a valid
   * `<!-- clawboy:options {...} -->` comment block. Set at message finalization;
   * absent on user/system messages and on messages that carry no directive.
   *
   * When set, `content` has already been stripped of the directive comment so
   * it never leaks into copy/TTS/retry-quote flows.
   */
  interactive?: ClawboyOptionsPrompt;
}

export function openClawMessageToChat(m: OpenClawMessage, gatewayUrl?: string): ChatMessage {
  // Detect gateway-injected internal context blocks. The gateway stores these
  // as synthetic role:'user' turns to prompt the model, but they should never
  // appear as user chat bubbles in the UI.
  if (m.role === 'user' && isFullyInternalContextMessage(m.content ?? '')) {
    const internalEvent = parseInternalContextBlock(m.content ?? '', gatewayUrl) ?? undefined;
    return {
      id: m.id,
      role: 'system',
      content: '',
      timestamp: m.timestamp,
      kind: 'internalEvent',
      internalEvent,
      // Promote extracted media so the list row can render real thumbnails/players
      images: internalEvent?.images,
      audioUrl: internalEvent?.audioUrl,
      videoUrl: internalEvent?.videoUrl,
      files: internalEvent?.files,
    };
  }

  // Defensively strip any ClawBoy convention primer comments from message
  // content. The primer is injected on the first user message of each session
  // when an agent is in fallback mode; comments are invisible to markdown
  // renderers but we still want them out of copy/TTS/retry-quote flows when
  // history is reloaded.
  const rawContent = m.content ?? '';
  const cleanedContent = rawContent.includes('clawboy:client-context')
    ? stripClientContextDirective(rawContent)
    : rawContent;

  // Strip any clawboy:options directive from assistant content and attach the
  // parsed payload so the UI can render an interactive survey card.
  if (m.role === 'assistant' && cleanedContent.includes('clawboy:options')) {
    const { cleanText, prompt } = extractInteractiveFromContent(cleanedContent);
    return {
      id: m.id,
      role: m.role,
      content: cleanText,
      timestamp: m.timestamp,
      thinking: m.thinking,
      images: m.images,
      audioUrl: m.audioUrl,
      videoUrl: m.videoUrl,
      audioAsVoice: m.audioAsVoice,
      files: m.files,
      failedContent: m.failedContent,
      guessedMedia: m.guessedMedia,
      interactive: prompt ?? undefined,
    };
  }

  return {
    id: m.id,
    role: m.role,
    content: cleanedContent,
    timestamp: m.timestamp,
    thinking: m.thinking,
    images: m.images,
    audioUrl: m.audioUrl,
    videoUrl: m.videoUrl,
    audioAsVoice: m.audioAsVoice,
    files: m.files,
    failedContent: m.failedContent,
    guessedMedia: m.guessedMedia,
  };
}

/**
 * Per-profile TLS certificate pinning state.
 * All fields are optional so existing stored profiles (without security data)
 * migrate gracefully — missing fields are treated as unpinned.
 */
export interface ProfileSecurity {
  /**
   * Active SPKI SHA-256 pins (hex). When non-empty, the native WebSocket
   * factory will reject any connection whose leaf cert's SPKI hash is not in
   * this list. 1–N entries allow rotation/backup without bricking.
   */
  pinnedSpkiSha256?: string[];
  /**
   * The first SPKI SHA-256 hash observed on a successful connection (TOFU
   * record). Populated automatically on first connect once the native module
   * is wired up. Not enforced until the user explicitly pins it.
   */
  firstSeenSpkiSha256?: string | null;
  /** Unix ms timestamp when `firstSeenSpkiSha256` was first recorded. */
  firstSeenAt?: number | null;
}

/**
 * Reserved profile id used for the built-in offline demo profile.
 * The demo client never touches a WebSocket — responses are scripted locally.
 */
export const DEMO_PROFILE_ID = '__demo__';

/**
 * Returns true when `profile` is the offline demo profile.
 * Use this instead of comparing `.id` or `.kind` directly — the two fields
 * are redundant on the demo profile and both must be checked for safety.
 */
export function isDemoProfile(
  profile: { id?: string; kind?: string } | null | undefined,
): boolean {
  if (!profile) return false;
  return profile.id === DEMO_PROFILE_ID || profile.kind === 'demo';
}

/** Stored server profile — secrets live in SecureStore, not alongside this record. */
export interface ServerProfile {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  /**
   * Profile kind. Defaults to 'gateway' when absent (migration-safe).
   * 'demo' = offline scripted client, no network or credentials needed.
   */
  kind?: 'gateway' | 'demo';
  /** Unix ms timestamp of the last successful connection — used to prefer the
   *  most recently used server on cold-start auto-reconnect. Non-sensitive. */
  lastConnectedAt?: number;
  /** Certificate pinning state for this profile. Absent on older profiles —
   *  treat as unpinned (no enforcement). */
  security?: ProfileSecurity;
  /**
   * True when the profile was materialised from a cloud pointer but has not yet
   * been given an auth token by the user. These profiles cannot auto-connect.
   * Cleared as soon as the user saves a non-empty token via updateProfile.
   */
  needsToken?: boolean;
}

export interface Model {
  id: string;
  name?: string;
  provider?: string;
  contextWindow?: number;
  reasoning?: boolean;
  input?: string[];
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type { UiDensity } from '@/constants/theme';
export type DarkVariant =
  | 'dark'
  | 'darkBlue'
  | 'oneDarkPro'
  | 'tokyoNight'
  /** Brand palette — cowgirl logo colours (blue · pink · tan). */
  | 'cowgirlDark'
  /** Founders Silver+ exclusive — warm ember dark palette. */
  | 'foundersAmber'
  /** Founders Gold exclusive — northern lights aurora palette. */
  | 'foundersAurora';
export type LightVariant = 'default' | 'githubLight' | 'solarizedLight' | 'oneLight' | 'parasol' | 'cowgirlLight';

/** Minimum tier required to unlock a given dark variant. */
export const DARK_VARIANT_MIN_TIER: Partial<Record<DarkVariant, import('@/lib/supabase/types').EntitlementTier>> = {
  foundersAmber: 'founder',
  foundersAurora: 'founder',
};

/** Resolved palette for the active theme (`src/constants/theme.ts`). */
export type ThemeColors = (typeof Colors)[keyof typeof Colors];

/** Mock session row for sidebar UI (Prompt 9 replaces with gateway data). */
export interface MockSession {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
  isPinned: boolean;
}
