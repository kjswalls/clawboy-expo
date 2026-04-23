import React, { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ChatHeader } from '@/components/chat/ChatHeader';
import { ConnectionBanner } from '@/components/chat/ConnectionBanner';
import { MessageList } from '@/components/chat';
import { InputBar } from '@/components/input/InputBar';
import type { DynamicPickerItem } from '@/components/input/InputBarHeader';
import { SessionSidebar } from '@/components/sidebar';
import { useTheme } from '@/hooks/useTheme';
import { useChat } from '@/hooks/useChat';
import { useSessions } from '@/hooks/useSessions';
import { useConnection } from '@/contexts/ConnectionContext';
import { useAgents } from '@/hooks/useAgents';
import { useModels } from '@/hooks/useModels';
import { APP_VERSION } from '@/lib/appMeta';
import type { Agent, Session } from '@/lib/openclaw/types';
import type { ChatMessage, ChatToolCall, MockSession, Model } from '@/types';
import type { ChatUiMessage, ChatUiThinkingBlock, ChatUiToolCall } from '@/types/chat-ui';

// ---------------------------------------------------------------------------
// Type adapters — bridge production types to UI component shapes without
// touching any visual component internals.
// ---------------------------------------------------------------------------

const TOOL_TYPE_MAP: Record<string, ChatUiToolCall['type']> = {
  read_file: 'file_read',
  read: 'file_read',
  file_read: 'file_read',
  web_search: 'web_search',
  search: 'web_search',
  browser: 'web_search',
  browse: 'web_search',
  code: 'code_execution',
  execute_code: 'code_execution',
  run_code: 'code_execution',
  image: 'image_generation',
  generate_image: 'image_generation',
};

function inferToolType(name: string): ChatUiToolCall['type'] {
  const lower = name.toLowerCase();
  for (const [key, type] of Object.entries(TOOL_TYPE_MAP)) {
    if (lower.includes(key)) {
      return type;
    }
  }
  return 'code_execution';
}

function adaptToolCall(tc: ChatToolCall): ChatUiToolCall {
  return {
    id: tc.id,
    type: inferToolType(tc.name),
    name: tc.name,
    input: tc.args ? JSON.stringify(tc.args) : undefined,
    output: tc.result,
    status: tc.status,
  };
}

function adaptMessage(msg: ChatMessage): ChatUiMessage {
  const thinking: ChatUiThinkingBlock[] | undefined = (() => {
    if (msg.thinkingBlocks && msg.thinkingBlocks.length > 0) {
      return msg.thinkingBlocks.map((b) => ({
        id: b.id,
        content: b.content,
        isExpanded: b.isExpanded,
      }));
    }
    if (msg.thinking) {
      return [{ id: 'thinking', content: msg.thinking, isExpanded: false }];
    }
    return undefined;
  })();

  return {
    id: msg.id,
    role: msg.role === 'system' ? 'assistant' : msg.role,
    content: msg.content,
    timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
    thinking,
    toolCalls: msg.toolCalls?.map(adaptToolCall),
    isStreaming: msg.isStreaming,
    images: msg.images?.map((img) => (typeof img === 'string' ? img : img.url ?? '')),
    audioUrl: msg.audioUrl,
  };
}

function adaptMessages(msgs: ChatMessage[]): ChatUiMessage[] {
  return msgs
    .filter((m) => m.role !== 'system')
    .map(adaptMessage);
}

function adaptSessions(sessions: Session[], pinnedKeys: Set<string>): MockSession[] {
  return sessions.map((s) => ({
    id: s.key,
    title: s.title || 'New chat',
    preview: s.lastMessage?.slice(0, 120) ?? '',
    updatedAt: s.updatedAt ? new Date(s.updatedAt).getTime() : Date.now(),
    isPinned: pinnedKeys.has(s.key),
  }));
}

const MODEL_PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#10B981',
  openai: '#22C55E',
  google: '#3B82F6',
  deepseek: '#6366F1',
  mistral: '#F97316',
  meta: '#A855F7',
};

function providerColor(provider?: string): string {
  if (!provider) return '#F59E0B';
  const lower = provider.toLowerCase();
  for (const [key, color] of Object.entries(MODEL_PROVIDER_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return '#F59E0B';
}

function modelsToPickerItems(models: Model[]): DynamicPickerItem[] {
  return models.map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
    dotBg: providerColor(m.provider),
  }));
}

function agentsToPickerItems(agents: Agent[]): DynamicPickerItem[] {
  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    dotBg: '#F59E0B',
    emoji: a.emoji,
  }));
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ChatScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();

  const { messages, isStreaming, sendMessage, abortResponse, loadHistory } = useChat();
  const { sessions, currentSessionKey, pinnedKeys, setCurrentSession, createSession,
    resetSession, deleteSession, pinSession, renameSession } = useSessions();
  const { connectionState } = useConnection();
  const { agents, currentAgent, setCurrentAgent } = useAgents();
  const { models, currentModel, setCurrentModel } = useModels();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showThinking, setShowThinking] = useState(true);
  const [showToolCalls, setShowToolCalls] = useState(true);

  const connectionStatus: 'connected' | 'connecting' | 'disconnected' =
    connectionState.status === 'connected'
      ? 'connected'
      : connectionState.status === 'connecting'
        ? 'connecting'
        : 'disconnected';
  const shouldShowMessageSkeletons =
    connectionState.status === 'connecting' && messages.length === 0;

  const handleSelectSession = useCallback(async (key: string): Promise<void> => {
    setCurrentSession(key);
    await loadHistory(key);
    setSidebarOpen(false);
  }, [setCurrentSession, loadHistory]);

  const handleNewSession = useCallback(async (): Promise<void> => {
    await createSession();
    setSidebarOpen(false);
  }, [createSession]);

  const handleSend = useCallback((text: string): void => {
    const cmd = text.trim();

    if (cmd === '/new') {
      void handleNewSession();
      return;
    }

    if (cmd === '/reset') {
      if (currentSessionKey) {
        void resetSession(currentSessionKey).catch(() => {});
      }
      return;
    }

    if (cmd === '/status') {
      const statusMsg =
        connectionState.status === 'connected'
          ? `Connected (server ${(connectionState as { serverVersion?: string }).serverVersion ?? 'unknown'})`
          : connectionState.status === 'error'
            ? `Error: ${(connectionState as { message?: string }).message ?? connectionState.status}`
            : connectionState.status;
      Alert.alert('Connection Status', statusMsg);
      return;
    }

    if (cmd.startsWith('/model ')) {
      const name = cmd.slice(7).trim();
      if (name) {
        const found = models.find((m) => (m.name ?? m.id).toLowerCase() === name.toLowerCase());
        setCurrentModel(found?.id ?? name);
      }
      return;
    }

    if (cmd.startsWith('/agent ')) {
      const name = cmd.slice(7).trim();
      if (name) {
        const found = agents.find((a) => a.name.toLowerCase() === name.toLowerCase() || a.id === name);
        setCurrentAgent(found?.id ?? name);
      }
      return;
    }

    sendMessage(text);
  }, [
    handleNewSession,
    currentSessionKey,
    resetSession,
    connectionState,
    models,
    agents,
    setCurrentModel,
    setCurrentAgent,
    sendMessage,
  ]);

  const modelItems = modelsToPickerItems(models);
  const agentItems = agentsToPickerItems(agents);
  const modelLabel = currentModel?.name ?? currentModel?.id;
  const agentLabel = currentAgent?.name ?? currentAgent?.id;

  return (
    <KeyboardAvoidingView
      style={[styles.keyboardRoot, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.flex}>
        <ChatHeader
          title={`ClawBoy · v${APP_VERSION}`}
          onMenuPress={() => setSidebarOpen(true)}
          onSettingsPress={() => router.push('/settings')}
        />

        <ConnectionBanner
          status={connectionStatus}
          onPress={() => router.push('/settings')}
        />

        <MessageList
          messages={adaptMessages(messages)}
          showThinking={showThinking}
          showToolCalls={showToolCalls}
          isLoading={shouldShowMessageSkeletons}
        />

        <InputBar
          onSend={handleSend}
          isThinking={isStreaming}
          onStop={abortResponse}
          model={modelLabel}
          agent={agentLabel}
          modelItems={modelItems}
          agentItems={agentItems}
          onModelChange={setCurrentModel}
          onAgentChange={setCurrentAgent}
          connectionStatus={connectionStatus}
          showThinking={showThinking}
          showToolCalls={showToolCalls}
          onToggleThinking={() => setShowThinking((s) => !s)}
          onToggleToolCalls={() => setShowToolCalls((s) => !s)}
        />

        <SessionSidebar
          isOpen={sidebarOpen}
          onOpenChange={setSidebarOpen}
          sessions={adaptSessions(sessions, pinnedKeys)}
          activeSessionId={currentSessionKey}
          onSelectSession={(id) => { void handleSelectSession(id); }}
          onNewSession={() => { void handleNewSession(); }}
          onPinSession={pinSession}
          onDeleteSession={(id) => { void deleteSession(id).catch(() => {}); }}
          onRenameSession={(id, newTitle) => { void renameSession(id, newTitle).catch(() => {}); }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
});
