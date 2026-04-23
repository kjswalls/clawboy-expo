'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Message } from '@/lib/types'
import { ThinkingBlock } from './thinking-block'
import { ToolCallCard } from './tool-call-card'
import { CodeBlock } from './code-block'
import { AudioPlayer } from './audio-player'
import { AIAvatar } from './ai-avatar'

interface MessageBubbleProps {
  message: Message
  isLatestAssistant?: boolean
  isThinking?: boolean
  showThinking?: boolean
  showToolCalls?: boolean
}

function TypingIndicator() {
  return (
    <div className="inline-flex items-center gap-1 px-3 py-2 bg-secondary rounded-full">
      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-typing-dot" />
      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-typing-dot-delay-1" />
      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-typing-dot-delay-2" />
    </div>
  )
}

function parseMarkdown(content: string) {
  const parts: React.ReactNode[] = []
  const lines = content.split('\n')
  let inCodeBlock = false
  let codeContent = ''
  let codeLanguage = ''
  let key = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Code block start/end
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        parts.push(<CodeBlock key={key++} code={codeContent.trim()} language={codeLanguage} />)
        codeContent = ''
        codeLanguage = ''
        inCodeBlock = false
      } else {
        inCodeBlock = true
        codeLanguage = line.slice(3).trim()
      }
      continue
    }

    if (inCodeBlock) {
      codeContent += line + '\n'
      continue
    }

    // Headers
    if (line.startsWith('### ')) {
      parts.push(<h3 key={key++} className="text-base font-semibold mt-3 mb-1">{line.slice(4)}</h3>)
      continue
    }
    if (line.startsWith('## ')) {
      parts.push(<h2 key={key++} className="text-lg font-semibold mt-3 mb-1">{line.slice(3)}</h2>)
      continue
    }
    if (line.startsWith('# ')) {
      parts.push(<h1 key={key++} className="text-xl font-bold mt-3 mb-1">{line.slice(2)}</h1>)
      continue
    }

    // List items
    if (line.match(/^[-*] /)) {
      parts.push(
        <li key={key++} className="ml-4 list-disc">
          {formatInlineMarkdown(line.slice(2))}
        </li>
      )
      continue
    }

    if (line.match(/^\d+\. /)) {
      parts.push(
        <li key={key++} className="ml-4 list-decimal">
          {formatInlineMarkdown(line.replace(/^\d+\. /, ''))}
        </li>
      )
      continue
    }

    // Empty line
    if (!line.trim()) {
      parts.push(<div key={key++} className="h-2" />)
      continue
    }

    // Regular paragraph
    parts.push(<p key={key++} className="leading-relaxed">{formatInlineMarkdown(line)}</p>)
  }

  return parts
}

function formatInlineMarkdown(text: string): React.ReactNode {
  // Bold
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  // Italic
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>')
  // Inline code
  text = text.replace(/`(.*?)`/g, '<code class="px-1.5 py-0.5 bg-secondary rounded text-sm font-mono">$1</code>')
  // Links
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-primary underline underline-offset-2 hover:text-primary/80" target="_blank" rel="noopener">$1</a>')
  
  return <span dangerouslySetInnerHTML={{ __html: text }} />
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function MessageBubble({ message, isLatestAssistant = false, isThinking = false, showThinking = true, showToolCalls = true }: MessageBubbleProps) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const handleCopy = async () => {
    if (message.content) {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  const isStreaming = message.isStreaming && !message.content
  const showAvatar = !isUser && isLatestAssistant

  return (
    <div className={cn(
      "flex flex-col gap-2 animate-slide-up",
      isUser ? "items-end" : "items-start"
    )}>
      {/* Internal blocks (thinking + tool calls) with connectors */}
      {((showThinking && message.thinking && message.thinking.length > 0) || 
        (showToolCalls && message.toolCalls && message.toolCalls.length > 0)) && (
        <div className="w-full max-w-[92%] space-y-1">
          {/* Thinking blocks */}
          {showThinking && message.thinking && message.thinking.map((thinking, index) => {
            const hasThinkingBefore = index > 0
            return (
              <ThinkingBlock 
                key={thinking.id} 
                thinking={thinking} 
                isActive={message.isStreaming && index === message.thinking!.length - 1}
                showConnector={hasThinkingBefore}
                duration={thinking.duration}
              />
            )
          })}
          
          {/* Tool calls */}
          {showToolCalls && message.toolCalls && message.toolCalls.map((toolCall, index) => {
            const hasBlockBefore = (showThinking && message.thinking && message.thinking.length > 0) || index > 0
            return (
              <ToolCallCard 
                key={toolCall.id} 
                toolCall={toolCall} 
                showConnector={hasBlockBefore}
              />
            )
          })}
        </div>
      )}

      {/* Main message bubble */}
      {(message.content || isStreaming) && (
        <div className={cn(
          "max-w-[92%]",
          isUser 
            ? "bg-user-bubble text-user-bubble-foreground rounded-2xl rounded-br-md px-4 py-3" 
            : "text-foreground"
        )}>
          {isStreaming ? (
            <TypingIndicator />
          ) : (
            <div className="space-y-1 text-[15px]">
              {parseMarkdown(message.content)}
            </div>
          )}
        </div>
      )}

      {/* Images */}
      {message.images && message.images.length > 0 && (
        <div className={cn(
          "flex flex-wrap gap-2 max-w-[92%]",
          isUser ? "justify-end" : "justify-start"
        )}>
          {message.images.map((src, i) => (
            <button
              key={i}
              onClick={() => setExpandedImage(src)}
              className="relative w-40 h-40 rounded-xl overflow-hidden shadow-lg hover:opacity-90 transition-opacity"
            >
              <Image
                src={src}
                alt=""
                fill
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Audio */}
      {message.audioUrl && (
        <div className="max-w-[92%] w-full">
          <AudioPlayer url={message.audioUrl} />
        </div>
      )}

      {/* Timestamp and Copy */}
      <div className={cn(
        "flex items-center gap-1.5 px-1",
        isUser ? "flex-row-reverse" : "flex-row"
      )}>
        <span className="text-[11px] text-muted-foreground">
          {formatTime(message.timestamp)}
        </span>
        {message.content && (
          <button
            onClick={handleCopy}
            className="p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors rounded"
            aria-label="Copy message"
          >
            {copied ? (
              <Check className="w-3 h-3 text-green-500" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        )}
      </div>

      {/* Fullscreen image modal */}
      {expandedImage && (
        <div 
          className="fixed inset-0 z-50 bg-background/95 flex items-center justify-center p-4"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative w-full h-full max-w-3xl max-h-[80vh]">
            <Image
              src={expandedImage}
              alt=""
              fill
              className="object-contain"
            />
          </div>
        </div>
      )}
    </div>
  )
}
