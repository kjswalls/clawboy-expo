'use client'

import { useState } from 'react'
import { ChevronRight, FileText, Search, Code, Image, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToolCall } from '@/lib/types'

interface ToolCallCardProps {
  toolCall: ToolCall
  showConnector?: boolean
}

const toolIcons = {
  file_read: FileText,
  web_search: Search,
  code_execution: Code,
  image_generation: Image,
}

const toolLabels = {
  file_read: 'Read',
  web_search: 'Searched',
  code_execution: 'Ran code',
  image_generation: 'Generated image',
}

export function ToolCallCard({ toolCall, showConnector = false }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const Icon = toolIcons[toolCall.type]
  const label = toolLabels[toolCall.type]
  const isRunning = toolCall.status === 'running' || toolCall.status === 'pending'

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
          {isRunning ? (
            <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
          ) : (
            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>
        
        <div className="flex-1 min-w-0 flex items-center truncate">
          <span className="text-sm text-muted-foreground flex-shrink-0">
            {isRunning ? `${toolLabels[toolCall.type].replace('ed', 'ing').replace('Ran', 'Running')}...` : label}
          </span>
          {/* Description/name with divider */}
          {(toolCall.name || toolCall.input) && (
            <>
              <span className="text-muted-foreground/40 mx-1.5 flex-shrink-0">·</span>
              <span className="text-sm text-muted-foreground/70 truncate">
                {toolCall.name || toolCall.input}
              </span>
            </>
          )}
        </div>
        
        {(toolCall.input || toolCall.output) && (
          <ChevronRight 
            className={cn(
              "w-4 h-4 text-muted-foreground transition-transform duration-200 flex-shrink-0",
              isExpanded && "rotate-90"
            )} 
          />
        )}
      </button>
      
      {(toolCall.input || toolCall.output) && (
        <div className={cn(
          "overflow-hidden transition-all duration-200",
          isExpanded ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
        )}>
          <div className="pl-8 py-2 border-l-2 border-dashed border-primary/30 ml-3 mt-1 space-y-2">
            {toolCall.input && (
              <div>
                <p className="text-xs text-muted-foreground/70 mb-1">Input</p>
                <p className="text-sm text-muted-foreground font-mono bg-secondary/30 px-2 py-1 rounded">
                  {toolCall.input}
                </p>
              </div>
            )}
            {toolCall.output && (
              <div>
                <p className="text-xs text-muted-foreground/70 mb-1">Output</p>
                <p className="text-sm text-muted-foreground font-mono bg-secondary/30 px-2 py-1 rounded whitespace-pre-wrap max-h-32 overflow-auto scrollbar-thin">
                  {toolCall.output}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
