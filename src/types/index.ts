// Shared app types — protocol-aligned where noted in `.cursorrules`.

import { Colors } from '@/constants/theme';
import type { Message as OpenClawMessage, MessageImage, MessageFile } from '@/lib/openclaw/types';
import { parseInternalContextBlock, isFullyInternalContextMessage } from '@/lib/openclaw/utils';
import type { InternalContextEvent } from '@/lib/openclaw/utils';

export type { InternalContextEvent };

export type { MessageImage, MessageFile };

/** Connection state union from `.cursorrules`. */
export type ConnectionState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'connected'; serverVersion: string }
  | {
      status: 'error';
      error: 'auth_failed' | 'cert_error' | 'timeout';
      message: string;
    }
  | { status: 'pairing_required'; deviceId: string };

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
    };

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
   * True when media URLs were guessed from a bare filename in cross-channel history.
   * Renderers show a fallback card if the guessed URL fails to load.
   */
  guessedMedia?: boolean;
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

  return {
    id: m.id,
    role: m.role,
    content: m.content,
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

/** Stored server profile — secrets live in SecureStore, not alongside this record. */
export interface ServerProfile {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  /** Unix ms timestamp of the last successful connection — used to prefer the
   *  most recently used server on cold-start auto-reconnect. Non-sensitive. */
  lastConnectedAt?: number;
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
export type DarkVariant = 'dark' | 'darkBlue' | 'oneDarkPro' | 'dracula' | 'tokyoNight';
export type LightVariant = 'default' | 'githubLight' | 'solarizedLight' | 'oneLight';

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
