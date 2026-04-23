'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CodeBlockProps {
  code: string
  language?: string
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group rounded-lg overflow-hidden bg-secondary/80 border border-border my-2">
      {language && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-secondary border-b border-border">
          <span className="text-xs text-muted-foreground font-mono">{language}</span>
          <button
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors",
              "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {copied ? (
              <>
                <Check className="w-3 h-3" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      )}
      <pre className="p-3 overflow-x-auto scrollbar-thin">
        <code className="text-sm font-mono text-foreground">{code}</code>
      </pre>
      {!language && (
        <button
          onClick={handleCopy}
          className={cn(
            "absolute top-2 right-2 p-1.5 rounded transition-all",
            "bg-secondary/80 text-muted-foreground hover:text-foreground",
            "opacity-0 group-hover:opacity-100"
          )}
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      )}
    </div>
  )
}
