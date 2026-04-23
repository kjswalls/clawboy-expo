'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Message, ConnectionStatus } from '@/lib/types'
import { ChatHeader } from './chat-header'
import { ChatInput } from './chat-input'
import { MessageBubble } from './message-bubble'
import { EmptyState } from './empty-state'

interface ChatScreenProps {
  messages: Message[]
  connectionStatus: ConnectionStatus
  onSend: (message: string) => void
  onMenuClick: () => void
  onSettingsClick: () => void
  disabled?: boolean
  isThinking?: boolean
  onStop?: () => void
  model?: string
  agent?: string
  contextUsed?: number
  contextTotal?: number
}

export function ChatScreen({ 
  messages, 
  connectionStatus, 
  onSend, 
  onMenuClick, 
  onSettingsClick,
  disabled = false,
  isThinking = false,
  onStop,
  model = 'Claude 4',
  agent = 'main',
  contextUsed = 0,
  contextTotal = 200000,
}: ChatScreenProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showThinking, setShowThinking] = useState(true)
  const [showToolCalls, setShowToolCalls] = useState(true)
  const [isScrolledFromTop, setIsScrolledFromTop] = useState(false)
  const [isScrolledFromBottom, setIsScrolledFromBottom] = useState(false)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false)
  const prevMessageCountRef = useRef(messages.length)
  const prevScrollHeightRef = useRef(0)
  const isAutoScrollingRef = useRef(false)
  const isEmpty = messages.length === 0

  const scrollToBottom = useCallback((instant = false) => {
    if (scrollRef.current) {
      isAutoScrollingRef.current = true
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: instant ? 'instant' : 'smooth'
      })
      setHasNewMessages(false)
      setUserHasScrolledUp(false)
      // Reset the flag after scroll completes
      setTimeout(() => {
        isAutoScrollingRef.current = false
      }, instant ? 50 : 300)
    }
  }, [])

  // Handle message changes - reset scroll on user message, track new AI messages while scrolled up
  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    if (messages.length > prevMessageCountRef.current) {
      if (lastMessage?.role === 'user') {
        // User just sent a message - reset scroll intent and scroll to bottom
        setUserHasScrolledUp(false)
        scrollToBottom(true)
      } else if (userHasScrolledUp && lastMessage?.role === 'assistant') {
        // New AI message arrived while user is scrolled up
        setHasNewMessages(true)
      }
    }
    prevMessageCountRef.current = messages.length
  }, [messages, scrollToBottom, userHasScrolledUp])

  // Auto-scroll during streaming if user hasn't scrolled up, show indicator if they have
  useEffect(() => {
    if (scrollRef.current) {
      const currentScrollHeight = scrollRef.current.scrollHeight
      
      // Content height changed (streaming new content)
      if (currentScrollHeight > prevScrollHeightRef.current) {
        if (userHasScrolledUp) {
          // User is scrolled up - show new messages indicator
          setHasNewMessages(true)
        } else {
          // User is at bottom - auto-scroll
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      }
      
      prevScrollHeightRef.current = currentScrollHeight
    }
  })

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      
      setIsScrolledFromTop(scrollTop > 10)
      setIsScrolledFromBottom(distanceFromBottom > 200)
      
      // Detect user manually scrolling up (not from our auto-scroll)
      if (!isAutoScrollingRef.current && distanceFromBottom > 100) {
        setUserHasScrolledUp(true)
      }
      
      // Clear flags when user scrolls back to bottom
      if (distanceFromBottom < 50) {
        setHasNewMessages(false)
        setUserHasScrolledUp(false)
      }
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <ChatHeader 
        onMenuClick={onMenuClick}
        onSettingsClick={onSettingsClick}
      />
      
      {isEmpty ? (
        <EmptyState onSuggestionClick={onSend} />
      ) : (
        <div className="relative flex-1 overflow-hidden">
          {/* Top fade gradient - only visible when scrolled */}
          <div 
            className={cn(
              "absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none transition-opacity duration-200",
              isScrolledFromTop ? "opacity-100" : "opacity-0"
            )} 
          />
          
          <div 
            ref={scrollRef}
            onScroll={handleScroll}
            className={cn(
              "h-full overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin"
            )}
          >
            {messages.map((message, index) => {
            // Find if this is the latest assistant message
            const isLatestAssistant = message.role === 'assistant' && 
              !messages.slice(index + 1).some(m => m.role === 'assistant')
            
            return (
              <MessageBubble 
                key={message.id} 
                message={message} 
                isLatestAssistant={isLatestAssistant}
                isThinking={isThinking}
                showThinking={showThinking}
                showToolCalls={showToolCalls}
              />
            )
          })}
          </div>
          
          {/* Scroll to bottom button */}
          <button
            onClick={() => scrollToBottom()}
            className={cn(
              "absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary border border-border shadow-lg transition-all duration-200",
              isScrolledFromBottom 
                ? "opacity-100 translate-y-0" 
                : "opacity-0 translate-y-4 pointer-events-none"
            )}
          >
            {hasNewMessages && (
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            )}
            <ArrowDown className="w-3.5 h-3.5 text-foreground" />
            <span className="text-xs font-medium text-foreground">
              {hasNewMessages ? 'New messages' : 'Scroll to bottom'}
            </span>
          </button>
        </div>
      )}
      
      <ChatInput 
        onSend={onSend} 
        disabled={disabled}
        isThinking={isThinking}
        onStop={onStop}
        model={model}
        agent={agent}
        connectionStatus={connectionStatus}
        contextUsed={contextUsed}
        contextTotal={contextTotal}
        showThinking={showThinking}
        showToolCalls={showToolCalls}
        onToggleThinking={() => setShowThinking(!showThinking)}
        onToggleToolCalls={() => setShowToolCalls(!showToolCalls)}
      />
    </div>
  )
}
