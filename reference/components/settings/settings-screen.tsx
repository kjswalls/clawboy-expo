'use client'

import { useState } from 'react'
import { ArrowLeft, Server, Moon, Sun, Plus, Trash2, Check, ScrollText, Settings, Bell, Wifi, ChevronRight, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ServerProfile, ConnectionStatus } from '@/lib/types'
import { AddServerSheet } from './add-server-sheet'

interface SettingsScreenProps {
  isOpen: boolean
  onClose: () => void
  serverProfiles: ServerProfile[]
  activeProfile: ServerProfile | null
  connectionStatus: ConnectionStatus
  isDarkMode: boolean
  onToggleTheme: () => void
  onSelectProfile: (id: string) => void
  onAddProfile: (profile: Omit<ServerProfile, 'id'>) => void
  onDeleteProfile: (id: string) => void
}

export function SettingsScreen({
  isOpen,
  onClose,
  serverProfiles,
  activeProfile,
  connectionStatus,
  isDarkMode,
  onToggleTheme,
  onSelectProfile,
  onAddProfile,
  onDeleteProfile,
}: SettingsScreenProps) {
  const [showAddProfile, setShowAddProfile] = useState(false)
  const [editingProfile, setEditingProfile] = useState<ServerProfile | null>(null)

  const handleAddProfile = async (profile: {
    name: string
    url: string
    port: string
    authType: 'token' | 'password'
    authValue: string
  }): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    const fullUrl = profile.port 
      ? `${profile.url}:${profile.port}`
      : profile.url

    onAddProfile({
      name: profile.name,
      url: fullUrl,
      authToken: profile.authValue,
      isActive: false,
    })
    
    return true
  }

  const statusColors = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500 animate-pulse',
    disconnected: 'bg-red-500',
  }

  const statusLabels = {
    connected: 'Connected',
    connecting: 'Connecting...',
    disconnected: 'Disconnected',
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col animate-fade-in">
      {/* Header */}
      <header className="safe-area-top border-b border-border">
        <div className="flex items-center justify-between px-4 py-2">
          <button
            onClick={onClose}
            className="p-1.5 -ml-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-sm font-medium text-foreground">Settings</h1>
          <div className="w-7" /> {/* Spacer for centering */}
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Account Card */}
        <div className="px-4 pt-4">
          <div className="bg-primary/10 rounded-2xl p-1 pb-2">
            <div className="bg-card rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                  <User className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">ClawBoy User</p>
                  <p className="text-xs text-muted-foreground">user@clawboy.app</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between px-3 pt-1.5">
              <span className="text-xs text-primary/80">Free plan</span>
              <button className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                Edit profile
              </button>
            </div>
          </div>
        </div>

        {/* Connection Section */}
        <section className="px-4 pt-6">
          <h2 className="text-sm font-semibold text-foreground mb-3">Connection</h2>
          
          {/* Current Server Card */}
          {activeProfile && (
            <div className="bg-card rounded-xl border border-border px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                  <Server className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{activeProfile.name}</p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                    <Wifi className="w-3 h-3 shrink-0" />
                    {activeProfile.url}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={cn("w-1.5 h-1.5 rounded-full", statusColors[connectionStatus])} />
                  <span className={cn(
                    "text-xs",
                    connectionStatus === 'connected' ? "text-green-500" :
                    connectionStatus === 'connecting' ? "text-yellow-500" :
                    "text-red-500"
                  )}>
                    {statusLabels[connectionStatus]}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center mt-2 pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                  <button 
                    className="flex items-center gap-1.5 text-xs font-medium text-foreground px-3 py-1 border border-foreground/30 rounded-lg hover:bg-foreground/5 transition-colors"
                  >
                    <ScrollText className="w-3 h-3" />
                    Gateway logs
                  </button>
                  <button 
                    onClick={() => {
                      setEditingProfile(activeProfile)
                      setShowAddProfile(true)
                    }}
                    className="flex items-center gap-1.5 text-xs font-medium text-foreground px-3 py-1 border border-foreground/30 rounded-lg hover:bg-foreground/5 transition-colors"
                  >
                    <Settings className="w-3 h-3" />
                    Edit connection
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Server Profiles Sub-section */}
          <h3 className="text-xs font-medium text-muted-foreground mt-4 mb-2">Server profiles</h3>
          
          <div className="bg-card rounded-xl border border-border divide-y divide-border">
            {serverProfiles.map((profile, index) => (
              <div 
                key={profile.id}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 hover:bg-secondary/50 transition-colors cursor-pointer",
                  index === 0 && "rounded-t-xl",
                  index === serverProfiles.length - 1 && serverProfiles.length > 0 && "rounded-b-xl"
                )}
                onClick={() => onSelectProfile(profile.id)}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                  profile.isActive ? "border-foreground bg-foreground" : "border-muted-foreground/30"
                )}>
                  {profile.isActive && <Check className="w-2.5 h-2.5 text-background" />}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{profile.name}</p>
                    {profile.isActive && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{profile.url}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingProfile(profile)
                      setShowAddProfile(true)
                    }}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
                    aria-label="Configure profile"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteProfile(profile.id)
                    }}
                    className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-secondary transition-colors"
                    aria-label="Delete profile"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            
            </div>
          
          {/* Add Profile Button */}
          <button
            onClick={() => {
              setEditingProfile(null)
              setShowAddProfile(true)
            }}
            className="mt-3 flex items-center gap-1.5 text-xs font-medium text-foreground px-3 py-1.5 bg-secondary rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <Plus className="w-3 h-3 text-primary" />
            Add server profile
          </button>
        </section>
        
        {/* General Section */}
        <section className="px-4 pt-6">
          <h2 className="text-sm font-semibold text-foreground mb-3">General</h2>
          
          <div className="bg-card rounded-xl border border-border">
            {/* Notifications */}
            <button className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-secondary/50 transition-colors rounded-xl">
              <Bell className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-foreground">Notifications</p>
                <p className="text-xs text-muted-foreground">Manage alerts and push notifications</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </section>
        
        {/* Appearance Section */}
        <section className="px-4 pt-6">
          <h2 className="text-sm font-semibold text-foreground mb-3">Appearance</h2>
          
          <div className="bg-card rounded-xl border border-border">
            <button
              onClick={onToggleTheme}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-secondary/50 transition-colors rounded-xl"
            >
              {isDarkMode ? (
                <Moon className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <Sun className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-foreground">Theme</p>
                <p className="text-xs text-muted-foreground">Switch between light and dark mode</p>
              </div>
              <span className="text-xs text-muted-foreground">
                {isDarkMode ? 'Dark' : 'Light'}
              </span>
            </button>
          </div>
        </section>
        
        {/* App Info */}
        <section className="px-4 pt-8 pb-8">
          <div className="flex flex-col items-center gap-3">
            <button className="flex items-center gap-1.5 text-xs font-medium text-foreground px-3 py-1 border border-foreground/30 rounded-lg hover:bg-foreground/5 transition-colors">
              Report a bug / Request a feature
            </button>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">ClawBoy v1.0.0</p>
              <p className="text-xs text-muted-foreground mt-1">Built with care</p>
            </div>
          </div>
        </section>
      </div>

      {/* Add/Edit Server Sheet */}
      <AddServerSheet
        isOpen={showAddProfile}
        onClose={() => {
          setShowAddProfile(false)
          setEditingProfile(null)
        }}
        onSave={handleAddProfile}
        editingProfile={editingProfile}
      />
    </div>
  )
}
