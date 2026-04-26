// OpenClaw Client - Chat API Methods

import type { Message, RpcCaller } from './types'
import { stripAnsi, stripModelSpecialTokens, stripSystemNotifications, stripConversationMetadata, extractImagesFromContent, parseMediaTokens, generateUUID, isFullyInternalContextMessage } from './utils'
import { isBareMediaFilename, guessMediaPath } from '../media/guessMediaPath'
import { resolveMediaUrl } from '../media/gatewayMedia'

export interface HistoryToolCall {
  toolCallId: string
  name: string
  phase: 'start' | 'result'
  result?: string
  args?: Record<string, unknown>
  afterMessageId?: string
}

export interface ChatHistoryResult {
  messages: Message[]
  toolCalls: HistoryToolCall[]
}

export interface ChatAttachmentInput {
  type?: string
  mimeType?: string
  fileName?: string
  content: string
}

export async function getSessionMessages(call: RpcCaller, sessionId: string, gatewayUrl?: string): Promise<ChatHistoryResult> {
  try {
    const result = await call<any>('chat.history', { sessionKey: sessionId })

    // Handle multiple possible response formats from the server
    let messages: any[]
    if (Array.isArray(result)) {
      messages = result
    } else if (result?.messages) {
      messages = result.messages
    } else if (result?.history) {
      messages = result.history
    } else if (result?.entries) {
      messages = result.entries
    } else if (result?.items) {
      messages = result.items
    } else {
      return { messages: [], toolCalls: [] }
    }

    const toolCalls: HistoryToolCall[] = []
    let lastAssistantId: string | null = null

    const rawMessages = messages.map((m: any) => {
        // The server already unwraps transcript lines with parsed.message,
        // so each m is { role, content, timestamp, ... } directly.
        // Fall back to nested wrappers for older formats.
        const msg = m.message || m.data || m.entry || m
        const role: string = msg.role || m.role || 'assistant'
        const msgId = msg.id || m.id || m.runId || `history-${Math.random()}`
        const normalizedRole = role === 'user' ? 'user' : role === 'system' ? 'system' : 'assistant'
        let rawContent = msg.content ?? msg.body ?? msg.text
        let content = ''
        let thinking = msg.thinking
        let images: Message['images'] = []

        // Track last assistant message for tool call anchoring
        if (normalizedRole === 'assistant') {
          lastAssistantId = msgId
        }

        if (Array.isArray(rawContent)) {
          images = extractImagesFromContent(rawContent)
          // Content blocks: [{ type: 'text', text: '...' }, { type: 'tool_use', ... }, ...]
          // Extract text from text/input_text blocks
          content = rawContent
            .filter((c: any) => c.type === 'text' || c.type === 'input_text' || c.type === 'output_text' || (!c.type && c.text))
            .map((c: any) => c.text)
            .filter(Boolean)
            .join('')

          // Extract thinking/reasoning from content blocks.
          // Accept multiple type names for gateway/model compatibility
          // (Anthropic: 'thinking'; DeepSeek/OpenAI-style: 'reasoning', 'reasoning_content').
          const thinkingBlock = rawContent.find(
            (c: any) => c.type === 'thinking' || c.type === 'reasoning' || c.type === 'reasoning_content'
          )
          if (thinkingBlock) {
            thinking = thinkingBlock.thinking ?? thinkingBlock.reasoning ?? thinkingBlock.reasoning_content ?? thinkingBlock.text
          }
          // Top-level reasoning fallbacks for gateways that surface it outside content[].
          if (!thinking) {
            thinking = msg.reasoning ?? msg.reasoning_content
          }

          // Extract tool_use blocks as tool call cards, anchored to this message
          for (const c of rawContent) {
            if (c.type === 'toolCall' || c.type === 'tool_use') {
              const tcId = c.id || `htc-${Math.random().toString(36).slice(2, 8)}`
              const name = c.name || 'tool'
              let args: Record<string, unknown> | undefined
              if (c.arguments && typeof c.arguments === 'object') {
                args = c.arguments as Record<string, unknown>
              } else if (typeof c.arguments === 'string') {
                try { args = JSON.parse(c.arguments) } catch { /* ignore */ }
              } else if (c.input && typeof c.input === 'object') {
                args = c.input as Record<string, unknown>
              }
              // History tool calls are always completed
              toolCalls.push({
                toolCallId: tcId,
                name,
                phase: 'result',
                args,
                afterMessageId: normalizedRole === 'assistant' ? msgId : lastAssistantId || undefined,
              })
            }
          }

          // Extract tool_result blocks and merge into existing tool calls
          for (const c of rawContent) {
            if (c.type === 'toolResult' || c.type === 'tool_result') {
              const tcId = c.toolCallId || c.tool_use_id || c.id
              let resultText: string | undefined
              if (typeof c.content === 'string') {
                resultText = c.content
              } else if (Array.isArray(c.content)) {
                resultText = c.content
                  .filter((b: any) => typeof b?.text === 'string')
                  .map((b: any) => b.text)
                  .join('')
              }
              // Find matching tool call and upgrade it to result phase
              const existing = tcId ? toolCalls.find(t => t.toolCallId === tcId) : null
              if (existing) {
                existing.phase = 'result'
                existing.result = resultText ? stripAnsi(resultText) : undefined
              } else {
                // Standalone result without matching tool_use
                toolCalls.push({
                  toolCallId: tcId || `htc-${Math.random().toString(36).slice(2, 8)}`,
                  name: c.name || 'tool',
                  phase: 'result',
                  result: resultText ? stripAnsi(resultText) : undefined,
                  afterMessageId: lastAssistantId || undefined,
                })
              }
            }
          }

          // For tool_result blocks (user-role internal protocol messages),
          // extract nested text so these entries aren't silently dropped
          if (!content) {
            content = rawContent
              .map((c: any) => {
                if (typeof c.text === 'string') return c.text
                // tool_result blocks can have content as string or array
                if (c.type === 'toolResult' || c.type === 'tool_result') {
                  if (typeof c.content === 'string') return c.content
                  if (Array.isArray(c.content)) {
                    return c.content
                      .filter((b: any) => typeof b?.text === 'string')
                      .map((b: any) => b.text)
                      .join('')
                  }
                }
                return ''
              })
              .filter(Boolean)
              .join('')
          }
        } else if (typeof rawContent === 'object' && rawContent !== null) {
           content = rawContent.text || rawContent.content || JSON.stringify(rawContent)
        } else if (typeof rawContent === 'string') {
           content = rawContent
        } else {
           content = ''
        }

        // Detect heartbeat / cron trigger messages — hide them entirely
        const contentUpper = content.toUpperCase()
        const isHeartbeat =
          contentUpper.includes('HEARTBEAT_OK') ||
          contentUpper.includes('READ HEARTBEAT.MD') ||
          content.includes('# HEARTBEAT - Event-Driven Status') ||
          contentUpper.includes('CRON: HEARTBEAT')
        if (isHeartbeat) return null

        // Filter out cron-triggered user messages (scheduled reminders, updates, etc.)
        if (role === 'user') {
          const lower = content.toLowerCase()
          if (lower.includes('a scheduled reminder has been triggered') ||
              lower.includes('scheduled update')) {
            return null
          }
        }

        // Filter out NO_REPLY noise from agent
        if (content.trim() === 'NO_REPLY' || content.trim() === 'no_reply') return null

        // Skip toolResult protocol messages - these are internal agent steps,
        // not user-facing chat. Tool output is shown via tool call blocks instead.
        if (role === 'toolResult' || role === 'tool_result') return null

        // Strip system notification lines (exec status, etc.) from content
        content = stripSystemNotifications(content).trim()

        // Strip server-injected metadata prefix from user messages.
        // Skip stripping when the whole message is an internal context block —
        // openClawMessageToChat will handle it downstream and tag it internalEvent.
        if (role === 'user' && !isFullyInternalContextMessage(content)) {
          content = stripConversationMetadata(content).trim()
        }

        // Parse MEDIA: tokens from assistant messages and convert to image/audio/video URLs
        let audioUrl: string | undefined
        let videoUrl: string | undefined
        let audioAsVoice: boolean | undefined
        let guessedMedia: boolean | undefined

        // Best-effort: bare filename from a cross-channel session (e.g. Discord).
        // The path is lost but the file may exist under the gateway's media dir.
        if (normalizedRole === 'assistant' && !content.includes('MEDIA:') && isBareMediaFilename(content)) {
          const guess = guessMediaPath(content.trim())
          if (guess) {
            const resolved = resolveMediaUrl(guess.sourcePath, gatewayUrl)
            if (resolved) {
              const originalFilename = content.trim()
              if (guess.kind === 'image') {
                images.push({ url: resolved.url, alt: originalFilename })
              } else if (guess.kind === 'video') {
                videoUrl = resolved.url
              } else if (guess.kind === 'audio') {
                audioUrl = resolved.url
              }
              guessedMedia = true
              content = ''
            }
          }
        }

        if (normalizedRole === 'assistant' && content.includes('MEDIA:')) {
          const parsed = parseMediaTokens(content, gatewayUrl)
          content = parsed.cleanText
          if (parsed.images.length > 0) {
            images = [...images, ...parsed.images]
          }
          if (parsed.audioUrls.length > 0) {
            audioUrl = parsed.audioUrls[0]
          }
          if (parsed.videoUrls.length > 0) {
            videoUrl = parsed.videoUrls[0]
          }
        }

        // Extract mediaUrl/mediaUrls from sendPayload-style history messages
        if (typeof msg.mediaUrl === 'string' && msg.mediaUrl) {
          images.push({ url: msg.mediaUrl, alt: 'Media' })
        }
        if (Array.isArray(msg.mediaUrls)) {
          for (const u of msg.mediaUrls) {
            if (typeof u === 'string' && u) images.push({ url: u, alt: 'Media' })
          }
        }
        // Also check the wrapper level (m) for mediaUrl/mediaUrls
        if (typeof m.mediaUrl === 'string' && m.mediaUrl) {
          images.push({ url: m.mediaUrl, alt: 'Media' })
        }
        if (Array.isArray(m.mediaUrls)) {
          for (const u of m.mediaUrls) {
            if (typeof u === 'string' && u) images.push({ url: u, alt: 'Media' })
          }
        }
        // Extract details.media (v2026.3.22 media reply migration)
        const detailsMedia = msg.details?.media || m.details?.media
        if (detailsMedia) {
          const dm = detailsMedia
          if (Array.isArray(dm)) {
            for (const item of dm) {
              if (item.type === 'image' && typeof item.url === 'string') {
                images.push({ url: item.url, mimeType: item.mimeType, alt: item.alt || 'Media' })
              } else if (item.type === 'audio' && typeof item.url === 'string' && !audioUrl) {
                audioUrl = item.url
              } else if (item.type === 'video' && typeof item.url === 'string' && !videoUrl) {
                videoUrl = item.url
              } else if (item.type === 'document' && typeof item.url === 'string') {
                images.push({ url: item.url, mimeType: item.mimeType, alt: item.alt || item.fileName || 'Document' })
              }
            }
          } else if (typeof dm === 'object' && dm !== null && typeof dm.url === 'string') {
            if (dm.type === 'audio') { if (!audioUrl) audioUrl = dm.url }
            else if (dm.type === 'video') { if (!videoUrl) videoUrl = dm.url }
            else images.push({ url: dm.url, mimeType: dm.mimeType, alt: dm.alt || 'Media' })
          }
        }
        // Extract audioAsVoice flag
        if (msg.audioAsVoice === true || m.audioAsVoice === true) {
          audioAsVoice = true
        }

        // Filter out non-assistant entries without displayable text content.
        // Keep empty assistant messages so tool calls can anchor to them.
        if (!content && images.length === 0 && !audioUrl && !videoUrl && normalizedRole !== 'assistant') return null

        // Deduplicate images by URL
        const seenUrls = new Set<string>()
        const dedupedImages = images.filter(img => {
          if (seenUrls.has(img.url)) return false
          seenUrls.add(img.url)
          return true
        })

        return {
          id: msgId,
          role: normalizedRole,
          content: stripModelSpecialTokens(stripAnsi(content)),
          thinking: thinking ? stripAnsi(thinking) : thinking,
          timestamp: new Date(msg.timestamp || m.timestamp || msg.ts || m.ts || msg.createdAt || m.createdAt || Date.now()).toISOString(),
          images: dedupedImages.length > 0 ? dedupedImages : undefined,
          audioUrl,
          videoUrl,
          audioAsVoice: audioAsVoice || undefined,
          guessedMedia: guessedMedia || undefined,
        }
      }) as (Message | null)[]

      const filteredMessages = rawMessages.filter((m): m is Message => m !== null)

      // Merge consecutive empty assistant messages so their tool calls group
      // into a single bubble instead of creating separate empty bubbles.
      for (let i = filteredMessages.length - 1; i > 0; i--) {
        const curr = filteredMessages[i]
        const prev = filteredMessages[i - 1]
        if (!curr || !prev) continue
        const currIsReallyEmpty =
          !curr.content.trim() &&
          (!curr.images || curr.images.length === 0) &&
          !curr.audioUrl &&
          !curr.videoUrl &&
          (!curr.files || curr.files.length === 0)
        if (curr.role === 'assistant' && prev.role === 'assistant' && currIsReallyEmpty) {
          // Re-anchor tool calls from this empty message to the previous assistant
          for (const tc of toolCalls) {
            if (tc.afterMessageId === curr.id) {
              tc.afterMessageId = prev.id
            }
          }
          filteredMessages.splice(i, 1)
        }
      }

      // Anchor orphaned tool calls (no afterMessageId) to the nearest assistant
      // message so they render inside a bubble instead of trailing at the bottom.
      for (const tc of toolCalls) {
        if (!tc.afterMessageId) {
          // Find the last assistant message as fallback anchor
          const lastAssistant = filteredMessages.filter(m => m.role === 'assistant').pop()
          if (lastAssistant) tc.afterMessageId = lastAssistant.id
        }
      }

      return { messages: filteredMessages, toolCalls }
  } catch (err) {
    console.warn('[chat.history] Failed to load messages:', err)
    return { messages: [], toolCalls: [] }
  }
}

export async function sendMessage(call: RpcCaller, params: {
  sessionId?: string
  content: string
  agentId?: string
  thinking?: boolean
  thinkingLevel?: string | null
  attachments?: ChatAttachmentInput[]
}): Promise<{ sessionKey?: string }> {
  const idempotencyKey = generateUUID()
  const payload: Record<string, unknown> = {
    message: params.content,
    idempotencyKey
  }

  payload.sessionKey = params.sessionId || (params.agentId ? `agent:${params.agentId}:main` : 'agent:main:main')

  if (params.thinking) {
    // Use session-level thinking level if set, otherwise default to 'low'
    const level = params.thinkingLevel || 'low'
    payload.thinking = level
  }
  if (params.attachments && params.attachments.length > 0) {
    payload.attachments = params.attachments
  }

  const result = await call<any>('chat.send', payload)
  return {
    sessionKey: result?.sessionKey || result?.session?.key || result?.key
  }
}

export async function abortChat(call: RpcCaller, sessionId: string): Promise<void> {
  await call<any>('chat.abort', { sessionKey: sessionId })
}
