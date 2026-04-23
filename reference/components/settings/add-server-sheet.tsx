'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Loader2, Server, Wifi, Key, Lock, AlertCircle, ChevronRight, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EditingProfile {
  id: string
  name: string
  url: string
  authToken?: string
}

interface AddServerSheetProps {
  isOpen: boolean
  onClose: () => void
  onSave: (profile: {
    name: string
    url: string
    port: string
    authType: 'token' | 'password'
    authValue: string
  }) => Promise<boolean>
  editingProfile?: EditingProfile | null
}

export function AddServerSheet({ isOpen, onClose, onSave, editingProfile }: AddServerSheetProps) {
  const parseUrlAndPort = (fullUrl: string) => {
    const match = fullUrl.match(/^(.+):(\d+)$/)
    if (match) {
      return { url: match[1], port: match[2] }
    }
    return { url: fullUrl, port: '18789' }
  }

  const initialValues = editingProfile 
    ? parseUrlAndPort(editingProfile.url)
    : { url: '', port: '18789' }

  const [name, setName] = useState(editingProfile?.name || '')
  const [address, setAddress] = useState(initialValues.url)
  const [port, setPort] = useState(initialValues.port)
  const [authType, setAuthType] = useState<'token' | 'password'>('token')
  const [authValue, setAuthValue] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ name?: boolean; address?: boolean }>({})

  useEffect(() => {
    if (editingProfile) {
      const parsed = parseUrlAndPort(editingProfile.url)
      setName(editingProfile.name)
      setAddress(parsed.url)
      setPort(parsed.port)
      setAuthValue(editingProfile.authToken || '')
    } else {
      setName('')
      setAddress('')
      setPort('18789')
      setAuthValue('')
    }
    setError(null)
    setFieldErrors({})
  }, [editingProfile])

  const isTailnetUrl = address.includes('.ts.net') || address.includes('tailscale') || address.endsWith('.tail')

  const handleClear = () => {
    setName('')
    setAddress('')
    setPort('18789')
    setAuthType('token')
    setAuthValue('')
    setError(null)
    setFieldErrors({})
  }

  const handleCancel = () => {
    handleClear()
    onClose()
  }

  const handleSave = async () => {
    const errors: { name?: boolean; address?: boolean } = {}
    if (!name.trim()) errors.name = true
    if (!address.trim()) errors.address = true
    
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setError('Please fill in the required fields highlighted above')
      return
    }
    
    setFieldErrors({})
    setIsConnecting(true)
    setError(null)

    try {
      const success = await onSave({
        name: name.trim(),
        url: address.trim(),
        port: port.trim() || '18789',
        authType,
        authValue: authValue.trim(),
      })

      if (success) {
        handleClear()
        onClose()
      } else {
        setError('Failed to connect to server. Please check your settings and try again.')
      }
    } catch {
      setError('Connection failed. Please verify the server address and credentials.')
    } finally {
      setIsConnecting(false)
    }
  }

  const isValid = name.trim() && address.trim()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleCancel}
      />
      
      {/* Sheet */}
      <div className="relative mt-auto h-full bg-background flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <button
            onClick={handleCancel}
            className="p-1.5 -ml-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <h1 className="text-sm font-medium text-foreground">
            {editingProfile ? 'Edit Connection' : 'New Connection'}
          </h1>
          
          <button
            onClick={handleClear}
            className="flex items-center text-xs font-medium text-foreground px-3 py-1 border border-foreground/30 rounded-lg hover:bg-foreground/5 transition-colors"
          >
            Clear
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Server Info Card (when editing) */}
          {editingProfile && (
            <div className="px-4 pt-4">
              <div className="bg-card rounded-xl border border-border px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                    <Server className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{editingProfile.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{editingProfile.url}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Connection Section */}
          <div className="px-4 pt-6">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Connection</h2>
            
            <div className="bg-card rounded-xl border border-border divide-y divide-border">
              {/* Server Name */}
              <div className="px-3 py-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <label className={cn("text-sm font-medium", fieldErrors.name ? "text-destructive" : "text-foreground")}>
                    Server Name
                  </label>
                  <span className={cn("text-xs", fieldErrors.name ? "text-destructive" : "text-muted-foreground")}>Required</span>
                </div>
                <p className="text-xs text-muted-foreground mb-1.5">A friendly name to identify this connection</p>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: false }))
                  }}
                  placeholder="e.g. Home Server, Cloud GPU"
                  className={cn(
                    "w-full bg-secondary border rounded-lg px-2.5 py-1.5 text-sm outline-none transition-all placeholder:text-muted-foreground/50",
                    fieldErrors.name 
                      ? "border-destructive focus:border-destructive" 
                      : "border-transparent focus:border-primary/50"
                  )}
                />
              </div>

              {/* Server Address */}
              <div className="px-3 py-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <label className={cn("text-sm font-medium", fieldErrors.address ? "text-destructive" : "text-foreground")}>
                    Server Address
                  </label>
                  <span className={cn("text-xs", fieldErrors.address ? "text-destructive" : "text-muted-foreground")}>Required</span>
                </div>
                <p className="text-xs text-muted-foreground mb-1.5">IP address or domain name</p>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value)
                    if (fieldErrors.address) setFieldErrors(prev => ({ ...prev, address: false }))
                  }}
                  placeholder="192.168.1.100 or server.example.com"
                  className={cn(
                    "w-full bg-secondary border rounded-lg px-2.5 py-1.5 text-sm outline-none transition-all placeholder:text-muted-foreground/50 font-mono",
                    fieldErrors.address 
                      ? "border-destructive focus:border-destructive" 
                      : "border-transparent focus:border-primary/50"
                  )}
                />
              </div>

              {/* Port */}
              <div className="px-3 py-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <label className="text-sm font-medium text-foreground">Port</label>
                  <span className="text-xs text-muted-foreground">Default: 18789</span>
                </div>
                <p className="text-xs text-muted-foreground mb-1.5">Server port number</p>
                <input
                  type="text"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="18789"
                  className="w-full bg-secondary border border-transparent rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/50 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Tailscale Warning */}
          {isTailnetUrl && (
            <div className="px-4 pt-4">
              <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                  <Wifi className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-amber-500">Tailnet URL Detected</p>
                  <p className="text-xs text-amber-500/80 mt-1">
                    Make sure Tailscale is running and you&apos;re logged in on this device.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Authentication Section */}
          <div className="px-4 pt-6">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Authentication</h2>
            
            <div className="bg-card rounded-xl border border-border divide-y divide-border">
              {/* Auth Type */}
              <div className="px-3 py-2.5">
                <label className="text-sm font-medium text-foreground mb-1.5 block">Method</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAuthType('token')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all",
                      authType === 'token'
                        ? "bg-primary/10 text-primary border border-primary/30"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Key className="w-3.5 h-3.5" />
                    Token
                  </button>
                  <button
                    onClick={() => setAuthType('password')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all",
                      authType === 'password'
                        ? "bg-primary/10 text-primary border border-primary/30"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Password
                  </button>
                </div>
              </div>

              {/* Auth Value */}
              <div className="px-3 py-2.5">
                <label className="text-sm font-medium text-foreground mb-0.5 block">
                  {authType === 'token' ? 'Auth Token' : 'Password'}
                </label>
                <p className="text-xs text-muted-foreground mb-1.5">
                  {authType === 'token' ? 'Stored securely on this device' : 'Encrypted and stored locally'}
                </p>
                <input
                  type="password"
                  value={authValue}
                  onChange={(e) => setAuthValue(e.target.value)}
                  placeholder={authType === 'token' ? 'sk-xxxx-xxxx-xxxx' : 'Enter password'}
                  className="w-full bg-secondary border border-transparent rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/50 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="px-4 pt-4">
              <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-xl p-4">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-medium text-destructive">Connection Failed</p>
                  <p className="text-xs text-destructive/80 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Bottom spacing */}
          <div className="h-6" />
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-card/50 px-4 py-4 safe-area-bottom">
          <div className="flex items-center justify-end gap-2">
            {editingProfile && (
              <button
                className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-secondary transition-colors"
                aria-label="Delete profile"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={isConnecting}
              className={cn(
                "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                Object.keys(fieldErrors).length > 0
                  ? "bg-destructive/10 text-destructive border border-destructive/30"
                  : isValid && !isConnecting
                    ? "bg-secondary text-foreground border border-border hover:bg-muted"
                    : "bg-muted text-muted-foreground border border-border"
              )}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Testing...</span>
                </>
              ) : (
                <>
                  <span>{editingProfile ? 'Save Changes' : 'Connect Server'}</span>
                  <ChevronRight className="w-3 h-3" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
