'use client'

import { Sparkles, Code, FileText, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'

const suggestions = [
  { icon: Code, text: 'Write a React component' },
  { icon: FileText, text: 'Summarize this document' },
  { icon: Lightbulb, text: 'Brainstorm ideas for...' },
  { icon: Sparkles, text: 'Help me understand...' },
]

interface EmptyStateProps {
  onSuggestionClick: (text: string) => void
}

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Sparkles className="w-8 h-8 text-primary" />
      </div>
      
      <h2 className="text-xl font-semibold text-foreground mb-2 text-center text-balance">
        How can I help you today?
      </h2>
      <p className="text-muted-foreground text-center mb-8 max-w-sm text-balance">
        Ask me anything or try one of these suggestions to get started.
      </p>
      
      <div className="grid grid-cols-1 gap-3 w-full max-w-sm">
        {suggestions.map((suggestion, i) => {
          const Icon = suggestion.icon
          return (
            <button
              key={i}
              onClick={() => onSuggestionClick(suggestion.text)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all",
                "bg-secondary hover:bg-secondary/80 border border-border hover:border-ring"
              )}
            >
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <span className="text-sm text-foreground">{suggestion.text}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
