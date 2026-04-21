/** Demo / UI-layer chat types (aligned with v0 `reference/lib/types.ts`). */

export type ChatUiMessageRole = 'user' | 'assistant';

export type ChatUiToolStatus = 'pending' | 'running' | 'completed' | 'error';

export interface ChatUiToolCall {
  id: string;
  type: 'file_read' | 'web_search' | 'code_execution' | 'image_generation';
  name: string;
  input?: string;
  output?: string;
  status: ChatUiToolStatus;
}

export interface ChatUiThinkingBlock {
  id: string;
  content: string;
  isExpanded: boolean;
  duration?: string;
}

export interface ChatUiMessage {
  id: string;
  role: ChatUiMessageRole;
  content: string;
  timestamp: Date;
  thinking?: ChatUiThinkingBlock[];
  toolCalls?: ChatUiToolCall[];
  isStreaming?: boolean;
  images?: string[];
  audioUrl?: string;
}
