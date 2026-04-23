'use client'

import { cn } from '@/lib/utils'
import { Image, Search, FileText, Code, Zap, Globe, Mic } from 'lucide-react'

interface Command {
  id: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

const commands: Command[] = [
  { id: 'image', name: 'image', description: 'Generate an image', icon: Image },
  { id: 'search', name: 'search', description: 'Search the web', icon: Search },
  { id: 'read', name: 'read', description: 'Read a file or URL', icon: FileText },
  { id: 'code', name: 'code', description: 'Execute code', icon: Code },
  { id: 'agent', name: 'agent', description: 'Switch agent mode', icon: Zap },
  { id: 'browse', name: 'browse', description: 'Browse a website', icon: Globe },
  { id: 'voice', name: 'voice', description: 'Voice input', icon: Mic },
]

interface CommandPaletteProps {
  query: string
  onSelect: (command: Command) => void
  selectedIndex: number
}

export function CommandPalette({ query, onSelect, selectedIndex }: CommandPaletteProps) {
  const filteredCommands = commands.filter(cmd => 
    cmd.name.toLowerCase().includes(query.toLowerCase()) ||
    cmd.description.toLowerCase().includes(query.toLowerCase())
  )

  if (filteredCommands.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 mx-4 animate-slide-up">
      <div className="bg-popover border border-border rounded-xl shadow-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-border">
          <span className="text-xs text-muted-foreground">Commands</span>
        </div>
        <div className="py-1">
          {filteredCommands.map((command, index) => {
            const Icon = command.icon
            return (
              <button
                key={command.id}
                onClick={() => onSelect(command)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  index === selectedIndex 
                    ? "bg-accent text-accent-foreground" 
                    : "hover:bg-muted"
                )}
              >
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">/{command.name}</p>
                  <p className="text-xs text-muted-foreground">{command.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
