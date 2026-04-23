'use client'

import { Menu, Settings2 } from 'lucide-react'

interface ChatHeaderProps {
  onMenuClick: () => void
  onSettingsClick: () => void
}

export function ChatHeader({ 
  onMenuClick, 
  onSettingsClick, 
}: ChatHeaderProps) {
  return (
    <header className="relative safe-area-top bg-background/80 backdrop-blur-lg sticky top-0 z-10">
      {/* Gradient bottom border */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
      <div className="flex items-center justify-between px-4 py-2">
        <button
          onClick={onMenuClick}
          className="p-1.5 -ml-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary"
          aria-label="Open menu"
        >
          <Menu className="w-4 h-4" />
        </button>
        
        <button
          onClick={onSettingsClick}
          className="p-1.5 -mr-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary"
          aria-label="Settings"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
