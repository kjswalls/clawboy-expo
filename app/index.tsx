import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { generateUUID } from '@/lib/openclaw/utils';

import { ChatHeader } from '@/components/chat/ChatHeader';
import { ConnectionBanner } from '@/components/chat/ConnectionBanner';
import { UpdateNudgeBanner } from '@/components/chat/UpdateNudgeBanner';
import { PairingRequiredCard } from '@/components/chat/PairingRequiredCard';
import { MessageList } from '@/components/chat';
import { InputBar, type InputBarHandle } from '@/components/input/InputBar';
import type { DynamicPickerItem } from '@/components/input/InputBarHeader';
import { parseSlashCommand } from '@/components/input/slashCommands';
import { SessionSidebar } from '@/components/sidebar';
import { useTheme } from '@/hooks/useTheme';
import { useChat } from '@/hooks/useChat';
import { useChatDiskHydration } from '@/hooks/useChatDiskHydration';
import { useCommands } from '@/hooks/useCommands';
import { useSessions } from '@/hooks/useSessions';
import { useConnection } from '@/contexts/ConnectionContext';
import { useGatewayUpdateNudge } from '@/hooks/useGatewayUpdateNudge';
import { useAgents } from '@/hooks/useAgents';
import { useModels } from '@/hooks/useModels';
import { APP_VERSION } from '@/lib/appMeta';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { EmptyChatState } from '@/components/chat/EmptyChatState';
import { Colors, BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { groupModelsByProvider } from '@/lib/modelProvider';
import { modelSupportsAudioInput } from '@/lib/voice/modelAudioSupport';
import type { Agent, Session } from '@/lib/openclaw/types';
import type { InputAttachment } from '@/components/input/types';
import type { ChatMessage, ChatToolCall, MockSession, Model } from '@/types';
import type { PickerSection } from '@/components/input/InputBarPickerModal';
import type { ChatUiMessage, ChatUiMessagePart, ChatUiThinkingBlock, ChatUiToolCall, SessionActivity } from '@/types/chat-ui';
import { formatDuration } from '@/lib/formatDuration';

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

function adaptToolCall(tc: ChatToolCall, duration?: string): ChatUiToolCall {
  return {
    id: tc.id,
    type: inferToolType(tc.name),
    name: tc.name,
    input: tc.args ? JSON.stringify(tc.args) : undefined,
    output: tc.result,
    status: tc.status,
    duration,
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

  // Adapt ordered parts when present (live-streamed messages).
  const parts: ChatUiMessagePart[] | undefined = msg.parts?.map(
    (p): ChatUiMessagePart => {
      if (p.kind === 'text') {
        return { kind: 'text', id: p.id, text: p.text };
      }
      if (p.kind === 'thinking') {
        const dur =
          p.completedAt !== undefined ? formatDuration(p.completedAt - p.startedAt) : undefined;
        return {
          kind: 'thinking',
          id: p.id,
          text: p.text,
          duration: dur,
          isActive: p.completedAt === undefined,
        };
      }
      // tool part
      const dur =
        p.completedAt !== undefined ? formatDuration(p.completedAt - p.startedAt) : undefined;
      return {
        kind: 'tool',
        id: p.id,
        toolCall: {
          id: p.id,
          type: inferToolType(p.name),
          name: p.name,
          input: p.args ? JSON.stringify(p.args) : undefined,
          output: p.result,
          status: p.status,
          duration: dur,
        },
        duration: dur,
        isActive: p.completedAt === undefined,
      };
    }
  );

  return {
    id: msg.id,
    role: msg.role === 'system' ? 'assistant' : msg.role,
    content: msg.content,
    timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
    thinking,
    toolCalls: msg.toolCalls?.map((tc) => adaptToolCall(tc)),
    parts,
    isStreaming: msg.isStreaming,
    images: msg.images?.map((img) => (typeof img === 'string' ? img : img.url ?? '')),
    audioUrl: msg.audioUrl,
    videoUrl: msg.videoUrl,
    files: msg.files,
    fileAttachments: msg.attachedFiles,
    kind: msg.kind,
    internalEvent: msg.internalEvent,
    interrupted: msg.interrupted,
    retryFromMessageId: msg.retryFromMessageId,
    guessedMedia: msg.guessedMedia,
  };
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

function modelsToSections(models: Model[]): PickerSection[] {
  const groups = groupModelsByProvider(models);
  return groups.map((group) => ({
    title: group.label,
    items: group.items.map((m) => {
      const displayName = m.name ?? m.id;
      return {
        key: m.id,
        title: displayName,
        dot: group.color,
        providerSlug: group.slug,
        subtitle: displayName !== m.id ? m.id : undefined,
        reasoning: m.reasoning,
        contextWindow: m.contextWindow,
        supportsImages: m.input?.includes('image'),
      };
    }),
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

function ChatErrorFallback(_error: Error, reset: () => void): React.ReactNode {
  return (
    <View style={chatErrorStyles.wrap}>
      <Text style={chatErrorStyles.title}>Chat failed to render</Text>
      <Text style={chatErrorStyles.body}>
        There was a problem displaying the chat screen.
      </Text>
      <View
        style={chatErrorStyles.btn}
        // React does not support Pressable inside an error boundary fallback render-fn
        // without risking recursion — use a plain View + onTouchEnd as a safety measure.
        onTouchEnd={reset}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text style={chatErrorStyles.btnText}>Try again</Text>
      </View>
    </View>
  );
}

const chatErrorStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  title: { fontSize: FontSize.md, fontWeight: '600', color: Colors.dark.foreground, textAlign: 'center' },
  body: { fontSize: FontSize.sm, color: Colors.dark.mutedForeground, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  btn: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
  },
  btnText: { fontSize: FontSize.sm, fontWeight: '600', color: '#fff' },
});

export default function ChatScreenRoute(): React.JSX.Element {
  const [resetKey, setResetKey] = useState(0);
  return (
    <ErrorBoundary fallback={ChatErrorFallback} resetKey={resetKey}>
      <ChatScreen onBoundaryReset={() => setResetKey((k) => k + 1)} />
    </ErrorBoundary>
  );
}

function ChatScreen({ onBoundaryReset: _onBoundaryReset }: { onBoundaryReset?: () => void }): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();

  const {
    messages,
    isStreaming,
    activity,
    sendMessage,
    abortResponse,
    retryMessage,
    loadHistory,
    seedCache,
    clearMessages,
    appendMessage,
    beginActivity,
    endActivity,
  } = useChat();
  const { sessions, currentSessionKey, pinnedKeys, hasLoadedOnce: sessionsHaveLoadedOnce,
    setCurrentSession, createSession, resetSession, deleteSession, pinSession, renameSession,
    clearRecentSessions } = useSessions();

  const { connectionState } = useConnection();
  const { nudgeVisible, dismissNudge } = useGatewayUpdateNudge();
  const { agents, currentAgent, setCurrentAgent, seedAgentFromCache } = useAgents();
  const { models, currentModel, setCurrentModel, seedModelFromCache } = useModels();

  const { attempted: diskAttempted, seeded: diskSeeded } = useChatDiskHydration(
    seedCache,
    setCurrentSession,
    { seedAgentFromCache, seedModelFromCache },
  );

  const inputBarRef = useRef<InputBarHandle>(null);
  const { commands } = useCommands(currentAgent?.id);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showThinking, setShowThinking] = useState(true);
  const [showToolCalls, setShowToolCalls] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const latestSessionRequestRef = useRef<string | null>(null);

  // Fire haptics on connection state transitions.
  const prevConnectionStatusRef = useRef(connectionState.status);
  useEffect(() => {
    const prev = prevConnectionStatusRef.current;
    const curr = connectionState.status;
    prevConnectionStatusRef.current = curr;
    if (Platform.OS === 'web') return;
    if (prev !== 'connected' && curr === 'connected') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (prev !== 'error' && curr === 'error') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [connectionState.status]);

  // WeakMap keyed on ChatMessage identity so unchanged messages return the same
  // ChatUiMessage ref across renders, letting React.memo on MessageBubble skip.
  const adaptCacheRef = useRef<WeakMap<ChatMessage, ChatUiMessage>>(new WeakMap());
  const uiMessages = useMemo((): ChatUiMessage[] => {
    const cache = adaptCacheRef.current;
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        const cached = cache.get(m);
        if (cached) return cached;
        const adapted = adaptMessage(m);
        cache.set(m, adapted);
        return adapted;
      });
  }, [messages]);

  const connectionStatus: 'connected' | 'connecting' | 'disconnected' =
    connectionState.status === 'connected'
      ? 'connected'
      : connectionState.status === 'connecting'
        ? 'connecting'
        : 'disconnected';

  // Send is blocked when the connection is definitively broken or awaiting pairing.
  // We keep it enabled while connecting so queued messages can flow once reconnected.
  const sendDisabled =
    connectionState.status === 'error' ||
    connectionState.status === 'pairing_required' ||
    connectionState.status === 'disconnected';

  // True once we've confirmed the session list from the server — prevents the
  // welcome screen from flashing during the brief connected-but-pre-RPC window.
  const sessionsConfirmed = connectionState.status === 'connected' && sessionsHaveLoadedOnce;

  // Show the welcome/empty state only when we've genuinely confirmed there is
  // nothing to display (past disk race, cache miss, and sessions loaded).
  const showWelcome =
    messages.length === 0 &&
    !isLoadingHistory &&
    diskAttempted &&
    !diskSeeded &&
    (
      sessionsConfirmed && sessions.length === 0 ||
      // New locally-created session on an otherwise empty server.
      (sessionsConfirmed && !!currentSessionKey && !sessions.find((s) => s.key === currentSessionKey))
    );

  // Show skeletons only after the disk race settles, so we never flash skeleton
  // before we even know whether there's cached content.
  const showSkeleton =
    messages.length === 0 &&
    !showWelcome &&
    diskAttempted &&
    (isLoadingHistory ||
      connectionState.status === 'connecting' ||
      (connectionState.status === 'connected' && !sessionsConfirmed));

  // Debounce the skeleton by 150ms — sub-150ms loads show a blank background
  // instead of a brief skeleton flash.
  const [debouncedSkeleton, setDebouncedSkeleton] = useState(false);
  useEffect(() => {
    if (!showSkeleton) {
      setDebouncedSkeleton(false);
      return;
    }
    const t = setTimeout(() => { setDebouncedSkeleton(true); }, 150);
    return () => { clearTimeout(t); };
  }, [showSkeleton]);

  // Sync agent + model pills from a session's metadata when switching sessions.
  const syncPillsFromSession = useCallback((key: string): void => {
    const session = sessions.find((s) => s.key === key);
    if (!session) return;
    if (session.agentId) {
      setCurrentAgent(session.agentId);
    }
    if (session.model) {
      // Read-only sync — no server patch needed since this IS the server's value.
      setCurrentModel(session.model);
    }
  }, [sessions, setCurrentAgent, setCurrentModel]);

  const handleSelectSession = useCallback(async (key: string): Promise<void> => {
    latestSessionRequestRef.current = key;
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentSession(key);
    syncPillsFromSession(key);
    setIsLoadingHistory(true);
    await loadHistory(key);
    // Only clear spinner if no newer request arrived while this was in-flight.
    if (latestSessionRequestRef.current === key) {
      setIsLoadingHistory(false);
    }
    setSidebarOpen(false);
  }, [setCurrentSession, syncPillsFromSession, loadHistory]);

  // Switch to an agent: find its most recent session and load it, or let the
  // next sendMessage create a new session with the correct agentId in the key.
  const handleSelectAgent = useCallback(async (agentId: string): Promise<void> => {
    setCurrentAgent(agentId);
    const agentSession = sessions.find((s) => {
      const key = s.key ?? '';
      return (
        s.agentId === agentId &&
        !s.spawned &&
        !s.cron &&
        !key.includes(':subagent:') &&
        !key.includes(':cron:')
      );
    });
    if (agentSession) {
      setCurrentSession(agentSession.key);
      await loadHistory(agentSession.key);
    }
    // else: next sendMessage will createSession(agentId) inline.
  }, [setCurrentAgent, sessions, setCurrentSession, loadHistory]);

  const handleNewSession = useCallback(async (): Promise<void> => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await createSession(currentAgent?.id);
    setSidebarOpen(false);
  }, [createSession, currentAgent?.id]);

  const handleRefreshChat = useCallback(async (): Promise<void> => {
    if (!currentSessionKey || connectionState.status !== 'connected') return;
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRefreshing(true);
    try {
      await loadHistory(currentSessionKey);
    } finally {
      setIsRefreshing(false);
    }
  }, [currentSessionKey, connectionState.status, loadHistory]);

  // Patch the active session's model on the server when the user picks one.
  const handleSelectModel = useCallback((modelId: string): void => {
    setCurrentModel(modelId, currentSessionKey);
  }, [setCurrentModel, currentSessionKey]);

  const handleSend = useCallback((text: string, sendAttachments?: InputAttachment[], onAbort?: () => void): void => {
    const parsed = parseSlashCommand(text, commands);

    if (!parsed) {
      sendMessage(text, sendAttachments, onAbort);
      return;
    }

    const { command, args } = parsed;

    // Only intercept commands marked executeLocal — everything else goes to the gateway.
    if (!command.executeLocal) {
      sendMessage(text, sendAttachments, onAbort);
      return;
    }

    switch (command.id) {
      case 'new': {
        void handleNewSession();
        return;
      }
      case 'reset': {
        if (!currentSessionKey) return;
        const sk = currentSessionKey;
        beginActivity(sk, 'resetting', 'Resetting session...');
        // Clear local display immediately so old turns don't linger during the RPC.
        clearMessages(sk);
        void (async () => {
          try {
            await resetSession(sk);
            // Marker only appears after the RPC succeeds so it doesn't show
            // while the reset is still in-flight.
            appendMessage(sk, {
              id: `reset-${generateUUID()}`,
              role: 'assistant',
              kind: 'info',
              content: 'Session reset.',
              timestamp: new Date().toISOString(),
            });
            // No clearMessages / loadHistory here — the gateway streams a startup
            // greeting via chat events after sessions.reset resolves, and the
            // existing chat-event handlers in useChat will append it to the
            // (now-empty) session naturally.
          } catch (err) {
            Alert.alert(
              'Reset failed',
              err instanceof Error ? err.message : 'Could not reset the session.',
            );
          } finally {
            endActivity(sk);
          }
        })();
        return;
      }
      case 'clear': {
        if (currentSessionKey) {
          clearMessages(currentSessionKey);
        }
        return;
      }
      case 'stop': {
        abortResponse();
        return;
      }
      case 'status': {
        const statusMsg =
          connectionState.status === 'connected'
            ? `Connected (server ${(connectionState as { serverVersion?: string }).serverVersion ?? 'unknown'})`
            : connectionState.status === 'error'
              ? `Error: ${(connectionState as { message?: string }).message ?? connectionState.status}`
              : connectionState.status;
        Alert.alert('Connection Status', statusMsg);
        return;
      }
      case 'usage': {
        inputBarRef.current?.openContextSheet();
        return;
      }
      case 'help':
      case 'commands': {
        const essentialNames = commands
          .filter((c) => c.tier === 'essential')
          .map((c) => `/${c.name}`)
          .join(', ');
        Alert.alert(
          'Commands',
          `Essential: ${essentialNames}\n\nType / in the input to browse all commands.`,
        );
        return;
      }
      case 'model': {
        if (args && currentSessionKey) {
          const found = models.find(
            (m) => (m.name ?? m.id).toLowerCase() === args.toLowerCase(),
          );
          setCurrentModel(found?.id ?? args, currentSessionKey);
        }
        return;
      }
      case 'agent': {
        if (args) {
          const found = agents.find(
            (a) => a.name.toLowerCase() === args.toLowerCase() || a.id === args,
          );
          void handleSelectAgent(found?.id ?? args);
        }
        return;
      }
      case 'agents': {
        const agentList = agents.map((a) => `${a.emoji ?? '•'} ${a.name}`).join('\n');
        Alert.alert('Agents', agentList || 'No agents available.');
        return;
      }
      case 'redirect': {
        // Abort any active response and re-send with the provided message.
        abortResponse();
        if (args) {
          sendMessage(args);
        }
        return;
      }
      default: {
        // Unhandled executeLocal — shouldn't happen, but send to gateway as fallback.
        sendMessage(text);
        return;
      }
    }
  }, [
    commands,
    handleNewSession,
    handleSelectAgent,
    currentSessionKey,
    resetSession,
    clearMessages,
    abortResponse,
    connectionState,
    models,
    agents,
    setCurrentModel,
    sendMessage,
    loadHistory,
    appendMessage,
    beginActivity,
    endActivity,
  ]);

  const modelSections = modelsToSections(models);
  const agentItems = agentsToPickerItems(agents);
  // Prefer the server's session.model as the source of truth for the pill label;
  // fall back to the locally-selected model when no session model is set.
  const currentSession = sessions.find((s) => s.key === currentSessionKey);
  const modelLabel =
    currentSession?.model ??
    currentModel?.name ??
    currentModel?.id;
  const agentLabel = currentAgent?.name ?? currentAgent?.id;

  // Context usage — session.totalTokens is the actual tokens consumed (updated
  // after each turn via sessions.changed → refreshSessions()). session.contextTokens
  // is the model's context-window capacity for this session; fall back to the
  // model catalog's contextWindow if the session hasn't reported it yet.
  const effectiveModelId = currentSession?.model ?? currentModel?.id;
  const activeModel = models.find((m) => m.id === effectiveModelId);
  const contextUsed = currentSession?.totalTokens;
  const contextTotal = currentSession?.contextTokens ?? activeModel?.contextWindow;

  // Capability checks (e.g. vision support warning) prefer the locally-
  // selected model so picker changes are reflected in the UI immediately,
  // without waiting for the gateway's `sessions.changed` echo to update
  // `currentSession.model`. `currentModel` is already kept in sync with the
  // active session via `syncPillsFromSession` on session switch, so this
  // also tracks server-driven model changes once they propagate.
  // Treat missing or empty `input` as "unknown → allow" so we don't warn on
  // gateway builds that don't populate the field.
  const capabilityInputs = currentModel?.input ?? activeModel?.input;
  const modelSupportsImageInput =
    !Array.isArray(capabilityInputs) ||
    capabilityInputs.length === 0 ||
    capabilityInputs.includes('image');

  // For audio, fail closed: treat unknown capability as text-only (false) so
  // voice notes show "Will transcribe" by default. Only flip to true when we
  // have definitive evidence the model can hear audio.
  const effectiveModel = currentModel ?? activeModel ?? null;
  const modelCanHearAudio = modelSupportsAudioInput(effectiveModel);

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
          onNewSessionPress={() => { void handleNewSession(); }}
        />

        <ConnectionBanner
          connectionState={connectionState}
          onPress={() => router.push('/settings')}
        />
        <UpdateNudgeBanner visible={nudgeVisible} onDismiss={dismissNudge} />

        {connectionState.status === 'pairing_required' && uiMessages.length === 0 ? (
          <PairingRequiredCard
            deviceIdPrefix={
              'deviceId' in connectionState && typeof connectionState.deviceId === 'string'
                ? connectionState.deviceId.slice(0, 8)
                : undefined
            }
            onOpenSettings={() => router.push('/settings')}
          />
        ) : null}

        <MessageList
          messages={uiMessages}
          showThinking={showThinking}
          showToolCalls={showToolCalls}
          isLoading={debouncedSkeleton}
          onRetry={retryMessage}
          activity={activity as SessionActivity | null}
          sessionKey={currentSessionKey}
          emptyStateSlot={
            showWelcome ? (
              <EmptyChatState
                onSuggestionPress={(text) => inputBarRef.current?.setDraftText(text)}
              />
            ) : undefined
          }
        />

        <InputBar
          ref={inputBarRef}
          onSend={handleSend}
          sessionKey={currentSessionKey}
          disabled={sendDisabled}
          isThinking={isStreaming || !!activity}
          showRainbow={activity?.reason === 'streaming' || activity?.reason === 'awaiting'}
          onStop={abortResponse}
          model={modelLabel}
          agent={agentLabel}
          modelSections={modelSections}
          agentItems={agentItems}
          onModelChange={handleSelectModel}
          onAgentChange={(agentId) => { void handleSelectAgent(agentId); }}
          connectionStatus={connectionStatus}
          contextUsed={contextUsed}
          contextTotal={contextTotal}
          sessionInputTokens={currentSession?.inputTokens}
          sessionOutputTokens={currentSession?.outputTokens}
          sessionTotalTokens={currentSession?.totalTokens}
          showThinking={showThinking}
          showToolCalls={showToolCalls}
          onToggleThinking={() => setShowThinking((s) => !s)}
          onToggleToolCalls={() => setShowToolCalls((s) => !s)}
          onRefreshPress={() => { void handleRefreshChat(); }}
          isRefreshing={isRefreshing}
          commands={commands}
          modelSupportsImageInput={modelSupportsImageInput}
          modelSupportsAudioInput={modelCanHearAudio}
        />

        <SessionSidebar
          isOpen={sidebarOpen}
          onOpenChange={setSidebarOpen}
          sessions={adaptSessions(sessions, pinnedKeys)}
          activeSessionId={currentSessionKey}
          isSessionsLoading={sessions.length === 0 && connectionState.status === 'connecting'}
          isConnected={connectionState.status === 'connected'}
          onSelectSession={(id) => { void handleSelectSession(id); }}
          onNewSession={() => { void handleNewSession(); }}
          onPinSession={pinSession}
          onDeleteSession={(id) => { void deleteSession(id).catch(() => {}); }}
          onRenameSession={(id, newTitle) => { void renameSession(id, newTitle).catch(() => {}); }}
          onClearRecent={async () => {
            const result = await clearRecentSessions();
            if (result.failed > 0) {
              Alert.alert(
                'Some sessions could not be deleted',
                `Deleted ${result.deleted}, failed to delete ${result.failed}. Check your connection and try again.`,
              );
            }
            return result;
          }}
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
