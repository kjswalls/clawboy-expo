'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'

interface AIAvatarProps {
  state?: 'idle' | 'thinking'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  onClick?: () => void
}

export function AIAvatar({ state = 'idle', size = 'md', onClick }: AIAvatarProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative rounded-full overflow-hidden transition-all shrink-0",
        sizeClasses[size],
        state === 'thinking' && "shadow-[0_0_12px_rgba(168,85,247,0.6)]",
        onClick && "cursor-pointer hover:scale-105 active:scale-95"
      )}
      aria-label="AI Assistant"
    >
      {/* Animated ring when thinking */}
      {state === 'thinking' && (
        <div className="absolute inset-0 rounded-full border-2 border-purple-500 animate-pulse" />
      )}
      
      <Image
        src="/images/ai-avatar.jpg"
        alt="AI Assistant"
        fill
        className="object-cover"
      />
    </button>
  )
}
