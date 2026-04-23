'use client'

import { X, Plus, ChevronRight, ChevronDown, MessageSquare, Pin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Session } from '@/lib/types'
import { SessionItem } from './session-item'
import { useState } from 'react'

interface SessionSidebarProps {
  isOpen: boolean
  onClose: () => void
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onPinSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onRenameSession: (id: string, newTitle: string) => void
}

export function SessionSidebar({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onPinSession,
  onDeleteSession,
  onRenameSession,
}: SessionSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [favoritesExpanded, setFavoritesExpanded] = useState(true)
  const [recentsExpanded, setRecentsExpanded] = useState(true)
  
  const pinnedSessions = sessions.filter(s => s.isPinned)
  const unpinnedSessions = sessions.filter(s => !s.isPinned)
  
  const filteredPinned = pinnedSessions.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.preview.toLowerCase().includes(searchQuery.toLowerCase())
  )
  
  const filteredUnpinned = unpinnedSessions.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.preview.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div 
        className={cn(
          "fixed inset-y-0 left-0 w-[280px] max-w-[85vw] bg-background z-50 flex flex-col transition-transform duration-300 ease-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="safe-area-top">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-sm font-medium text-foreground">Sessions</span>
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
              aria-label="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* New Chat Button */}
        <div className="px-3 pb-3">
          <button
            onClick={() => {
              onNewSession()
              onClose()
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-foreground px-3 py-1.5 bg-secondary rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <Plus className="w-3 h-3 text-primary" />
            New Session
          </button>
        </div>
        
        
        
        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 scrollbar-thin">
          {/* Favorites Section */}
          {filteredPinned.length > 0 && (
            <div className="mb-2">
              <button 
                onClick={() => setFavoritesExpanded(!favoritesExpanded)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Pin className="w-3 h-3" />
                  Pinned
                </span>
                <ChevronRight className={cn(
                  "w-4 h-4 transition-transform",
                  favoritesExpanded && "rotate-90"
                )} />
              </button>
              
              {favoritesExpanded && (
                <div className="space-y-0.5">
                  {filteredPinned.map(session => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      isActive={session.id === activeSessionId}
                      onSelect={() => {
                        onSelectSession(session.id)
                        onClose()
                      }}
                      onPin={() => onPinSession(session.id)}
                      onDelete={() => onDeleteSession(session.id)}
                      onRename={(title) => onRenameSession(session.id, title)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* Recent Chats Section */}
          <div>
            <button 
              onClick={() => setRecentsExpanded(!recentsExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" />
                Recent Sessions
              </span>
              <ChevronDown className={cn(
                "w-4 h-4 transition-transform",
                !recentsExpanded && "-rotate-90"
              )} />
            </button>
            
            {recentsExpanded && (
              <div className="space-y-0.5">
                {filteredUnpinned.length > 0 ? (
                  <>
                    {filteredUnpinned.map(session => (
                      <SessionItem
                        key={session.id}
                        session={session}
                        isActive={session.id === activeSessionId}
                        onSelect={() => {
                          onSelectSession(session.id)
                          onClose()
                        }}
                        onPin={() => onPinSession(session.id)}
                        onDelete={() => onDeleteSession(session.id)}
                        onRename={(title) => onRenameSession(session.id, title)}
                      />
                    ))}
                    
                    {filteredUnpinned.length > 5 && (
                      <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <span>...</span>
                        <span>More</span>
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <MessageSquare className="w-8 h-8 text-muted-foreground/50 mb-2" />
                    <p className="text-muted-foreground text-sm">No chats yet</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
