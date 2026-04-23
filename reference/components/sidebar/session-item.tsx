'use client'

import { useState } from 'react'
import { Pin, Trash2, Edit2, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Session } from '@/lib/types'

interface SessionItemProps {
  session: Session
  isActive: boolean
  onSelect: () => void
  onPin: () => void
  onDelete: () => void
  onRename: (newTitle: string) => void
}

export function SessionItem({ 
  session, 
  isActive, 
  onSelect, 
  onPin, 
  onDelete, 
  onRename 
}: SessionItemProps) {
  const [showActions, setShowActions] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(session.title)

  const handleRename = () => {
    if (renameValue.trim() && renameValue !== session.title) {
      onRename(renameValue.trim())
    }
    setIsRenaming(false)
  }

  return (
    <div
      className={cn(
        "group relative flex items-start gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all",
        isActive 
          ? "bg-secondary" 
          : "hover:bg-secondary/50"
      )}
      onClick={onSelect}
    >
      {/* Title and Preview */}
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') {
                setRenameValue(session.title)
                setIsRenaming(false)
              }
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="w-full bg-transparent text-sm text-foreground outline-none border-b border-primary"
          />
        ) : (
          <>
            <span className={cn(
              "text-sm truncate block",
              isActive ? "text-foreground" : "text-foreground/80"
            )}>
              {session.title}
            </span>
            {session.preview && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {session.preview}
              </p>
            )}
          </>
        )}
      </div>
      
      {/* More button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          setShowActions(!showActions)
        }}
        className={cn(
          "p-1 rounded transition-opacity flex-shrink-0",
          showActions ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          "hover:bg-muted"
        )}
      >
        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
      </button>
      
      {/* Actions dropdown */}
      {showActions && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={(e) => {
              e.stopPropagation()
              setShowActions(false)
            }} 
          />
          <div className="absolute right-0 top-full mt-1 z-20 bg-popover border border-border rounded-lg shadow-xl py-1 min-w-[140px] animate-in fade-in slide-in-from-top-2 duration-150">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onPin()
                setShowActions(false)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <Pin className="w-4 h-4" />
              {session.isPinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsRenaming(true)
                setShowActions(false)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              Rename
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
                setShowActions(false)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}
