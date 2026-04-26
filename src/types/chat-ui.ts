/** Demo / UI-layer chat types (aligned with v0 `reference/lib/types.ts`). */
import type { MessageFile } from '@/lib/openclaw/types';
import type { InternalContextEvent } from '@/lib/openclaw/utils';

export type { InternalContextEvent };
export type { MessageFile };

export type ChatUiMessageRole = 'user' | 'assistant';

export type ChatUiToolStatus = 'pending' | 'running' | 'completed' | 'error';

export interface ChatUiToolCall {
  id: string;
  type: 'file_read' | 'web_search' | 'code_execution' | 'image_generation';
  name: string;
  input?: string;
  output?: string;
  status: ChatUiToolStatus;
  /** Human-readable elapsed time (e.g. "2s", "500ms"). Only set when the tool completed. */
  duration?: string;
}

export interface ChatUiThinkingBlock {
  id: string;
  content: string;
  isExpanded: boolean;
  duration?: string;
}

/**
 * Ordered UI-layer part built from a live streaming ChatMessagePart.
 * When `ChatUiMessage.parts` is present, MessageBubble renders these in
 * sequence instead of the legacy fixed [thinking → tools → body] layout.
 */
export type ChatUiMessagePart =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'thinking'; id: string; text: string; duration?: string; isActive: boolean }
  | { kind: 'tool'; id: string; toolCall: ChatUiToolCall; duration?: string; isActive: boolean };

export interface ChatUiMessage {
  id: string;
  role: ChatUiMessageRole;
  content: string;
  timestamp: Date;
  thinking?: ChatUiThinkingBlock[];
  toolCalls?: ChatUiToolCall[];
  /**
   * Sequential ordered parts adapted from `ChatMessage.parts`. When present,
   * `MessageBubble` renders these in arrival order; `thinking` / `toolCalls`
   * are used as the fallback for history-loaded messages.
   */
  parts?: ChatUiMessagePart[];
  isStreaming?: boolean;
  images?: string[];
  audioUrl?: string;
  videoUrl?: string;
  /** Non-image files received from the assistant (documents, PDFs, etc.). */
  files?: MessageFile[];
  /** File / video / audio labels when there is no inline image thumbnail. */
  fileAttachments?: Array<{ name: string; mimeType?: string }>;
  /** Signals a non-chat info marker (e.g. 'Session reset.'). Rendered as a centered separator. */
  kind?: 'info' | 'internalEvent';
  /** Parsed internal context event payload — present when kind === 'internalEvent'. */
  internalEvent?: InternalContextEvent;
  /** True when this assistant bubble was cut by a network drop mid-stream. */
  interrupted?: boolean;
  /** ID of the user message that triggered this turn — used for retry. */
  retryFromMessageId?: string;
  /**
   * True when media URLs were guessed from a bare filename in cross-channel history.
   * Renderers show a fallback card if the guessed URL fails to load.
   */
  guessedMedia?: boolean;
}

// ---------------------------------------------------------------------------
// Per-session activity model — tracks what the agent/app is doing right now
// so the UI can show appropriate indicators without conflating them with
// the isStreaming chat-bubble state.
// ---------------------------------------------------------------------------

export type SessionActivityReason =
  | 'awaiting'   // chatAwaitingResponse fired, no stream content yet
  | 'streaming'  // chat/agent stream is actively delivering content
  | 'resetting'  // local sessions.reset RPC in flight
  | 'compacting' // gateway context-compaction event active
  | 'agentBusy'; // presence/agentStatus says agent is occupied

export interface SessionActivity {
  reason: SessionActivityReason;
  /** Human-readable label for the activity row (e.g. 'Resetting session...'). */
  label?: string;
  since: number;
}
