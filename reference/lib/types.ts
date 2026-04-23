export type MessageRole = 'user' | 'assistant'

export type ToolStatus = 'pending' | 'running' | 'completed' | 'error'

export interface ToolCall {
  id: string
  type: 'file_read' | 'web_search' | 'code_execution' | 'image_generation'
  name: string
  input?: string
  output?: string
  status: ToolStatus
}

export interface ThinkingBlock {
  id: string
  content: string
  isExpanded: boolean
  duration?: string
}

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: Date
  thinking?: ThinkingBlock[]
  toolCalls?: ToolCall[]
  isStreaming?: boolean
  images?: string[]
  audioUrl?: string
}

export interface Session {
  id: string
  title: string
  preview: string
  timestamp: Date
  isPinned: boolean
  messageCount: number
}

export interface ServerProfile {
  id: string
  name: string
  url: string
  authToken: string
  isActive: boolean
}

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'
