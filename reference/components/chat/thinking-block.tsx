'use client'

import { useState } from 'react'
import { ChevronRight, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ThinkingBlock as ThinkingBlockType } from '@/lib/types'

interface ThinkingBlockProps {
  thinking: ThinkingBlockType
  isActive?: boolean
  duration?: string
  showConnector?: boolean
}

export function ThinkingBlock({ thinking, isActive = false, duration, showConnector = false }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="group relative">
      {/* Vertical connector line */}
      {showConnector && (
        <div className="absolute left-[11px] -top-1 h-1 border-l-2 border-dashed border-primary/40" />
      )}
      
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 py-1 w-full text-left"
      >
        {/* Icon badge */}
        <div className="relative flex items-center justify-center w-6 h-6 rounded-full bg-secondary border border-border flex-shrink-0">
          <Brain className={cn(
            "w-3.5 h-3.5 text-muted-foreground",
            isActive && "animate-pulse"
          )} />
        </div>
        
        <span className={cn(
          "text-sm text-muted-foreground flex-1 truncate",
          isActive && "animate-shimmer"
        )}>
          {isActive ? 'Thinking...' : `Thought${duration ? ` for ${duration}` : ''}`}
        </span>
        
        <ChevronRight 
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform duration-200",
            isExpanded && "rotate-90"
          )} 
        />
      </button>
      
      <div className={cn(
        "overflow-hidden transition-all duration-200",
        isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
      )}>
        <div className="pl-8 py-2 border-l-2 border-dashed border-primary/30 ml-3 mt-1">
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {thinking.content}
          </p>
        </div>
      </div>
    </div>
  )
}
