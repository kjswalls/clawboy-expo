'use client'

import { cn } from '@/lib/utils'
import type { ConnectionStatus as ConnectionStatusType } from '@/lib/types'

interface ConnectionStatusProps {
  status: ConnectionStatusType
}

const statusConfig = {
  connected: { color: 'bg-success', label: 'Connected' },
  connecting: { color: 'bg-warning animate-pulse', label: 'Connecting...' },
  disconnected: { color: 'bg-destructive', label: 'Disconnected' },
}

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  const config = statusConfig[status]
  
  return (
    <div className="flex items-center gap-2">
      <div className={cn("w-2 h-2 rounded-full", config.color)} />
      <span className="text-xs text-muted-foreground">{config.label}</span>
    </div>
  )
}
