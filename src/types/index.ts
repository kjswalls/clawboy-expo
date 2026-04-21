// Shared app types — protocol-aligned where noted in `.cursorrules`.

import { Colors } from '@/constants/theme';
import type { Message as OpenClawMessage, MessageImage } from '@/lib/openclaw/types';

export type { MessageImage };

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

/** UI message layer — extends protocol messages with streaming affordances. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  thinking?: string;
  thinkingBlocks?: ChatThinkingBlock[];
  toolCalls?: ChatToolCall[];
  images?: MessageImage[];
  audioUrl?: string;
  videoUrl?: string;
  audioAsVoice?: boolean;
  isStreaming?: boolean;
  failedContent?: string;
}

export function openClawMessageToChat(m: OpenClawMessage): ChatMessage {
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
    failedContent: m.failedContent,
  };
}

/** Stored server profile — secrets live in SecureStore, not alongside this record. */
export interface ServerProfile {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
}

export interface Model {
  id: string;
  name?: string;
  provider?: string;
}

export type ThemeMode = 'dark' | 'light';

/** Resolved palette for the active theme (`src/constants/theme.ts`). */
export type ThemeColors = (typeof Colors)['dark'] | (typeof Colors)['light'];

/** Mock session row for sidebar UI (Prompt 9 replaces with gateway data). */
export interface MockSession {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
  isPinned: boolean;
}
