import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnnotationProvider, useAnnotations } from '@/contexts/AnnotationContext';
import { AnnotationDraftProvider } from '@/contexts/AnnotationDraftContext';
import { AnnotationPreviewModal } from '@/components/chat/AnnotationPreviewModal';
import { composeAnnotatedReply, sortAnnotationsByDocumentOrder } from '@/lib/annotations';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { generateUUID } from '@/lib/openclaw/utils';
import { parseGatewayWsUrl } from '@/utils/gatewayUrl';
import { translateClawError } from '@/utils/translateError';

import { ChatHeader } from '@/components/chat/ChatHeader';
import { CollapseWhen } from '@/components/common/CollapseWhen';
import { useIsAnnotationFocusActive } from '@/contexts/AnnotationDraftContext';
import { ConnectionBanner } from '@/components/chat/ConnectionBanner';
import { DemoModeBanner } from '@/components/chat/DemoModeBanner';
import { UpdateNudgeBanner } from '@/components/chat/UpdateNudgeBanner';
import { IdentityRejectedCard } from '@/components/chat/IdentityRejectedCard';
import { PinMismatchScreen } from '@/components/settings/PinMismatchScreen';
import { MessageList } from '@/components/chat';
import type { MessageListHandle } from '@/components/chat/MessageList';
import { InputBar, type InputBarHandle } from '@/components/input/InputBar';
import { parseSlashCommand } from '@/components/input/slashCommands';
import { SessionSidebar } from '@/components/sidebar';
import { useTheme } from '@/hooks/useTheme';
import { useChat } from '@/hooks/useChat';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useChatDiskHydration } from '@/hooks/useChatDiskHydration';
import { useCommands } from '@/hooks/useCommands';
import { useSessions } from '@/hooks/useSessions';
import { useConnection } from '@/contexts/ConnectionContext';
import { useBadgeState } from '@/badges/hooks';
import { useGatewayUpdateNudge } from '@/hooks/useGatewayUpdateNudge';
import { useAgents } from '@/hooks/useAgents';
import { useModels } from '@/hooks/useModels';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { EmptyChatState } from '@/components/chat/EmptyChatState';
import { Spacing } from '@/constants/theme';
import { modelSupportsAudioInput } from '@/lib/voice/modelAudioSupport';
import { useTtsPreferences } from '@/hooks/useTtsPreferences';
import { useCommandConfirmations } from '@/hooks/useCommandConfirmations';
import { useServerTts } from '@/hooks/useServerTts';
import { effectivePreferDeviceTts } from '@/hooks/effectivePreferDeviceTts';
import { useAutoSpeakReply, useStopSpeechOnBackground } from '@/hooks/useAutoSpeakReply';
import type { InputAttachment } from '@/components/input/types';
import type { ChatUiMessage, ChatUiMessagePart, ChatUiThinkingBlock, ChatUiToolCall, SessionActivity } from '@/types/chat-ui';
import type { ChatMessage, Model } from '@/types';
import { isDemoProfile } from '@/types';
import { deriveMultiSurveyState } from '@/lib/openclaw/interactive';
import {
  adaptMessage,
  adaptSessions,
  modelsToSections,
  agentsToPickerItems,
} from '@/lib/chatMessageAdapters';
import { ChatErrorFallback } from '@/components/chat/ChatErrorBoundary';

// ---------------------------------------------------------------------------
// Focus-mode collapsing header — reads AnnotationDraftContext, so must render
// inside <AnnotationDraftProvider>.
// ---------------------------------------------------------------------------

function CollapsingChatHeader(props: React.ComponentProps<typeof ChatHeader>): React.JSX.Element {
  const focusModeActive = useIsAnnotationFocusActive();
  return (
    <CollapseWhen collapsed={focusModeActive}>
      <ChatHeader {...props} />
    </CollapseWhen>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ChatScreenRoute(): React.JSX.Element {
  const [resetKey, setResetKey] = useState(0);
  return (
    <ErrorBoundary fallback={ChatErrorFallback} resetKey={resetKey}>
      <ChatScreenWithAnnotations onBoundaryReset={() => setResetKey((k) => k + 1)} />
    </ErrorBoundary>
  );
}

function ChatScreenWithAnnotations({ onBoundaryReset }: { onBoundaryReset?: () => void }): React.JSX.Element {
  const { currentSessionKey } = useSessions();
  return (
    <AnnotationProvider sessionKey={currentSessionKey}>
      <ChatScreen onBoundaryReset={onBoundaryReset} />
    </AnnotationProvider>
  );
}

function ChatScreen({ onBoundaryReset: _onBoundaryReset }: { onBoundaryReset?: () => void }): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const {
    messages,
    activity,
    activityBySession,
    reconcileLoading,
    sendMessage,
    abortResponse,
    retryMessage,
    loadHistory,
    seedCache,
    clearMessages,
    appendMessage,
    removeMessage,
    beginActivity,
    endActivity,
    resolveExecApproval,
  } = useChat();
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const { sessions, currentSessionKey, pinnedKeys, hasLoadedOnce: sessionsHaveLoadedOnce,
    setCurrentSession, createSession, resetSession, deleteSession, pinSession, renameSession,
    clearRecentSessions, deleteSessions, requestRefreshSessions } = useSessions();

  const { connectionState, gatewayUrl, reconnect, disconnect } = useConnection();
  const { activeProfile, updateProfileSecurity, removeProfile } = useServerConfig();
  const { host: gatewayHost, isInsecure: isInsecureScheme } = parseGatewayWsUrl(gatewayUrl);
  const { nudgeVisible, dismissNudge } = useGatewayUpdateNudge();
  const { recordSessionEnd } = useBadgeState();
  const { confirmDestructiveCommands } = useCommandConfirmations();

  const isDemo = isDemoProfile(activeProfile);
  const { agents, currentAgent, setCurrentAgent, seedAgentFromCache } = useAgents();
  const { models, currentModel, setCurrentModel, seedModelFromCache } = useModels();

  const { attempted: diskAttempted, seeded: diskSeeded, seededSessionKey: diskSeededSessionKey } = useChatDiskHydration(
    seedCache,
    setCurrentSession,
    { seedAgentFromCache, seedModelFromCache },
  );

  const inputBarRef = useRef<InputBarHandle>(null);
  const { commands } = useCommands(currentAgent?.id);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Refresh the session list (and thus preview text) whenever the sidebar opens.
  // The debounce + min-interval guard in requestRefreshSessions prevents extra calls.
  useEffect(() => {
    if (sidebarOpen && connectionState.status === 'connected') {
      requestRefreshSessions();
    }
  }, [sidebarOpen, connectionState.status, requestRefreshSessions]);

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

  // Secondary cache for the survey-state patch. Keyed on the adapted ChatUiMessage
  // (which is stable between renders for unchanged messages), storing the last
  // nextUserContent string and the resulting patched object. When neither key nor
  // nextUserContent changes the same patched reference is returned, so React.memo
  // on MessageBubble short-circuits even for surveyed assistant turns.
  type SurveyPatchEntry = { nextUserContent: string | null; patched: ChatUiMessage };
  const surveyPatchCacheRef = useRef<WeakMap<ChatUiMessage, SurveyPatchEntry>>(new WeakMap());

  const uiMessages = useMemo((): ChatUiMessage[] => {
    const cache = adaptCacheRef.current;
    const surveyPatchCache = surveyPatchCacheRef.current;
    const visible = messages.filter((m) => m.role !== 'system');

    // First pass: adapt each message (WeakMap-cached so unchanged refs are stable).
    const adapted = visible.map((m) => {
      const cached = cache.get(m);
      if (cached) return cached;
      const result = adaptMessage(m);
      cache.set(m, result);
      return result;
    });

    // Second pass: compute surveyStates for assistant turns that have an interactive
    // payload. surveyStates depends on the *next* user message (a different object),
    // so it cannot be part of the first WeakMap. A separate surveyPatchCache keyed
    // on the adapted message stores the (nextUserContent, patched) pair — when
    // neither changes between renders we return the same patched ref, keeping
    // React.memo on MessageBubble effective.
    //
    // Build next-user-content in a single right-to-left pass (O(n)) instead of
    // calling slice().find() for each surveyed message (O(n·k)).
    // NOTE: We need the *raw* next user content (including the clawboy:answers
    // directive) for accurate per-question state derivation, but the adapted
    // messages have that directive stripped from `.content` for display. We
    // therefore look up raw message content from the `messages` array instead.
    const rawMessages = visible; // same order as adapted
    const nextRawUserContentAt: (string | null)[] = new Array(rawMessages.length).fill(null);
    let lastRawUserContent: string | null = null;
    for (let i = rawMessages.length - 1; i >= 0; i--) {
      const m = rawMessages[i];
      if (m?.role === 'user') lastRawUserContent = m.content ?? null;
      nextRawUserContentAt[i] = lastRawUserContent;
    }

    for (let i = 0; i < adapted.length; i++) {
      const msg = adapted[i] as ChatUiMessage | undefined;
      if (!msg?.interactive) continue;
      const nextUserContent = nextRawUserContentAt[i + 1] ?? null;
      const cached = surveyPatchCache.get(msg);
      if (cached && cached.nextUserContent === nextUserContent) {
        adapted[i] = cached.patched;
      } else {
        const patched: ChatUiMessage = {
          ...msg,
          surveyStates: deriveMultiSurveyState(msg.interactive, nextUserContent),
        };
        surveyPatchCache.set(msg, { nextUserContent, patched });
        adapted[i] = patched;
      }
    }

    return adapted;
  }, [messages]);

  const connectionStatus: 'connected' | 'connecting' | 'disconnected' =
    connectionState.status === 'connected'
      ? 'connected'
      : connectionState.status === 'connecting'
        ? 'connecting'
        : 'disconnected';

  // Tracks sessions whose /reset RPC is in flight. The gateway emits metadata
  // "labels" chunks during the reset RPC that fire the normal stream pipeline
  // (setIsStreaming(true), activity -> 'awaiting'/'streaming'). That makes the
  // input bar briefly look like the agent is responding, even though no real
  // message ever renders (orphan cleanup drops the placeholder). This flag lets
  // the bar stay calm for the duration of the reset.
  const [resettingKeys, setResettingKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const currentSessionIsResetting =
    currentSessionKey !== null && resettingKeys.has(currentSessionKey);

  // Show the stop button only for activities that chat.abort can actually cancel.
  // agentBusy is sourced from presence (another device / background work) — exclude it.
  const canStop =
    (activity?.reason === 'streaming' ||
      activity?.reason === 'awaiting') &&
    !currentSessionIsResetting;

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
  // diskSeeded only suppresses the welcome screen for the specific session that
  // was hydrated from disk. If the user switches to or creates a different session,
  // that session's emptiness is genuine and the welcome screen should appear.
  const diskSeedCoversCurrentSession = diskSeeded && currentSessionKey === diskSeededSessionKey;

  const showWelcome =
    messages.length === 0 &&
    !isLoadingHistory &&
    diskAttempted &&
    !diskSeedCoversCurrentSession &&
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

  // ── TTS / Read-aloud ─────────────────────────────────────────────────────────
  const ttsPrefs = useTtsPreferences();
  const serverTts = useServerTts();
  const effectivePreferDevice = effectivePreferDeviceTts({
    preferDeviceTts: ttsPrefs.preferDeviceTts,
    autoSpeakReplies: ttsPrefs.autoSpeakReplies,
    isConnected: connectionState.status === 'connected',
    loading: serverTts.loading,
    providerCount: serverTts.providers.length,
  });
  const ttsForAutoSpeak = { autoSpeakReplies: ttsPrefs.autoSpeakReplies, preferDeviceTts: effectivePreferDevice };
  const { speakMessage, stopSpeaking, isSpeaking } = useAutoSpeakReply(messages, currentSessionKey, ttsForAutoSpeak);
  useStopSpeechOnBackground(stopSpeaking);

  // Called when the user taps a choice button or submits free-form text in a
  // survey card. Sends the selected text as a normal user message.
  const handleReplyToPrompt = useCallback(
    (value: string): void => {
      const trimmed = value.trim();
      if (!trimmed) return;
      sendMessage(trimmed);
    },
    [sendMessage]
  );

  // ── Annotation state ──────────────────────────────────────────────────────
  const { annotations, clearAnnotations, updateAnnotation, removeAnnotation, targetAnnotationId, setTargetAnnotationId } = useAnnotations();
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const annotationCountByMessage = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of annotations) m.set(a.messageId, (m.get(a.messageId) ?? 0) + 1);
    return m;
  }, [annotations]);
  const [annotateMessageId, setAnnotateMessageId] = useState<string | null>(null);
  const [composerText, setComposerText] = useState('');
  /** Stores the InputBar prelude text while an annotation target chip is active. */
  const preludeTextRef = useRef('');
  const prevTargetAnnotationIdRef = useRef<string | null>(null);
  /** Captures annotation comment text before InputBar clears its field on save. */
  const pendingAnnotationSaveRef = useRef<string | null>(null);
  const preAnnotateTogglesRef = useRef<{ showThinking: boolean; showToolCalls: boolean } | null>(null);
  const showThinkingRef = useRef(showThinking);
  const showToolCallsRef = useRef(showToolCalls);
  showThinkingRef.current = showThinking;
  showToolCallsRef.current = showToolCalls;

  useEffect(() => {
    if (annotateMessageId !== null) {
      if (preAnnotateTogglesRef.current === null) {
        preAnnotateTogglesRef.current = {
          showThinking: showThinkingRef.current,
          showToolCalls: showToolCallsRef.current,
        };
        setShowThinking(false);
        setShowToolCalls(false);
      }
    } else if (preAnnotateTogglesRef.current !== null) {
      const saved = preAnnotateTogglesRef.current;
      preAnnotateTogglesRef.current = null;
      setShowThinking(saved.showThinking);
      setShowToolCalls(saved.showToolCalls);
    }
  }, [annotateMessageId]);

  // Scroll so the message's annotation chrome (AddComment / SelectRange buttons
  // + inline rows) sits above the InputBar pill stack when annotate mode opens.
  const prevAnnotateMessageIdRef = useRef<string | null>(annotateMessageId);
  useEffect(() => {
    const prev = prevAnnotateMessageIdRef.current;
    prevAnnotateMessageIdRef.current = annotateMessageId;
    if (prev === annotateMessageId) return;
    if (annotateMessageId !== null) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          messageListRef.current?.revealMessageBottom(annotateMessageId);
        });
      });
    }
  }, [annotateMessageId]);

  // Track the last annotation targeted by the pill so repeated taps cycle
  // to the next one. Stored by id (not index) so deletions don't desync.
  const [cycleAnnotationId, setCycleAnnotationId] = useState<string | null>(null);
  const [annotationPreviewVisible, setAnnotationPreviewVisible] = useState(false);
  const [highlightedAnnotationId, setHighlightedAnnotationId] = useState<string | null>(null);
  const highlightResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageListRef = useRef<MessageListHandle>(null);

  // When the composer gains focus, track it so the keyboardDidShow handler
  // can scroll to bottom (only if the user was already near the bottom).
  const scrollOnKeyboardShowRef = useRef(false);
  const handleComposerFocus = useCallback((): void => {
    scrollOnKeyboardShowRef.current = true;
  }, []);
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      if (!scrollOnKeyboardShowRef.current) return;
      scrollOnKeyboardShowRef.current = false;
      messageListRef.current?.scrollToBottomIfNearBottom(true);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      scrollOnKeyboardShowRef.current = false;
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Reset annotate UI when switching sessions (annotations themselves are
  // swapped by AnnotationProvider / useDraft, but the local display state
  // stays stale without this).
  const prevAnnotateSessionKeyRef = useRef(currentSessionKey);
  if (prevAnnotateSessionKeyRef.current !== currentSessionKey) {
    prevAnnotateSessionKeyRef.current = currentSessionKey;
    // Synchronous state reset inside render — safe because it's guarded by the
    // ref check and only runs on the frame the session key changes.
    setAnnotateMessageId(null);
    setCycleAnnotationId(null);
    setHighlightedAnnotationId(null);
    preludeTextRef.current = '';
    prevTargetAnnotationIdRef.current = null;
  }

  // Swap InputBar text when target annotation changes, persisting the outgoing draft.
  useEffect(() => {
    const prev = prevTargetAnnotationIdRef.current;
    prevTargetAnnotationIdRef.current = targetAnnotationId;
    if (prev === targetAnnotationId) return;

    const currentDraft = pendingAnnotationSaveRef.current ?? (inputBarRef.current?.getDraftText() ?? '');
    pendingAnnotationSaveRef.current = null;

    if (prev !== null) {
      if (currentDraft) {
        updateAnnotation(prev, { comment: currentDraft });
      } else {
        removeAnnotation(prev);
      }
    }

    if (targetAnnotationId !== null) {
      if (prev === null) {
        preludeTextRef.current = currentDraft;
      }
      const annotation = annotationsRef.current.find((a) => a.id === targetAnnotationId);
      const commentText = annotation?.comment ?? '';
      inputBarRef.current?.setDraftText(commentText);
      setComposerText(commentText);
      inputBarRef.current?.focus();
    } else {
      inputBarRef.current?.setDraftText(preludeTextRef.current);
      setComposerText(preludeTextRef.current);
      preludeTextRef.current = '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // annotations intentionally omitted — lookups use annotationsRef.current so
  // the effect is only driven by targetAnnotationId transitions, not by comment
  // edits (which would re-seed and clobber the InputBar's in-flight draft text).
  }, [targetAnnotationId]);

  // Clear cycleAnnotationId if the annotation it pointed to was deleted.
  useEffect(() => {
    if (cycleAnnotationId && !annotations.find((a) => a.id === cycleAnnotationId)) {
      setCycleAnnotationId(null);
    }
  }, [annotations, cycleAnnotationId]);

  // Scroll to reveal a newly created annotation card above the keyboard.
  const prevAnnotationsLengthRef = useRef(annotations.length);
  useEffect(() => {
    if (annotations.length > prevAnnotationsLengthRef.current) {
      const newest = annotations[annotations.length - 1];
      if (newest) {
        requestAnimationFrame(() => {
          messageListRef.current?.revealSectionForAnnotation(newest.id, newest.messageId);
        });
      }
    }
    prevAnnotationsLengthRef.current = annotations.length;
  }, [annotations]);

  const handleAnnotate = useCallback((msg: ChatUiMessage): void => {
    setAnnotateMessageId((prev) => (prev === msg.id ? null : msg.id));
  }, []);

  const cycleAnnotations = useCallback((dir: 1 | -1): void => {
    if (annotations.length === 0) return;

    // Build a message-position map so annotations on older messages always
    // sort before those on newer messages, regardless of anchor position.
    const msgOrder = new Map(uiMessages.map((m, i) => [m.id, i]));
    const ordered = sortAnnotationsByDocumentOrder(annotations, msgOrder);
    if (ordered.length === 0) return;

    // Find where we currently are in the sorted list.
    const currentIdx = cycleAnnotationId
      ? ordered.findIndex((a) => a.id === cycleAnnotationId)
      : -1;

    // Advance or retreat (wraps). currentIdx === -1 → go to 0 (next) or last (prev).
    const nextIdx = currentIdx < 0
      ? (dir === 1 ? 0 : ordered.length - 1)
      : (currentIdx + dir + ordered.length) % ordered.length;
    const target = ordered[nextIdx];
    if (!target) return;

    setCycleAnnotationId(target.id);
    setTargetAnnotationId(target.id);
    setAnnotateMessageId(target.messageId);
    messageListRef.current?.scrollToAnnotationId(target.id, target.messageId);

    // Flash the targeted annotation row, then auto-clear so a repeat tap
    // on the same row re-triggers the animation.
    if (highlightResetRef.current) clearTimeout(highlightResetRef.current);
    setHighlightedAnnotationId(target.id);
    highlightResetRef.current = setTimeout(() => {
      setHighlightedAnnotationId(null);
    }, 700);
  }, [annotations, cycleAnnotationId, setTargetAnnotationId, uiMessages]);

  const handleAnnotationCycleNext = useCallback(() => cycleAnnotations(1), [cycleAnnotations]);
  const handleAnnotationCyclePrev = useCallback(() => cycleAnnotations(-1), [cycleAnnotations]);

  const handleAnnotationPreview = useCallback((): void => {
    setAnnotationPreviewVisible(true);
  }, []);

  const handleAnnotationClear = useCallback((): void => {
    Alert.alert(
      t('chat.annotate.clearConfirmTitle'),
      t('chat.annotate.clearConfirmMessage', { count: annotations.length }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('chat.annotate.clearConfirmAction'),
          style: 'destructive',
          onPress: () => {
            clearAnnotations();
            setAnnotateMessageId(null);
            setCycleAnnotationId(null);
            setHighlightedAnnotationId(null);
          },
        },
      ],
    );
  }, [annotations.length, clearAnnotations, t]);

  // Adapt ChatMessage → ChatUiMessage for the onSpeak callback
  const handleSpeak = useCallback(
    (uiMsg: import('@/types/chat-ui').ChatUiMessage): void => {
      // Find the underlying ChatMessage by id and delegate to speakMessage
      const chatMsg = messages.find((m) => m.id === uiMsg.id);
      if (chatMsg) speakMessage(chatMsg);
    },
    [messages, speakMessage],
  );

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
    try {
      await loadHistory(key);
    } catch (err) {
      if (__DEV__) console.warn('[chat] loadHistory failed on session select', err);
    } finally {
      // Only clear spinner if no newer request arrived while this was in-flight.
      if (latestSessionRequestRef.current === key) {
        setIsLoadingHistory(false);
      }
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

  const appendModelChangeMarker = useCallback(
    (prev: Model | null, next: Model | null, sessionKey: string | null): void => {
      if (!sessionKey || !next || !prev) return;
      if (prev.id === next.id) return;
      appendMessage(sessionKey, {
        id: `model-change-${generateUUID()}`,
        role: 'assistant',
        kind: 'info',
        content: `Model changed from ${prev.name ?? prev.id} to ${next.name ?? next.id}.`,
        timestamp: new Date().toISOString(),
      });
    },
    [appendMessage],
  );

  // Patch the active session's model on the server when the user picks one.
  const handleSelectModel = useCallback((modelId: string): void => {
    const prev = currentModel;
    const next = models.find((m) => m.id === modelId) ?? null;
    setCurrentModel(modelId, currentSessionKey);
    appendModelChangeMarker(prev, next, currentSessionKey);
  }, [setCurrentModel, currentSessionKey, currentModel, models, appendModelChangeMarker]);

  const handleSend = useCallback((text: string, sendAttachments?: InputAttachment[], onAbort?: () => void): void => {
    // Mode 3: targeted — save annotation comment, then return to compose mode.
    // Capture text in a ref before InputBar clears its field; the target-swap
    // effect reads this ref so it doesn't overwrite with an empty string.
    if (targetAnnotationId !== null) {
      pendingAnnotationSaveRef.current = text;
      setTargetAnnotationId(null);
      return;
    }

    // Mode 2: untargeted with annotations — compose the prelude (InputBar text)
    // with the annotations into a single blockquote-style message.
    const currentAnnotations = annotations;
    if (currentAnnotations.length > 0) {
      const messagesById = new Map(messagesRef.current.map((m) => [m.id, m.content]));
      const composed = composeAnnotatedReply(text, currentAnnotations, { messagesById });
      sendMessage(composed, sendAttachments, onAbort);
      clearAnnotations();
      setAnnotateMessageId(null);
      setCycleAnnotationId(null);
      setHighlightedAnnotationId(null);
      return;
    }

    const parsed = parseSlashCommand(text, commands);

    if (!parsed) {
      sendMessage(text, sendAttachments, onAbort);
      return;
    }

    const { command, args } = parsed;

    const dispatchParsed = (): void => {
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
        // Record session end for lean-machine badge before clearing state.
        {
          const sessionInfo = sessions.find((s) => s.key === sk);
          const total = sessionInfo?.totalTokens;
          const ctx = sessionInfo?.contextTokens;
          const peakRatio = total !== undefined && ctx !== undefined && ctx > 0
            ? total / ctx
            : null;
          void recordSessionEnd(peakRatio);
        }
        const markerId = `reset-${generateUUID()}`;
        beginActivity(sk, 'resetting', t('chat.session.resetActivity'));
        setResettingKeys((prev) => {
          const next = new Set(prev);
          next.add(sk);
          return next;
        });
        // Clear local display immediately so old turns don't linger during the RPC.
        clearMessages(sk);
        // Insert the divider synchronously before the await — the gateway streams
        // the startup greeting *during* the RPC (not after it resolves), so the
        // marker must be in place first. See the comment in
        // src/lib/openclaw/client.ts resetSession() for the ordering rationale.
        appendMessage(sk, {
          id: markerId,
          role: 'assistant',
          kind: 'info',
          content: t('chat.session.resetMarker'),
          timestamp: new Date().toISOString(),
        });
        void (async () => {
          try {
            await resetSession(sk);
            // Gateway-streamed greeting (if any) appends below the marker via
            // chat events already wired up in useChat.
          } catch (err) {
            // Remove the marker so a failed reset doesn't leave a misleading divider.
            removeMessage(sk, markerId);
            Alert.alert(
              t('chat.session.resetFailTitle'),
              translateClawError(err, 'chat.session.resetFailBody'),
            );
          } finally {
            endActivity(sk);
            setResettingKeys((prev) => {
              if (!prev.has(sk)) return prev;
              const next = new Set(prev);
              next.delete(sk);
              return next;
            });
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
            ? (() => {
                const ver = (connectionState as { serverVersion?: string }).serverVersion;
                return ver && ver !== 'unknown'
                  ? t('chat.slash.statusConnected', { version: ver })
                  : t('chat.slash.statusConnectedNoVersion');
              })()
            : connectionState.status === 'error'
              ? t('chat.slash.statusError', { message: (connectionState as { message?: string }).message ?? connectionState.status })
              : connectionState.status;
        Alert.alert(t('chat.slash.statusTitle'), statusMsg);
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
          t('chat.slash.commandsTitle'),
          t('chat.slash.commandsBody', { commands: essentialNames }),
        );
        return;
      }
      case 'model': {
        if (args && currentSessionKey) {
          const found = models.find(
            (m) => (m.name ?? m.id).toLowerCase() === args.toLowerCase(),
          );
          const prev = currentModel;
          setCurrentModel(found?.id ?? args, currentSessionKey);
          if (found) appendModelChangeMarker(prev, found, currentSessionKey);
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
        Alert.alert(t('chat.slash.agentsTitle'), agentList || t('chat.slash.agentsNone'));
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
    };

    if (confirmDestructiveCommands && (command.id === 'reset' || command.id === 'compact')) {
      const isReset = command.id === 'reset';
      Alert.alert(
        t(isReset ? 'input.resetAlert.title' : 'input.compactAlert.title'),
        t(isReset ? 'input.resetAlert.body' : 'input.compactAlert.body'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t(isReset ? 'input.resetAlert.confirm' : 'input.compactAlert.confirm'), style: isReset ? 'destructive' : 'default', onPress: dispatchParsed },
        ],
      );
      return;
    }

    dispatchParsed();
  }, [
    targetAnnotationId,
    updateAnnotation,
    setTargetAnnotationId,
    annotations,
    clearAnnotations,
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
    confirmDestructiveCommands,
    t,
  ]);

  const modelSections = useMemo(() => modelsToSections(models), [models]);
  const agentItems = useMemo(() => agentsToPickerItems(agents), [agents]);
  const adaptedSessions = useMemo(
    () => adaptSessions(sessions, pinnedKeys, t('chat.session.untitled')),
    [sessions, pinnedKeys, t],
  );
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
    <AnnotationDraftProvider targetId={targetAnnotationId} draftText={composerText}>
    <KeyboardAvoidingView
      style={[styles.keyboardRoot, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.flex}>
        <View style={styles.headerStack}>
          <CollapsingChatHeader
            title={currentSession?.title}
            onMenuPress={() => setSidebarOpen(true)}
            onSettingsPress={() => router.push('/settings')}
            onNewSessionPress={() => { void handleNewSession(); }}
            onRenameTitle={
              currentSession
                ? (next) => {
                    renameSession(currentSession.key, next).catch((err) => {
                      Alert.alert(
                        t('chat.session.renameFailTitle'),
                        translateClawError(err, 'chat.session.renameFailBody'),
                      );
                    });
                  }
                : undefined
            }
          />
          {!isDemo ? (
            <View pointerEvents="box-none" style={styles.connectionOverlay}>
              <ConnectionBanner
                connectionState={connectionState}
                onPress={() => router.push('/settings')}
              />
            </View>
          ) : null}
        </View>

        <DemoModeBanner />
        {!isDemo ? <UpdateNudgeBanner visible={nudgeVisible} onDismiss={dismissNudge} /> : null}

        {!isDemo && connectionState.status === 'identity_rejected' && uiMessages.length === 0 ? (
          <IdentityRejectedCard
            onRePair={() => {
              reconnect();
              router.push('/settings');
            }}
            onIdentityCleared={() => {
              // Fresh identity will be generated on the next connect() call.
              reconnect();
              router.push('/settings');
            }}
          />
        ) : null}

        {__DEV__ && process.env.EXPO_PUBLIC_DEBUG_CHAT_EVENTS === '1' && (() => {
          console.log('[Render][ChatScreen]', {
            msgs: messages.length,
            ui: uiMessages.length,
            showWelcome,
            debouncedSkeleton,
            sk: currentSessionKey,
          });
          return null;
        })()}

        <MessageList
          ref={messageListRef}
          messages={uiMessages}
          showThinking={showThinking}
          showToolCalls={showToolCalls}
          isLoading={debouncedSkeleton}
          onRetry={retryMessage}
          onSpeak={handleSpeak}
          onReplyToPrompt={handleReplyToPrompt}
          onAnnotate={handleAnnotate}
          annotateMessageId={annotateMessageId}
          highlightedAnnotationId={highlightedAnnotationId}
          annotationCountByMessage={annotationCountByMessage}
          activity={activity as SessionActivity | null}
          sessionKey={currentSessionKey}
          isSpeaking={isSpeaking}
          onStopSpeaking={stopSpeaking}
          historyLoading={isLoadingHistory || isRefreshing || reconcileLoading}
          onApprovalDecide={resolveExecApproval}
          isConnected={connectionState.status === 'connected'}
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
          isThinking={
            (activity?.reason === 'awaiting' ||
              activity?.reason === 'streaming' ||
              activity?.reason === 'compacting') &&
            !currentSessionIsResetting
          }
          glowVariant={
            currentSessionIsResetting
              ? 'background'
              : activity?.reason === 'streaming' ||
                  activity?.reason === 'awaiting'
                ? 'response'
                : activity
                  ? 'background'
                  : null
          }
          onStop={abortResponse}
          canStop={canStop}
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
          annotateModeActive={annotateMessageId !== null}
          onRefreshPress={() => { void handleRefreshChat(); }}
          isRefreshing={isRefreshing}
          commands={commands}
          modelSupportsImageInput={modelSupportsImageInput}
          modelSupportsAudioInput={modelCanHearAudio}
          annotationCount={annotations.length}
          annotationTargetMode={targetAnnotationId !== null}
          onCyclePrevAnnotations={handleAnnotationCyclePrev}
          onCycleAnnotations={handleAnnotationCycleNext}
          onPreviewAnnotations={handleAnnotationPreview}
          onClearAnnotations={handleAnnotationClear}
          onComposerTextChange={setComposerText}
          onComposerFocus={handleComposerFocus}
        />

        <SessionSidebar
          isOpen={sidebarOpen}
          onOpenChange={setSidebarOpen}
          sessions={adaptedSessions}
          activeSessionId={currentSessionKey}
          isSessionsLoading={sessions.length === 0 && connectionState.status === 'connecting'}
          isConnected={connectionState.status === 'connected'}
          onSelectSession={(id) => { void handleSelectSession(id); }}
          onNewSession={() => { void handleNewSession(); }}
          onPinSession={pinSession}
          onDeleteSession={(id) => {
            void deleteSession(id).catch((err: unknown) => {
              Alert.alert(
                t('chat.session.deleteFailTitle'),
                translateClawError(err, 'chat.session.deleteFailBody'),
              );
            });
          }}
          onResetSession={(id) => {
            void resetSession(id).catch((err: unknown) => {
              Alert.alert(
                t('chat.session.sessionResetFailTitle'),
                translateClawError(err, 'chat.session.sessionResetFailBody'),
              );
            });
          }}
          onRenameSession={(id, newTitle) => { void renameSession(id, newTitle).catch(() => {}); }}
          onClearRecent={async () => {
            const result = await clearRecentSessions();
            if (result.failed > 0) {
              Alert.alert(
                t('chat.session.clearRecentFailTitle'),
                t('chat.session.clearRecentFailBody', { deleted: result.deleted, failed: result.failed }),
              );
            } else if (result.skipped > 0) {
              Alert.alert(
                t('chat.session.clearRecentSkippedTitle'),
                t('chat.session.clearRecentSkippedBody', { deleted: result.deleted, skipped: result.skipped }),
              );
            }
            return result;
          }}
          onDeleteSessions={async (keys) => {
            const result = await deleteSessions(keys);
            if (result.failed > 0) {
              Alert.alert(
                t('chat.session.clearRecentFailTitle'),
                t('chat.session.clearRecentFailBody', { deleted: result.deleted, failed: result.failed }),
              );
            } else if (result.skipped > 0) {
              Alert.alert(
                t('chat.session.clearRecentSkippedTitle'),
                t('chat.session.clearRecentSkippedBody', { deleted: result.deleted, skipped: result.skipped }),
              );
            }
            return result;
          }}
          activityBySession={activityBySession}
        />
      </View>

      <AnnotationPreviewModal
        visible={annotationPreviewVisible}
        prelude={inputBarRef.current?.getDraftText() ?? ''}
        annotations={annotations}
        messagesById={new Map(messages.map((m) => [m.id, m.content]))}
        onClose={() => setAnnotationPreviewVisible(false)}
        onSend={() => {
          setAnnotationPreviewVisible(false);
          inputBarRef.current?.submit();
        }}
      />

      {connectionState.status === 'pin_mismatch' ? (
        <PinMismatchScreen
          visible
          observedSpki={connectionState.observedSpki}
          allowedSpkis={connectionState.allowedSpkis}
          onReject={() => { disconnect(); }}
          onApproveNewKey={(spki) => {
            if (!activeProfile) return;
            const current = activeProfile.security?.pinnedSpkiSha256 ?? [];
            const next = current.includes(spki) ? current : [...current, spki];
            void updateProfileSecurity(activeProfile.id, {
              pinnedSpkiSha256: next,
            }).then(() => { reconnect(); });
          }}
          onForgetServer={() => {
            if (!activeProfile) return;
            void removeProfile(activeProfile.id).then(() => {
              router.replace('/settings');
            });
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
    </AnnotationDraftProvider>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  headerStack: {
    position: 'relative',
    zIndex: 20,
  },
  connectionOverlay: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
  },
});
