'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { 
  Paperclip, 
  Brain, 
  Wrench, 
  Camera,
  Mic,
  ArrowUp,
  X,
  Square,
  Slash,
  RefreshCw,
  Image as ImageIcon,
  FileText,
  ChevronDown,
  Check,
  ListPlus
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CommandPalette } from './command-palette'

interface Attachment {
  id: string
  name: string
  type: 'image' | 'file'
  preview?: string
}

interface ChatInputProps {
  onSend: (message: string, attachments?: Attachment[]) => void
  disabled?: boolean
  isThinking?: boolean
  onStop?: () => void
  model?: string
  agent?: string
  connectionStatus?: 'connected' | 'connecting' | 'disconnected'
  contextUsed?: number
  contextTotal?: number
  showThinking?: boolean
  showToolCalls?: boolean
  onToggleThinking?: () => void
  onToggleToolCalls?: () => void
}



export function ChatInput({ 
  onSend, 
  disabled = false,
  isThinking = false,
  onStop,
  model = 'Claude 4',
  agent = 'ClawBoy Agent',
  connectionStatus = 'connected',
  contextUsed = 0,
  contextTotal = 200000,
  showThinking = true,
  showToolCalls = true,
  onToggleThinking,
  onToggleToolCalls,
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const [showCommands, setShowCommands] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [autocomplete, setAutocomplete] = useState('')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [selectedModel, setSelectedModel] = useState(model)
  const [selectedAgent, setSelectedAgent] = useState(agent)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const models = [
    { id: 'claude-4', name: 'Claude 4', color: 'bg-emerald-500' },
    { id: 'claude-3.5', name: 'Claude 3.5 Sonnet', color: 'bg-orange-500' },
    { id: 'gpt-5', name: 'GPT-5', color: 'bg-green-500' },
    { id: 'gemini-2', name: 'Gemini 2 Pro', color: 'bg-blue-500' },
  ]

  const agents = [
    { id: 'clawboy', name: 'ClawBoy Agent', icon: '🐾', color: 'bg-amber-500' },
    { id: 'coder', name: 'Code Assistant', icon: '💻', color: 'bg-purple-500' },
    { id: 'researcher', name: 'Deep Research', icon: '🔬', color: 'bg-cyan-500' },
    { id: 'writer', name: 'Writing Helper', icon: '✍️', color: 'bg-green-500' },
  ]

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }, [value])

  useEffect(() => {
    if (value.startsWith('/')) {
      setShowCommands(true)
      setCommandQuery(value.slice(1))
      setSelectedCommandIndex(0)
    } else {
      setShowCommands(false)
      setCommandQuery('')
    }

    // Demo autocomplete
    if (value.toLowerCase().startsWith('analyze the attached') && !value.includes('usability')) {
      setAutocomplete(' interface screenshot and identify potential usability issues')
    } else if (value.toLowerCase().startsWith('help me understand') && !value.includes('dropping')) {
      setAutocomplete(' why users are dropping off during onboarding')
    } else {
      setAutocomplete('')
    }
  }, [value])

  const handleSend = () => {
    if ((!value.trim() && attachments.length === 0) || disabled) return
    onSend(value.trim(), attachments)
    setValue('')
    setAttachments([])
    setShowCommands(false)
    setAutocomplete('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommands) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedCommandIndex(prev => prev + 1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedCommandIndex(prev => Math.max(0, prev - 1))
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        setShowCommands(false)
        setValue('')
      } else if (e.key === 'Escape') {
        setShowCommands(false)
      }
      return
    }

    // Accept autocomplete with Tab
    if (e.key === 'Tab' && autocomplete) {
      e.preventDefault()
      setValue(value + autocomplete)
      setAutocomplete('')
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    
    const newAttachments: Attachment[] = Array.from(files).map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      type: file.type.startsWith('image/') ? 'image' : 'file',
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    }))
    
    setAttachments(prev => [...prev, ...newAttachments])
    e.target.value = ''
  }

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="relative px-4 pt-3 pb-3 safe-area-bottom bg-background">
      {showCommands && (
        <CommandPalette 
          query={commandQuery}
          selectedIndex={selectedCommandIndex}
          onSelect={(cmd) => {
            setValue(`/${cmd.name} `)
            setShowCommands(false)
            textareaRef.current?.focus()
          }}
        />
      )}

      {/* Header Bar - Single Row */}
      <div className="flex items-center justify-between mb-3">
        {/* Left: Model & Agent Pickers */}
        <div className="flex items-center gap-2">
          {/* Model Picker */}
          <div className="relative">
            <button
              onClick={() => {
                setShowModelPicker(!showModelPicker)
                setShowAgentPicker(false)
              }}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-0 bg-secondary rounded-full border transition-colors hover:bg-muted h-7",
                showModelPicker ? "border-foreground/30" : "border-border"
              )}
            >
              <div className={cn(
                "w-4 h-4 rounded-full flex items-center justify-center",
                models.find(m => m.name === selectedModel)?.color || 'bg-emerald-500'
              )}>
                <span className="text-[9px] font-bold text-white">
                  {selectedModel.charAt(0)}
                </span>
              </div>
              <span className="text-xs text-foreground">{selectedModel}</span>
              <ChevronDown className={cn(
                "w-3 h-3 text-muted-foreground transition-transform",
                showModelPicker && "rotate-180"
              )} />
            </button>
            
            {/* Model Dropdown */}
            {showModelPicker && (
              <div className="absolute bottom-full left-0 mb-2 w-48 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50">
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedModel(m.name)
                      setShowModelPicker(false)
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted transition-colors",
                      selectedModel === m.name && "bg-muted"
                    )}
                  >
                    <div className={cn("w-5 h-5 rounded-full flex items-center justify-center", m.color)}>
                      <span className="text-[10px] font-bold text-white">{m.name.charAt(0)}</span>
                    </div>
                    <span className="text-sm text-foreground flex-1">{m.name}</span>
                    {selectedModel === m.name && (
                      <Check className="w-4 h-4 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Agent Picker */}
          <div className="relative">
            <button
              onClick={() => {
                setShowAgentPicker(!showAgentPicker)
                setShowModelPicker(false)
              }}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-0 bg-secondary rounded-full border transition-colors hover:bg-muted h-7",
                showAgentPicker ? "border-foreground/30" : "border-border"
              )}
            >
              <div className={cn(
                "w-4 h-4 rounded-full flex items-center justify-center",
                agents.find(a => a.name === selectedAgent)?.color || 'bg-amber-500'
              )}>
                <span className="text-[9px]">
                  {agents.find(a => a.name === selectedAgent)?.icon || '🐾'}
                </span>
              </div>
              <span className="text-xs text-foreground">{selectedAgent}</span>
              <ChevronDown className={cn(
                "w-3 h-3 text-muted-foreground transition-transform",
                showAgentPicker && "rotate-180"
              )} />
            </button>
            
            {/* Agent Dropdown */}
            {showAgentPicker && (
              <div className="absolute bottom-full left-0 mb-2 w-48 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50">
                {agents.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setSelectedAgent(a.name)
                      setShowAgentPicker(false)
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted transition-colors",
                      selectedAgent === a.name && "bg-muted"
                    )}
                  >
                    <div className={cn("w-5 h-5 rounded-full flex items-center justify-center", a.color)}>
                      <span className="text-[10px]">{a.icon}</span>
                    </div>
                    <span className="text-sm text-foreground flex-1">{a.name}</span>
                    {selectedAgent === a.name && (
                      <Check className="w-4 h-4 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Brain, Tools, Refresh Buttons */}
        <div className="flex items-center gap-1">
          <button 
            onClick={onToggleThinking}
            className={cn(
              "p-1.5 transition-all rounded-lg hover:bg-secondary",
              showThinking 
                ? "text-primary bg-primary/10 shadow-[0_0_10px_rgba(168,85,247,0.3)]" 
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="Toggle thinking visibility"
          >
            <Brain className="w-4 h-4" />
          </button>
          <button 
            onClick={onToggleToolCalls}
            className={cn(
              "p-1.5 transition-all rounded-lg hover:bg-secondary",
              showToolCalls 
                ? "text-primary bg-primary/10 shadow-[0_0_10px_rgba(168,85,247,0.3)]" 
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="Toggle tool calls visibility"
          >
            <Wrench className="w-4 h-4" />
          </button>
          <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Outer Container - wraps input and info bar */}
      <div className={cn(
        "relative rounded-2xl transition-all duration-300",
        isThinking && "rainbow-glow"
      )}>
        {/* Purple/blue glow effect (visible when thinking) */}
        {isThinking && (
          <div className="absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500 opacity-75 blur-sm animate-rainbow-rotate" />
        )}
        
        <div className={cn(
          "relative rounded-2xl border border-border overflow-hidden transition-colors bg-muted/30",
          isThinking && "border-transparent",
          !isThinking && "focus-within:border-foreground/30"
        )}>
          {/* Main Input Area */}
          <div className="bg-secondary">
          {/* Image Attachments Preview */}
          {attachments.some(a => a.type === 'image') && (
            <div className="flex gap-2 p-3 pb-0">
              {attachments.filter(a => a.type === 'image').map((attachment) => (
                <div key={attachment.id} className="relative group">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted border border-border">
                    {attachment.preview ? (
                      <img 
                        src={attachment.preview} 
                        alt={attachment.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeAttachment(attachment.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-foreground text-background rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* File Attachments as Pills */}
          {attachments.some(a => a.type === 'file') && (
            <div className="flex flex-wrap gap-2 p-3 pb-0">
              {attachments.filter(a => a.type === 'file').map((attachment) => (
                <div 
                  key={attachment.id}
                  className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg border border-border"
                >
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-foreground">{attachment.name}</span>
                  <button
                    onClick={() => removeAttachment(attachment.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Text Input Area */}
          <div 
            className="relative px-4 pt-3 pb-2 min-h-[44px] cursor-text"
            onClick={() => textareaRef.current?.focus()}
          >
            <div className="relative pointer-events-none">
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isThinking ? "Queue a follow-up message ..." : "Ask anything, @models, /prompts ..."}
                disabled={disabled}
                rows={1}
                className={cn(
                  "w-full bg-transparent resize-none outline-none text-[15px] pointer-events-auto",
                  "max-h-[120px] overflow-y-auto",
                  "placeholder:text-muted-foreground"
                )}
                style={{ height: 'auto', minHeight: '1.5em' }}
              />
              {/* Autocomplete suggestion overlay */}
              {autocomplete && value && !isThinking && (
                <div className="absolute top-0 left-0 text-[15px] leading-relaxed whitespace-pre-wrap">
                  <span className="invisible">{value}</span>
                  <span className="text-muted-foreground/50">{autocomplete}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="flex items-center justify-between px-2.5 py-1 border-t border-border/50">
            {/* Left Actions */}
            <div className="flex items-center gap-0.5">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
                aria-label="Attach content"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>
              <input 
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.md,.json,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              <div className="w-px h-3.5 bg-border mx-0.5" />
              
              <button 
                onClick={() => {
                  setValue('/')
                  textareaRef.current?.focus()
                }}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
                aria-label="Commands"
              >
                <Slash className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-0.5">
              <button 
                className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
                aria-label="Take photo or video"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              <button 
                className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
                aria-label="Voice input"
              >
                <Mic className="w-3.5 h-3.5" />
              </button>
              
              {/* Stop button - only visible when thinking */}
              {isThinking && (
                <button
                  onClick={onStop}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
                  aria-label="Stop"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              )}
              
              {/* Send/Queue button */}
              <button
                onClick={handleSend}
                disabled={(!value.trim() && attachments.length === 0) || disabled}
                className={cn(
                  "p-2 rounded-lg transition-all ml-0.5",
                  (value.trim() || attachments.length > 0) && !disabled
                    ? isThinking 
                      ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600 shadow-lg shadow-purple-500/25"
                      : "bg-foreground text-background hover:bg-foreground/90"
                    : "bg-muted text-muted-foreground"
                )}
                aria-label={isThinking ? "Queue message" : "Send message"}
              >
                {isThinking ? (
                  <ListPlus className="w-3.5 h-3.5" strokeWidth={2.5} />
                ) : (
                  <ArrowUp className="w-3.5 h-3.5" strokeWidth={2.5} />
                )}
              </button>
            </div>
            </div>
          </div>

          {/* Info Bar - inside the outer container */}
          <div className="flex items-center justify-center px-3 py-1.5 bg-muted/30 border-t border-border/50">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">{selectedAgent}</span>
              <div className="w-px h-3 bg-border" />
              <div className="flex items-center gap-1">
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  connectionStatus === 'connected' ? "bg-green-500" :
                  connectionStatus === 'connecting' ? "bg-yellow-500 animate-pulse" :
                  "bg-red-500"
                )} />
                <span>{connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting' : 'Disconnected'}</span>
              </div>
              <div className="w-px h-3 bg-border" />
              <span>{selectedModel}</span>
              <div className="w-px h-3 bg-border" />
              <span>{Math.round(contextUsed / 1000)}k/{Math.round(contextTotal / 1000)}k ({Math.round((contextUsed / contextTotal) * 100)}%)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
