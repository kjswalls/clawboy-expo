import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, unstable_batchedUpdates } from 'react-native';
import {
  emitMessageSent,
  emitAbortGen,
} from '@/badges/events';
import { formatLocalDateKey } from '@/badges/store';
import { mergeMessagesPreservingIdentity } from '@/lib/messageMerge';
import { reconcilePartsWithContent } from '@/lib/chatPartsUtils';
import { debugIngest } from '@/lib/debugIngest';
import type { InputAttachment } from '@/components/input/types';
import type { Message as OpenClawMessage } from '@/lib/openclaw/types';
import { generateUUID, parseMediaFromToolResult } from '@/lib/openclaw/utils';
import { extractInteractiveFromContent, stripClawboyDirectivesForRender } from '@/lib/openclaw/interactive';
import { buildClientContextDirective } from '@/lib/openclaw/clientContext';
import { useConnection } from '@/contexts/ConnectionContext';
import { useConventionInstall } from '@/contexts/ConventionInstallContext';
import { useAgents } from '@/hooks/useAgents';
import { useModels } from '@/hooks/useModels';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useSessions } from '@/hooks/useSessions';
import { readCachedSession, writeCachedSession } from '@/lib/chatCache';
import type { CachedSessionBlob } from '@/lib/chatCache/types';
import { normalizeProvider } from '@/lib/modelProvider';
import type { SessionActivity, SessionActivityReason } from '@/types/chat-ui';
import type { ChatMessage, ChatMessagePart, ChatThinkingBlock, ChatToolCall, MessageImage } from '@/types';
import { isDemoProfile, openClawMessageToChat } from '@/types';
import {
  AttachmentPrepareError,
  prepareChatAttachmentsFromInput,
} from '@/lib/attachments/prepareChatAttachments';
import { translateClawError } from '@/utils/translateError';
import { applyAudioCapabilityPolicy } from '@/lib/voice/applyAudioPolicy';
import type { TranscriptionError } from '@/lib/voice/transcribeAudio';
import { filterMessageSegment } from '@/lib/contentFilter';
import {
  THINKING_ID,
  closePendingPart,
  closeAllParts,
  upsertThinkingPart,
  upsertTextPart,
  upsertRunningToolPart,
  updateToolPart,
  mergeHistoryToolCalls,
  upsertThinkingBlocks,
  upsertToolCalls,
} from './useChat.utils';

const SESSION_CACHE_MAX = 50;
const RESPONSE_WATCHDOG_MS = 120_000;
const DISK_CACHE_TAIL = 200;
const DISK_PERSIST_DEBOUNCE_MS = 450;

function evictOldestSessionCaches(map: Map<string, ChatMessage[]>): void {
  while (map.size > SESSION_CACHE_MAX) {
    const first = map.keys().next().value;
    if (first === undefined) {
      break;
    }
    map.delete(first);
  }
}

export interface UseChatResult {
  messages: ChatMessage[];
  /** Current per-session activity for the active session. */
  activity: SessionActivity | null;
  /** Activity state for every session — drives sidebar spinners and per-session gating. */
  activityBySession: Record<string, SessionActivity | null>;
  /** True while the cold-start reconcile loadHistory RPC is in-flight. */
  reconcileLoading: boolean;
  sendMessage: (text: string, attachments?: InputAttachment[], onAbort?: () => void) => void;
  abortResponse: () => void;
  retryMessage: (assistantMessageId: string) => void;
  loadHistory: (sessionKey: string) => Promise<void>;
  /** Seeds the in-memory session cache from encrypted disk (Option B-lite). */
  seedCache: (sessionKey: string, messages: ChatMessage[]) => void;
  /** Clear the local display for a session (UI-only, server history untouched). */
  clearMessages: (sessionKey: string) => void;
  /** Append a single message to a session's cache (e.g. an info marker after reset). */
  appendMessage: (sessionKey: string, message: ChatMessage) => void;
  /** Remove a single message from a session's cache by id (e.g. to clean up a marker on RPC failure). */
  removeMessage: (sessionKey: string, id: string) => void;
  /** Start a named activity for a session (e.g. 'resetting'). */
  beginActivity: (sessionKey: string, reason: SessionActivityReason, label?: string) => void;
  /** End the current activity for a session. */
  endActivity: (sessionKey: string) => void;
}

export function useChat(): UseChatResult {
  const { t } = useTranslation();
  const { client, connectionState, connectGeneration } = useConnection();
  const { currentSessionKey, sessions, hasLoadedOnce, createSession, refreshSessions, requestRefreshSessions } = useSessions();
  const { currentAgent } = useAgents();
  const { currentModel } = useModels();
  const { activeProfile } = useServerConfig();
  const {
    resolveOnFirstInteraction,
    getStatus: getConventionStatus,
    globalMode: conventionGlobalMode,
  } = useConventionInstall();

  // Tracks which (profile, agent, session) triples have already received a
  // ClawBoy convention primer in their first message of the session. Cleared
  // on session reset, compaction events, and disconnects.
  const primedSessionsRef = useRef<Set<string>>(new Set());

  const sessionCacheRef = useRef<Map<string, ChatMessage[]>>(new Map());
  // Monotonically-incrementing write version per session key. Bumped on every
  // replaceSessionMessages call so loadHistory can detect concurrent local writes
  // that happened while its chat.history RPC was in-flight.
  const sessionCacheVersionRef = useRef<Map<string, number>>(new Map());
  const streamMessageIdRef = useRef<Map<string, string>>(new Map());
  // Maps the per-stream id (minted in OpenClawClient.SessionStreamState) to the
  // assistant placeholder message id. Lets onStreamInterrupted target the exact
  // bubble that was bound when the stream started, instead of falling back to
  // "any streaming assistant message in this session" (which clobbered prior
  // tool-call bubbles when a side-channel sub-agent interrupted).
  const streamIdToMidRef = useRef<Map<string, string>>(new Map());
  const currentSessionKeyRef = useRef<string | null>(currentSessionKey);
  currentSessionKeyRef.current = currentSessionKey;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const connectGenRef = useRef(connectGeneration);
  connectGenRef.current = connectGeneration;

  // On every disconnect/reconnect, drop all primer markers — the agent's
  // in-context memory of the ClawBoy convention is gone with the prior
  // connection, so the next send must re-inject the primer for fallback
  // agents.
  useEffect(() => {
    primedSessionsRef.current.clear();
  }, [connectGeneration]);

  // Track the last generation we saw to distinguish initial connect from reconnects.
  const lastConnectGenRef = useRef<number | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reconcileLoading, setReconcileLoading] = useState(false);

  // Per-session activity tracking.
  const activityBySessionRef = useRef<Record<string, SessionActivity | null>>({});
  const [activity, setActivityState] = useState<SessionActivity | null>(null);
  const [activityBySession, setActivityBySession] = useState<Record<string, SessionActivity | null>>({});

  const pendingHistoryReconcileRef = useRef<string | null>(null);
  const diskPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks interrupted bubbles that resulted from socket closure (not user-abort).
  // Value: { timerId } — cleared when reconcile delivers the real message, or timer expires.
  const socketClosePendingRef = useRef<Map<string, { mid: string; timerId: ReturnType<typeof setTimeout> }>>(new Map());

  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-session deferred cleanup for orphan stream placeholders. Some gateway
  // events (notably post-reset metadata "labels") stream chunks via streamChunk
  // but never send chat:final, leaving a placeholder with id starting with
  // `stream-` and isStreaming:false in the cache. We schedule a cleanup on
  // streamEnd and cancel it from onMessage when chat:final arrives.
  const orphanCleanupTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // RAF-coalesced chunk batch: accumulates text/thinking deltas arriving within
  // a single animation frame so we do at most one React state update per ~16ms.
  const pendingBatchRef = useRef<Map<string, {
    sk: string;
    mid: string;
    text: string;
    thinking: string;
    thinkingCumulative: boolean;
    /** Id and startedAt of the open thinking part this batch targets. */
    thinkingPartId: string | null;
    thinkingPartStartedAt: number;
  }>>(new Map());
  const chunkRafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  // Parts-tracking refs — used across the event handlers inside useEffect.
  // Reset when a new streaming placeholder is created.
  /** 'none' | 'thinking' | 'text' — what kind of part is currently open, per session */
  const streamingPhaseRef = useRef<Map<string, 'none' | 'thinking' | 'text'>>(new Map());
  /** Metadata for the currently open thinking part, per session */
  const currentThinkingPartRef = useRef<Map<string, { id: string; startedAt: number } | null>>(new Map());
  /** Monotonically incrementing counter for thinking part ids, per session */
  const thinkingPartCounterRef = useRef<Map<string, number>>(new Map());

  const sessionTitle = useMemo(
    () => sessions.find((s) => s.key === currentSessionKey)?.title,
    [sessions, currentSessionKey]
  );

  const clearWatchdog = useCallback((): void => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const cancelChunkRaf = useCallback((): void => {
    if (chunkRafRef.current !== null) {
      cancelAnimationFrame(chunkRafRef.current);
      chunkRafRef.current = null;
    }
    pendingBatchRef.current.clear();
  }, []);

  const setActivity = useCallback((sk: string, act: SessionActivity | null): void => {
    activityBySessionRef.current[sk] = act;
    if (sk === currentSessionKeyRef.current) {
      setActivityState(act);
    }
    setActivityBySession({ ...activityBySessionRef.current });
  }, []);

  const beginActivity = useCallback(
    (sk: string, reason: SessionActivityReason, label?: string): void => {
      setActivity(sk, { reason, label, since: Date.now() });
    },
    [setActivity]
  );

  const endActivity = useCallback(
    (sk: string): void => {
      setActivity(sk, null);
    },
    [setActivity]
  );

  const replaceSessionMessages = useCallback(
    (sk: string, next: ChatMessage[]): void => {
      sessionCacheRef.current.set(sk, next);
      sessionCacheVersionRef.current.set(sk, (sessionCacheVersionRef.current.get(sk) ?? 0) + 1);
      evictOldestSessionCaches(sessionCacheRef.current);
      if (sk === currentSessionKeyRef.current) {
        // Pass `next` directly — all updaters produce new refs only for the
        // changed message, so unchanged messages keep their identity and
        // React.memo on MessageBubble correctly skips re-renders.
        setMessages(next);
      }
    },
    []
  );

  const updateSessionMessages = useCallback(
    (sk: string, updater: (prev: ChatMessage[]) => ChatMessage[]): void => {
      const prev = sessionCacheRef.current.get(sk) ?? [];
      const next = updater(prev);
      replaceSessionMessages(sk, next);
    },
    [replaceSessionMessages]
  );

  const loadHistory = useCallback(
    async (sessionKey: string): Promise<void> => {
      const c = client.current;
      debugIngest(() => ({ runId: 'post-fix-reconnect', hypothesisId: 'H_RECONNECT', location: 'useChat.ts:loadHistory:enter', message: 'loadHistory invoked', data: { sk: sessionKey, hasClient: !!c, connStatus: connectionState.status } }));
      if (!c || connectionState.status !== 'connected') {
        return;
      }
      // Snapshot write version so we can detect concurrent local mutations
      // (optimistic user message, streaming placeholder) that race the RPC.
      const versionBefore = sessionCacheVersionRef.current.get(sessionKey) ?? 0;
      const { messages: raw, toolCalls } = await c.getSessionMessages(sessionKey);
      debugIngest(() => ({ runId: 'post-fix-reconnect', hypothesisId: 'H_RECONNECT', location: 'useChat.ts:loadHistory:rpcOk', message: 'chat.history RPC resolved', data: { sk: sessionKey, rawCount: raw.length, toolCallsCount: toolCalls?.length ?? 0, curSk: currentSessionKeyRef.current, versionMatch: (sessionCacheVersionRef.current.get(sessionKey) ?? 0) === versionBefore } }));
      // Bail if the user switched to a different session while this fetch was in-flight.
      if (currentSessionKeyRef.current !== sessionKey) {
        return;
      }
      // Bail if local writes happened during the RPC — overwriting them with a
      // (possibly stale/empty) server response would silently erase the optimistic
      // user message and streaming placeholder.
      if ((sessionCacheVersionRef.current.get(sessionKey) ?? 0) !== versionBefore) {
        return;
      }
      const prevMsgs = sessionCacheRef.current.get(sessionKey) ?? [];
      // An empty server response over a non-empty local cache is almost always
      // wrong: demo storage may be out of sync with disk cache, or a transient
      // gateway hiccup returned [] for a known-non-empty session. Treat as a
      // no-op so we don't silently erase messages that are correct and visible.
      // The cache will be refreshed on the next non-empty server response.
      if (raw.length === 0 && prevMsgs.length > 0) {
        if (__DEV__) {
          console.warn('[useChat] loadHistory returned empty for non-empty cache — skipping replace', { sessionKey, prevCount: prevMsgs.length });
        }
        return;
      }
      const gatewayUrl = c.getGatewayUrl();
      let chatMsgs = raw.map((m) => openClawMessageToChat(m, gatewayUrl));
      chatMsgs = mergeHistoryToolCalls(chatMsgs, toolCalls, gatewayUrl);
      // Preserve existing ChatMessage references for unchanged messages so the
      // WeakMap adapt cache in app/index.tsx stays valid — no unnecessary
      // MessageBubble re-renders or Markdown re-parses (eliminates cold-start shake).
      chatMsgs = mergeMessagesPreservingIdentity(prevMsgs, chatMsgs);
      replaceSessionMessages(sessionKey, chatMsgs);
    },
    [client, connectionState.status, replaceSessionMessages]
  );

  // useLayoutEffect (not useEffect) so the messages state is updated before
  // the browser/native paints the commit that also changed currentSessionKey.
  // When disk hydration pre-seeded the cache and then called setCurrentSession,
  // both happen in the same batch; this layout effect reads the already-seeded
  // cache in the same commit and calls setMessages(cached) before paint — so
  // MessageList sees non-empty messages on its first render after the session
  // key changes, avoiding the one-frame skeleton flash + cross-fade.
  useLayoutEffect(() => {
    const sk = currentSessionKey;
    if (!sk) {
      setMessages([]);
      setActivityState(null);
      return;
    }
    // Show whatever is already cached immediately. Reading the stored array
    // directly (no clone) preserves message object identity across session
    // switches so MessageBubble memos remain valid.
    const cachedMsgs = sessionCacheRef.current.get(sk) ?? [];
    // If a background stream has been accumulating text while this session was
    // not active, hydrate the streaming placeholder so the bubble shows the
    // latest accumulated content on switch-back (before chat:final arrives).
    const c = client.current;
    const backgroundText = c ? c.getSessionStreamText(sk) : null;
    if (backgroundText) {
      const hydrated = cachedMsgs.map((m) =>
        m.isStreaming ? { ...m, content: backgroundText } : m
      );
      setMessages(hydrated);
    } else {
      setMessages(cachedMsgs);
    }
    // Sync activity for the newly active session.
    setActivityState(activityBySessionRef.current[sk] ?? null);
    // If the cache is empty and we're connected, fetch history from the server —
    // but only for sessions the server already knows about. Locally-just-created
    // sessions (key not yet in the server's session list) have no history to
    // fetch, and issuing chat.history for them risks getting back [] while the
    // user is already sending their first message, which would silently clobber
    // the optimistic user bubble and assistant placeholder. Instead we prime the
    // cache with [] so this branch is not re-entered on subsequent renders.
    if (!sessionCacheRef.current.has(sk) && connectionState.status === 'connected') {
      const isOnServer = sessions.some((s) => s.key === sk);
      if (isOnServer || !hasLoadedOnce) {
        // Server-known session (or sessions not yet loaded) — fetch real history.
        void loadHistory(sk);
      } else {
        // Locally-just-created session: prime cache and wait for the first send.
        sessionCacheRef.current.set(sk, []);
      }
    }
  }, [currentSessionKey, connectionState.status, loadHistory, sessions, hasLoadedOnce]);

  useEffect(() => {
    if (connectionState.status !== 'connected') {
      streamMessageIdRef.current.clear();
      streamIdToMidRef.current.clear();
      activityBySessionRef.current = {};
      setActivityState(null);
      setActivityBySession({});
      clearWatchdog();
      cancelChunkRaf();
      orphanCleanupTimersRef.current.forEach((t) => clearTimeout(t));
      orphanCleanupTimersRef.current.clear();
      socketClosePendingRef.current.forEach(({ timerId }) => clearTimeout(timerId));
      socketClosePendingRef.current.clear();
    }
  }, [connectionState.status, clearWatchdog, cancelChunkRaf]);

  const seedCache = useCallback(
    (sessionKey: string, msgs: ChatMessage[]): void => {
      // Drop orphan stream placeholders that may have been persisted by older
      // builds: they have client-generated `stream-` prefix ids and indicate a
      // streaming turn that never received chat:final.
      const finalized = msgs
        .filter((m) => !m.isStreaming && !m.id.startsWith('stream-'))
        .slice(-DISK_CACHE_TAIL);
      // Collapse adjacent duplicate assistant messages (same content) that may
      // have been persisted to disk before the duplicate-on-stream-end bug was
      // fixed. Keep the last occurrence so the server-assigned id survives.
      const deduped = finalized.reduce<ChatMessage[]>((acc, msg) => {
        const prev = acc[acc.length - 1];
        if (
          prev &&
          prev.role === 'assistant' &&
          msg.role === 'assistant' &&
          prev.content === msg.content &&
          prev.content.length > 0
        ) {
          acc[acc.length - 1] = msg;
          return acc;
        }
        acc.push(msg);
        return acc;
      }, []);
      // Preserve existing references for structurally unchanged messages so a
      // re-seed (e.g. hot reload) doesn't bust the WeakMap adaptation cache.
      const existingMsgs = sessionCacheRef.current.get(sessionKey) ?? [];
      const merged = mergeMessagesPreservingIdentity(existingMsgs, deduped);
      replaceSessionMessages(sessionKey, merged);
      // Demo profile: disk cache is the canonical history source. The demo
      // client's getSessionMessages only knows about seeded sessions and
      // messages persisted via sendMessage — it can return [] for user-created
      // sessions that are only tracked in the disk cache. Queuing a reconcile
      // would clobber correct content with an empty result. Fix 1 above adds a
      // safety net, but skipping the reconcile entirely is the cleaner path.
      if (!isDemoProfile(activeProfile)) {
        pendingHistoryReconcileRef.current = sessionKey;
      }
    },
    [replaceSessionMessages, activeProfile]
  );

  // After cold-start disk hydration, force one authoritative `chat.history` fetch.
  useEffect(() => {
    if (connectionState.status !== 'connected') {
      return;
    }
    const sk = pendingHistoryReconcileRef.current;
    if (!sk) {
      return;
    }
    if (sk !== currentSessionKeyRef.current) {
      pendingHistoryReconcileRef.current = null;
      return;
    }
    pendingHistoryReconcileRef.current = null;
    setReconcileLoading(true);
    void loadHistory(sk).finally(() => setReconcileLoading(false));
  }, [connectionState.status, loadHistory]);

  // Subscribe to session.message events for the active session on connect.
  // On reconnect, also run a bounded chat.history reconcile to catch any
  // messages committed while we were disconnected (subscribe has no replay).
  useEffect(() => {
    const c = client.current;
    const sk = currentSessionKey;
    if (!c || connectionState.status !== 'connected' || !sk) {
      return;
    }
    // Subscribe to transcript pushes. Non-critical: older gateways may return method-not-found.
    // Track the promise so cleanup can chain unsubscribe after subscribe completes,
    // preventing a race where unsubscribe arrives before subscribe on rapid reconnects.
    let subscribeCancelled = false;
    const subscribePromise = c.subscribeSessionMessages(sk).catch((err) => {
      if (!subscribeCancelled) {
        debugIngest(() => ({ hypothesisId: 'H_SUB', location: 'useChat.ts:subscribe', message: 'sessions.messages.subscribe failed (gateway may not support it); falling back to chat.history reconcile', data: { sk, err: String(err) } }));
      }
    });

    // On reconnect (not first connect), reconcile via bounded chat.history.
    const isReconnect = lastConnectGenRef.current !== null && lastConnectGenRef.current !== connectGeneration;
    lastConnectGenRef.current = connectGeneration;
    if (isReconnect) {
      const curr = activityBySessionRef.current[sk];
      // Don't reconcile if we're in the middle of an active stream — the stream
      // will self-correct via onMessage/chat:final.
      if (!curr || curr.reason === 'reconnecting-stream-pending') {
        if (curr?.reason === 'reconnecting-stream-pending') {
          setActivity(sk, { reason: 'reconciling', label: t('chat.activity.reconciling'), since: Date.now() });
        }
        void c.getSessionMessages(sk, undefined, 20).then(({ messages: raw, toolCalls }) => {
          if (currentSessionKeyRef.current !== sk) return;
          const gatewayUrl = c.getGatewayUrl();
          let chatMsgs = raw.map((m) => openClawMessageToChat(m, gatewayUrl));
          chatMsgs = mergeHistoryToolCalls(chatMsgs, toolCalls, gatewayUrl);
          const prevMsgs = sessionCacheRef.current.get(sk) ?? [];
          if (raw.length > 0) {
            chatMsgs = mergeMessagesPreservingIdentity(prevMsgs, chatMsgs);
            // Clear any reconnecting-stream-pending placeholders — the real response is now in history.
            const pending = socketClosePendingRef.current.get(sk);
            if (pending) {
              clearTimeout(pending.timerId);
              socketClosePendingRef.current.delete(sk);
              chatMsgs = chatMsgs.filter((m) => m.id !== pending.mid);
            }
            replaceSessionMessages(sk, chatMsgs);
          }
        }).catch(() => {}).finally(() => {
          const curr2 = activityBySessionRef.current[sk];
          if (curr2?.reason === 'reconciling' || curr2?.reason === 'reconnecting-stream-pending') {
            setActivity(sk, null);
          }
        });
      }
    }

    return () => {
      subscribeCancelled = true;
      // Chain unsubscribe after subscribe resolves so the server always sees
      // subscribe before unsubscribe, even on rapid reconnects.
      void subscribePromise.finally(() => {
        void c.unsubscribeSessionMessages(sk).catch(() => {});
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState.status, connectGeneration, currentSessionKey]);

  /**
   * Immediately write the current session tail to disk. Reads from sessionCacheRef
   * directly so it can be called right after a cache mutation without waiting for
   * a React state update. Preserves any in-flight drafts that useDraft has
   * already written. Safe to call at any time (skips silently if no profile).
   */
  const flushSessionToDisk = useCallback(
    (sk: string): void => {
      const pid = activeProfile?.id;
      if (!pid) {
        return;
      }
      const all = sessionCacheRef.current.get(sk) ?? [];
      // Exclude orphan stream placeholders (id starts with `stream-`,
      // isStreaming:false) — these are turns the gateway never finalized via
      // chat:final, and persisting them resurrects them on next cold start.
      const finalized = all
        .filter((m) => !m.isStreaming && !m.id.startsWith('stream-'))
        .slice(-DISK_CACHE_TAIL);
      if (finalized.length === 0) {
        return;
      }
      void (async () => {
        try {
          // Preserve drafts already written by useDraft so we don't clobber them.
          const existing = await readCachedSession(pid).catch(() => null);
          const providerInfo = currentModel ? normalizeProvider(currentModel) : null;
          const blob: CachedSessionBlob = {
            version: 4,
            drafts: existing?.drafts ?? {},
            profileId: pid,
            sessionKey: sk,
            sessionTitle: sessionTitle ?? undefined,
            agent: currentAgent
              ? { id: currentAgent.id, name: currentAgent.name, emoji: currentAgent.emoji, dotBg: '#F59E0B' }
              : undefined,
            model: currentModel
              ? { id: currentModel.id, name: currentModel.name ?? currentModel.id, providerSlug: providerInfo?.slug, dotBg: providerInfo?.color }
              : undefined,
            updatedAt: Date.now(),
            messages: finalized.map((m) => ({
              ...m,
              toolCalls: m.toolCalls?.map((t) => ({ ...t })),
              thinkingBlocks: m.thinkingBlocks?.map((b) => ({ ...b })),
              images: m.images?.map((img) => ({ ...img })),
            })),
          };
          await writeCachedSession(pid, blob);
        } catch {
          /* ignore */
        }
      })();
    },
    [activeProfile?.id, currentAgent?.id, currentModel?.id, sessionTitle]
  );

  // Debounced disk persist — fires after streaming completes or when messages
  // change while not streaming. The `isStreaming` guard is dropped so that
  // user messages are visible in the persisted tail even if the app is killed
  // mid-stream (the filter already excludes the in-flight assistant bubble).
  useEffect(() => {
    const pid = activeProfile?.id;
    if (!pid || !currentSessionKey) {
      return;
    }
    if (diskPersistTimerRef.current) {
      clearTimeout(diskPersistTimerRef.current);
    }
    diskPersistTimerRef.current = setTimeout(() => {
      diskPersistTimerRef.current = null;
      flushSessionToDisk(currentSessionKey);
    }, DISK_PERSIST_DEBOUNCE_MS);
    return () => {
      if (diskPersistTimerRef.current) {
        clearTimeout(diskPersistTimerRef.current);
        diskPersistTimerRef.current = null;
      }
    };
  }, [
    activeProfile?.id,
    currentSessionKey,
    messages,
    flushSessionToDisk,
  ]);

  const appendWatchdogTimeout = useCallback(
    (sk: string): void => {
      updateSessionMessages(sk, (prev) => [
        ...prev,
        {
          id: `timeout-${Date.now()}`,
          role: 'system',
          content: t('chat.system.timeout'),
          timestamp: new Date().toISOString(),
        },
      ]);
      setActivity(sk, null);
      streamMessageIdRef.current.delete(sk);
    },
    [updateSessionMessages, setActivity]
  );

  useEffect(() => {
    const oc = client.current;
    if (!oc || connectionState.status !== 'connected') {
      return;
    }

    const genAtSubscribe = connectGenRef.current;
    const gatewayUrl = oc.getGatewayUrl();

    const resolveSessionKey = (k: unknown): string | null => {
      if (typeof k === 'string' && k.length > 0) {
        return k;
      }
      return currentSessionKeyRef.current;
    };

    // Per-session stream-state accessors so call sites stay readable.
    const getStreamMid = (sk: string): string | null => streamMessageIdRef.current.get(sk) ?? null;
    const setStreamMid = (sk: string, mid: string): void => { streamMessageIdRef.current.set(sk, mid); };
    const clearStreamMid = (sk: string): void => { streamMessageIdRef.current.delete(sk); };
    const getPhase = (sk: string): 'none' | 'thinking' | 'text' => streamingPhaseRef.current.get(sk) ?? 'none';
    const setPhase = (sk: string, p: 'none' | 'thinking' | 'text'): void => { streamingPhaseRef.current.set(sk, p); };
    const getThinkingPart = (sk: string): { id: string; startedAt: number } | null =>
      currentThinkingPartRef.current.get(sk) ?? null;
    const setThinkingPart = (sk: string, v: { id: string; startedAt: number } | null): void => {
      currentThinkingPartRef.current.set(sk, v);
    };
    const nextThinkingId = (sk: string): string => {
      const n = (thinkingPartCounterRef.current.get(sk) ?? 0) + 1;
      thinkingPartCounterRef.current.set(sk, n);
      return `thinking-${n}`;
    };

    // Apply one session's pending batch to its message cache.
    const applyBatch = (sk: string, batch: { mid: string; text: string; thinking: string; thinkingCumulative: boolean; thinkingPartId: string | null; thinkingPartStartedAt: number }): void => {
      const { mid, text, thinking, thinkingCumulative, thinkingPartId, thinkingPartStartedAt } = batch;
      updateSessionMessages(sk, (prev) =>
        prev.map((m) => {
          if (m.id !== mid) return m;
          let next: ChatMessage = m;
          if (thinking) {
            next = {
              ...next,
              thinkingBlocks: upsertThinkingBlocks(next.thinkingBlocks, thinking, thinkingCumulative),
            };
            if (thinkingPartId) {
              next = {
                ...next,
                parts: upsertThinkingPart(
                  next.parts ?? [],
                  thinkingPartId,
                  thinkingPartStartedAt,
                  thinking,
                  thinkingCumulative
                ),
              };
            }
          }
          if (text) {
            next = {
              ...next,
              content: next.content + text,
              isStreaming: true,
              parts: upsertTextPart(next.parts ?? [], text),
            };
          }
          return next;
        })
      );
    };

    // Flush all sessions' pending RAF batches — at most once per animation frame (~16ms).
    const flushChunkBatch = (): void => {
      chunkRafRef.current = null;
      if (pendingBatchRef.current.size === 0) return;
      const entries = [...pendingBatchRef.current.entries()];
      pendingBatchRef.current.clear();
      for (const [batchSk, batch] of entries) {
        applyBatch(batchSk, batch);
      }
    };

    // Flush a single session's pending batch synchronously (used before in-place mutations).
    const flushSessionBatch = (sk: string): void => {
      const batch = pendingBatchRef.current.get(sk);
      if (!batch) return;
      pendingBatchRef.current.delete(sk);
      applyBatch(sk, batch);
    };

    // Cancel a session's pending batch; also cancel the RAF if no other sessions have batches.
    const cancelSessionBatchAndMaybeRaf = (sk: string): void => {
      pendingBatchRef.current.delete(sk);
      if (pendingBatchRef.current.size === 0 && chunkRafRef.current !== null) {
        cancelAnimationFrame(chunkRafRef.current);
        chunkRafRef.current = null;
      }
    };

    // Creates the empty assistant placeholder and starts the response watchdog.
    // Safe to call multiple times for the same session — idempotent when a
    // placeholder already exists (chatAwaitingResponse fires first, then
    // streamStart may fire again once the gateway starts streaming).
    const ensurePlaceholder = (sk: string, streamId?: string): void => {
      const existingMid = getStreamMid(sk);
      if (existingMid) {
        // Placeholder already exists; just restart the watchdog so the timer
        // resets from when the server actually began responding.
        if (streamId && !streamIdToMidRef.current.has(streamId)) {
          streamIdToMidRef.current.set(streamId, existingMid);
        }
        clearWatchdog();
        watchdogRef.current = setTimeout(() => {
          appendWatchdogTimeout(sk);
        }, RESPONSE_WATCHDOG_MS);
        return;
      }
      const mid = `stream-${generateUUID()}`;
      setStreamMid(sk, mid);
      if (streamId) {
        streamIdToMidRef.current.set(streamId, mid);
      }
      // Reset parts-tracking state for this new turn.
      streamingPhaseRef.current.delete(sk);
      setThinkingPart(sk, null);
      thinkingPartCounterRef.current.delete(sk);
      updateSessionMessages(sk, (prev) => [
        ...prev,
        {
          id: mid,
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
          isStreaming: true,
          parts: [],
        },
      ]);
      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        appendWatchdogTimeout(sk);
      }, RESPONSE_WATCHDOG_MS);
    };

    const onAwaitingResponse = (payload: unknown): void => {
      if (connectGenRef.current !== genAtSubscribe) {
        return;
      }
      const p = payload as { sessionKey?: string; streamId?: string };
      const sk = resolveSessionKey(p.sessionKey);
      if (!sk) {
        return;
      }
      debugIngest(() => ({ hypothesisId: 'H6,H8', location: 'useChat.ts:onAwaitingResponse', message: 'chatAwaitingResponse fired - placeholder created', data: { sk, streamId: p.streamId, priorStreamMid: sk ? getStreamMid(sk) : null, priorMsgCount: (sessionCacheRef.current.get(sk) ?? []).length } }));
      // Batch activity + placeholder updates so the activity footer row and
      // the streaming bubble never appear in separate React commits (no flicker).
      unstable_batchedUpdates(() => {
        setActivity(sk, { reason: 'awaiting', since: Date.now() });
        ensurePlaceholder(sk, p.streamId);
      });
    };

    const onStreamStart = (payload: unknown): void => {
      if (connectGenRef.current !== genAtSubscribe) {
        return;
      }
      const p = payload as { sessionKey?: string; streamId?: string };
      const sk = resolveSessionKey(p.sessionKey);
      if (!sk) {
        return;
      }
      // Upgrade awaiting → streaming once the server begins delivering content.
      const curr = activityBySessionRef.current[sk];
      if (!curr || curr.reason === 'awaiting') {
        setActivity(sk, { reason: 'streaming', since: Date.now() });
      }
      ensurePlaceholder(sk, p.streamId);
    };

    const onStreamChunk = (payload: unknown): void => {
      if (connectGenRef.current !== genAtSubscribe) {
        return;
      }
      const p = payload as { text?: string; sessionKey?: string };
      const sk = resolveSessionKey(p.sessionKey);
      const rawText = typeof p.text === 'string' ? p.text : '';
      if (!sk || !rawText) {
        return;
      }
      // Content moderation seam — no-op in global build; CN build may filter.
      // See src/lib/contentFilter.ts and docs/legal/cn-readiness/04-content-moderation.md.
      const text = filterMessageSegment(rawText);
      if (text === null) {
        return;
      }
      let mid = getStreamMid(sk);
      if (!mid) {
        // Belt-and-suspenders: if a late streamChunk arrives after chat:final
        // finalized the turn (streamMessageIdRef was cleared by onMessage),
        // attach it to the most-recently-finalized assistant message rather than
        // creating a spurious second bubble. Only fall back to ensurePlaceholder
        // when no recent assistant message exists (true early-race case).
        const msgs = sessionCacheRef.current.get(sk) ?? [];
        const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
        const recentlyFinalized =
          lastAssistant &&
          !lastAssistant.isStreaming &&
          Date.now() - new Date(lastAssistant.timestamp).getTime() < 2000;
        if (recentlyFinalized) {
          mid = lastAssistant.id;
        } else {
          // Early-race: text chunks arrived before chatAwaitingResponse/streamStart
          // (e.g. the gateway startup greeting after sessions.reset). Create a
          // placeholder so this content is not silently dropped.
          ensurePlaceholder(sk);
          mid = getStreamMid(sk);
        }
      }
      if (!mid) {
        return;
      }
      // Upgrade awaiting → streaming on first content chunk.
      const curr = activityBySessionRef.current[sk];
      if (!curr || curr.reason === 'awaiting') {
        setActivity(sk, { reason: 'streaming', since: Date.now() });
      }
      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        appendWatchdogTimeout(sk);
      }, RESPONSE_WATCHDOG_MS);

      // On phase transition (thinking/tool → text): flush the existing batch
      // immediately so the thinking part is closed before we open the text part.
      if (getPhase(sk) !== 'text') {
        if (pendingBatchRef.current.has(sk)) {
          flushSessionBatch(sk);
          if (pendingBatchRef.current.size === 0 && chunkRafRef.current !== null) {
            cancelAnimationFrame(chunkRafRef.current);
            chunkRafRef.current = null;
          }
        }
        setPhase(sk, 'text');
        setThinkingPart(sk, null);
      }

      // Accumulate into the batch for this animation frame.
      const cur = pendingBatchRef.current.get(sk);
      if (cur && cur.mid === mid) {
        cur.text += text;
      } else {
        if (cur) flushSessionBatch(sk);
        pendingBatchRef.current.set(sk, {
          sk, mid, text, thinking: '', thinkingCumulative: false,
          thinkingPartId: null, thinkingPartStartedAt: 0,
        });
      }
      if (chunkRafRef.current === null) {
        chunkRafRef.current = requestAnimationFrame(flushChunkBatch);
      }
    };

    const onThinkingChunk = (payload: unknown): void => {
      if (connectGenRef.current !== genAtSubscribe) {
        return;
      }
      const p = payload as { text?: string; cumulative?: boolean; sessionKey?: string };
      const sk = resolveSessionKey(p.sessionKey);
      const text = typeof p.text === 'string' ? p.text : '';
      if (!sk || !text) {
        return;
      }

      // Resolve the target message id — create a placeholder if none exists yet
      // (early race: thinking arrives before chatAwaitingResponse), or attach to
      // the last assistant message when finalization already happened (late chunk).
      let targetMid = getStreamMid(sk);
      if (!targetMid) {
        const msgs = sessionCacheRef.current.get(sk) ?? [];
        const existingAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
        if (existingAssistant && !existingAssistant.isStreaming) {
          // Post-finalization: attach to the last completed assistant message.
          targetMid = existingAssistant.id;
        } else if (!existingAssistant) {
          // Early race: no assistant message at all; create a placeholder.
          ensurePlaceholder(sk);
          targetMid = getStreamMid(sk);
        }
      }
      if (!targetMid) {
        return;
      }

      // Upgrade awaiting → streaming on first thinking chunk.
      const curr = activityBySessionRef.current[sk];
      if (!curr || curr.reason === 'awaiting') {
        setActivity(sk, { reason: 'streaming', since: Date.now() });
      }

      const cumulative = p.cumulative === true;

      // On phase transition (text/tool/none → thinking): flush existing batch
      // immediately and open a new thinking part.
      if (getPhase(sk) !== 'thinking') {
        if (pendingBatchRef.current.has(sk)) {
          flushSessionBatch(sk);
          if (pendingBatchRef.current.size === 0 && chunkRafRef.current !== null) {
            cancelAnimationFrame(chunkRafRef.current);
            chunkRafRef.current = null;
          }
        }
        const partId = nextThinkingId(sk);
        const startedAt = Date.now();
        setThinkingPart(sk, { id: partId, startedAt });
        setPhase(sk, 'thinking');
      }

      const thinkingPart = getThinkingPart(sk);

      // Accumulate into the batch for this animation frame.
      const prev = pendingBatchRef.current.get(sk);
      if (prev && prev.mid === targetMid) {
        if (cumulative) {
          // Cumulative means this IS the full thinking text so far — replace.
          prev.thinking = text;
          prev.thinkingCumulative = true;
        } else {
          prev.thinking += text;
        }
      } else {
        if (prev) flushSessionBatch(sk);
        pendingBatchRef.current.set(sk, {
          sk,
          mid: targetMid,
          text: '',
          thinking: text,
          thinkingCumulative: cumulative,
          thinkingPartId: thinkingPart?.id ?? null,
          thinkingPartStartedAt: thinkingPart?.startedAt ?? Date.now(),
        });
      }
      if (chunkRafRef.current === null) {
        chunkRafRef.current = requestAnimationFrame(flushChunkBatch);
      }
    };

    const onToolCall = (payload: unknown): void => {
      if (connectGenRef.current !== genAtSubscribe) {
        return;
      }
      const p = payload as {
        toolCallId: string;
        name: string;
        phase: string;
        result?: string;
        args?: Record<string, unknown>;
        meta?: string;
        sessionKey?: string;
      };
      const sk = resolveSessionKey(p.sessionKey);
      if (!sk) {
        return;
      }

      // Flush any pending RAF batch immediately so thinking/text deltas are
      // committed before we mutate parts with the tool event.
      if (pendingBatchRef.current.has(sk)) {
        flushSessionBatch(sk);
        if (pendingBatchRef.current.size === 0 && chunkRafRef.current !== null) {
          cancelAnimationFrame(chunkRafRef.current);
          chunkRafRef.current = null;
        }
      }

      const isStart = p.phase === 'start' || (p.phase !== 'result' && p.phase !== 'error');
      const isResult = p.phase === 'result' || p.phase === 'error';

      // Update phase tracking for start events only.
      if (isStart) {
        streamingPhaseRef.current.delete(sk);
        setThinkingPart(sk, null);
      }

      // Extract MEDIA: tokens from the result before committing to UI.
      // Also check p.meta when the server strips data.result (verboseLevel<full)
      // but still sends a short summary that may contain a media path.
      let displayResult = p.result;
      let extractedImages: Array<{ url: string; mimeType?: string; alt?: string }> = [];
      let extractedAudioUrl: string | undefined;
      let extractedVideoUrl: string | undefined;
      if (isResult) {
        if (p.result && p.result.includes('MEDIA:')) {
          const extracted = parseMediaFromToolResult(p.result, gatewayUrl);
          displayResult = extracted.cleanText || undefined;
          extractedImages = extracted.images;
          extractedAudioUrl = extracted.audioUrls[0];
          extractedVideoUrl = extracted.videoUrls[0];
        }
        // Fallback: meta may contain a bare path when result was stripped by server
        if (!extractedAudioUrl && !extractedVideoUrl && extractedImages.length === 0 && p.meta) {
          const metaExtracted = parseMediaFromToolResult(p.meta, gatewayUrl);
          if (metaExtracted.audioUrls.length > 0 || metaExtracted.videoUrls.length > 0 || metaExtracted.images.length > 0) {
            extractedImages = metaExtracted.images;
            extractedAudioUrl = metaExtracted.audioUrls[0];
            extractedVideoUrl = metaExtracted.videoUrls[0];
          }
        }
      }
      const pWithCleanResult = { ...p, result: displayResult };

      const applyToMsg = (m: ChatMessage, now: number): ChatMessage => {
        let nextParts = m.parts ?? [];
        if (isStart) {
          nextParts = upsertRunningToolPart(nextParts, p.toolCallId, p.name, p.args, p.meta, now);
        } else if (isResult) {
          nextParts = updateToolPart(nextParts, p.toolCallId, p.phase, displayResult, p.meta);
        }
        let next: ChatMessage = {
          ...m,
          toolCalls: upsertToolCalls(m.toolCalls, pWithCleanResult),
          parts: nextParts,
        };
        // Promote extracted media to the parent bubble
        if (isResult && (extractedImages.length > 0 || extractedAudioUrl || extractedVideoUrl)) {
          const existingUrls = new Set((next.images ?? []).map((i) => i.url));
          const newImages = extractedImages.filter((i) => !existingUrls.has(i.url));
          next = {
            ...next,
            images: newImages.length > 0 ? [...(next.images ?? []), ...newImages] : next.images,
            audioUrl: next.audioUrl ?? extractedAudioUrl,
            videoUrl: next.videoUrl ?? extractedVideoUrl,
          };
        }
        return next;
      };

      // Attempt to attach to the best available target message.
      // updateSessionMessages is synchronous so `attached` is set before the check below.
      let attached = false;
      updateSessionMessages(sk, (prev) => {
        const mid = getStreamMid(sk);
        // Prefer the active streaming placeholder, then any streaming row, then last assistant.
        const targetId =
          (mid && prev.some((m) => m.id === mid))
            ? mid
            : prev.find((m) => m.role === 'assistant' && m.isStreaming)?.id
              ?? [...prev].reverse().find((m) => m.role === 'assistant')?.id;
        if (!targetId) return prev;
        attached = true;
        const now = Date.now();
        return prev.map((m) => m.id !== targetId ? m : applyToMsg(m, now));
      });

      // No assistant message existed at all — create a placeholder then re-attach.
      // This handles the early-race case where a tool event arrives before
      // chatAwaitingResponse / streamStart has fired.
      if (!attached) {
        ensurePlaceholder(sk);
        const newMid = getStreamMid(sk);
        if (newMid) {
          const now = Date.now();
          updateSessionMessages(sk, (prev) =>
            prev.map((m) => m.id !== newMid ? m : applyToMsg(m, now))
          );
        }
      }
    };

    const onMessage = (payload: unknown): void => {
      if (connectGenRef.current !== genAtSubscribe) {
        return;
      }
      const row = payload as Record<string, unknown> & { sessionKey?: string };
      const sk = resolveSessionKey(row.sessionKey);
      if (!sk) {
        return;
      }
      debugIngest(() => ({ hypothesisId: 'H9,H10', location: 'useChat.ts:onMessage', message: 'message event received', data: { sk, role: row.role, contentLen: typeof row.content === 'string' ? row.content.length : -1, contentPreview: typeof row.content === 'string' ? row.content.slice(0, 200) : null, streamMid: getStreamMid(sk), msgCount: (sessionCacheRef.current.get(sk) ?? []).length } }));
      clearWatchdog();
      // Cancel any pending orphan cleanup — the real chat:final has arrived
      // and the placeholder will be merged/replaced below.
      {
        const pending = orphanCleanupTimersRef.current.get(sk);
        if (pending) {
          clearTimeout(pending);
          orphanCleanupTimersRef.current.delete(sk);
        }
      }
      const rawMsg = { ...row } as Record<string, unknown>;
      delete rawMsg.sessionKey;
      const mapped = openClawMessageToChat(rawMsg as unknown as OpenClawMessage, gatewayUrl);
      const streamId = getStreamMid(sk);
      updateSessionMessages(sk, (prev) => {
        // If the ref was already cleared (e.g. streamEnd fired before chat:final),
        // scan for any remaining stream placeholder so we can still replace it.
        const effectiveStreamId =
          streamId ??
          prev.find((m) => m.role === 'assistant' && m.id.startsWith('stream-'))?.id ??
          null;
        if (effectiveStreamId && mapped.role === 'assistant') {
          // Look up the placeholder BEFORE removing it so we can preserve any
          // toolCalls and thinkingBlocks that were accumulated during the stream.
          // openClawMessageToChat does not map toolCalls, and only maps thinking
          // as a string — so anything accumulated on the placeholder would be lost
          // without this merge.
          const placeholder = prev.find((m) => m.id === effectiveStreamId);
          const withoutStream = prev.filter((m) => m.id !== effectiveStreamId);

          // Prefer accumulated thinkingBlocks (streamed, cumulative) over the
          // server's final thinking string (only available on some gateways).
          const thinkingBlocks: ChatThinkingBlock[] | undefined =
            placeholder?.thinkingBlocks && placeholder.thinkingBlocks.length > 0
              ? placeholder.thinkingBlocks
              : mapped.thinking
                ? [{ id: THINKING_ID, content: mapped.thinking, isExpanded: false }]
                : undefined;

          // Keep the placeholder id (stream-<uuid>) so FlatList's cell stays
          // mounted and FadeInUp doesn't re-fire. Store the canonical server id
          // as serverId so mergeHistoryToolCalls and future loadHistory merges
          // can resolve it correctly (F2).
          const stableId = placeholder?.id ?? mapped.id;
          const canonicalId = mapped.id;

          // openClawMessageToChat already stripped the directive from mapped.content
          // and set mapped.interactive. Trust it when mapped.content is non-empty.
          // Only fall back to parsing the accumulated placeholder content when the
          // gateway sends an empty-content chat:final (some gateway versions do this).
          let finalContent: string;
          let interactivePrompt: import('@/lib/openclaw/interactive').ClawboyOptionsPrompt | null;
          if (mapped.content) {
            finalContent = mapped.content;
            interactivePrompt = mapped.interactive ?? null;
          } else {
            const { cleanText, prompt } = extractInteractiveFromContent(placeholder?.content ?? '');
            finalContent = cleanText;
            interactivePrompt = prompt;
          }

          // Close any parts that are still open and preserve the ordered sequence.
          // Then reconcile text parts against canonical finalContent: streamed chunks
          // can diverge from the gateway's final prose (post-processing, dropped tail
          // chunk, server-side reformatting). Without reconciliation MessageBubble
          // renders parts-derived truncated text even though `content` is complete.
          const closedParts: ChatMessagePart[] | undefined =
            placeholder?.parts && placeholder.parts.length > 0
              ? closeAllParts(placeholder.parts)
              : undefined;
          const parts = closedParts
            ? reconcilePartsWithContent(closedParts, finalContent)
            : undefined;

          const merged: ChatMessage = {
            ...mapped,
            id: stableId,
            serverId: stableId !== canonicalId ? canonicalId : undefined,
            content: finalContent,
            thinkingBlocks,
            // Preserve tool calls accumulated on the placeholder during the stream.
            toolCalls: placeholder?.toolCalls,
            parts,
            // Prefer canonical final-message media; fall back to what was
            // promoted from tool results during streaming (e.g. image_generate).
            images: mapped.images ?? placeholder?.images,
            audioUrl: mapped.audioUrl ?? placeholder?.audioUrl,
            videoUrl: mapped.videoUrl ?? placeholder?.videoUrl,
            files: mapped.files ?? placeholder?.files,
            audioAsVoice: mapped.audioAsVoice ?? placeholder?.audioAsVoice,
            guessedMedia: mapped.guessedMedia ?? placeholder?.guessedMedia,
            isStreaming: false,
            interactive: interactivePrompt ?? undefined,
          };
          return [...withoutStream, merged];
        }
        const exists = prev.some((m) => m.id === mapped.id);
        // openClawMessageToChat already stripped the directive and set interactive.
        const finalMapped: ChatMessage = {
          ...mapped,
          isStreaming: false,
        };
        if (exists) {
          return prev.map((m) => (m.id === mapped.id ? finalMapped : m));
        }
        return [...prev, finalMapped];
      });
      clearStreamMid(sk);
      setActivity(sk, null);
      requestRefreshSessions();
    };

    const onStreamEnd = (payload: unknown): void => {
      if (connectGenRef.current !== genAtSubscribe) {
        return;
      }
      const p = payload as { sessionKey?: string; streamId?: string };
      const sk = resolveSessionKey(p.sessionKey);
      // Drop the streamId↔mid binding so the map doesn't grow without bound.
      // Safe to do unconditionally — late streamInterrupted for a finished
      // stream should not flip the (already-finalized) bubble.
      if (p.streamId) {
        streamIdToMidRef.current.delete(p.streamId);
      }
      debugIngest(() => ({ hypothesisId: 'H6', location: 'useChat.ts:onStreamEnd', message: 'streamEnd fired', data: { sk, streamMid: sk ? getStreamMid(sk) : null, msgCount: sk ? (sessionCacheRef.current.get(sk) ?? []).length : -1 } }));
      clearWatchdog();
      // Flush any buffered chunk batch before closing parts.
      if (sk && pendingBatchRef.current.has(sk)) {
        flushSessionBatch(sk);
        if (pendingBatchRef.current.size === 0 && chunkRafRef.current !== null) {
          cancelAnimationFrame(chunkRafRef.current);
          chunkRafRef.current = null;
        }
      }
      if (sk) streamingPhaseRef.current.delete(sk);
      if (sk) setThinkingPart(sk, null);
      if (sk) {
        const mid = getStreamMid(sk);
        updateSessionMessages(sk, (prev) =>
          prev.map((m) => {
            if (m.id !== mid) return m;
            return {
              ...m,
              isStreaming: false,
              parts: m.parts ? closeAllParts(m.parts) : m.parts,
            };
          })
        );
        // Schedule orphan cleanup: if chat:final never arrives for this
        // placeholder (e.g. post-reset metadata labels from the gateway),
        // remove it from the cache so it doesn't render or persist to disk.
        // onMessage cancels this timer when the real chat:final arrives.
        const existing = orphanCleanupTimersRef.current.get(sk);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          orphanCleanupTimersRef.current.delete(sk);
          updateSessionMessages(sk, (prev) => {
            const target = prev.find((m) => m.id === mid);
            const willRemove = !!target && !target.isStreaming && target.id.startsWith('stream-');
            debugIngest(() => ({ hypothesisId: 'H11', location: 'useChat.ts:orphanCleanup', message: willRemove ? 'orphan cleanup REMOVING placeholder' : 'orphan cleanup no-op (already replaced)', data: { sk, mid, willRemove, targetExists: !!target, targetIsStreaming: target?.isStreaming, targetContentLen: target?.content?.length ?? -1, targetContentPreview: target?.content?.slice(0, 200) ?? null, targetHasParts: (target?.parts?.length ?? 0) > 0, targetHasThinking: (target?.thinkingBlocks?.length ?? 0) > 0 } }));
            return prev.filter((m) => !(m.id === mid && !m.isStreaming && m.id.startsWith('stream-')));
          });
        }, 1500);
        orphanCleanupTimersRef.current.set(sk, timer);
      }
      // Do NOT clear streamMessageIdRef here. When the agent stream path is
      // used, streamEnd fires (agent:lifecycle end) BEFORE chat:final arrives,
      // so onMessage still needs the ref to swap out the placeholder. The ref
      // is cleared by onMessage, sendMessage, abortResponse, or disconnect.
      // Clear streaming/awaiting activity; onMessage clears it again after chat:final.
      if (sk) {
        const curr = activityBySessionRef.current[sk];
        if (curr?.reason === 'streaming' || curr?.reason === 'awaiting') {
          setActivity(sk, null);
        }
      }
      // Backstop: request a session list refresh so the preview is updated even
      // when chat:final never arrives (or arrives late). The debounce coalesces
      // this with the onMessage call in the normal code path.
      requestRefreshSessions();
    };

    const onStreamInterrupted = (payload: unknown): void => {
      if (connectGenRef.current !== genAtSubscribe) {
        return;
      }
      const p = payload as { sessionKey?: string; streamId?: string; cause?: string };
      const sk = resolveSessionKey(p.sessionKey);
      debugIngest(() => ({ hypothesisId: 'H1,H3,H5', location: 'useChat.ts:onStreamInterrupted', message: 'streamInterrupted handler invoked', data: { sk, streamId: p.streamId, cause: p.cause, streamMid: sk ? getStreamMid(sk) : null } }));
      if (!sk) {
        return;
      }

      // Resolve the exact bubble bound to this stream id. If there is no
      // binding, the stream never produced a placeholder (side-channel sub-
      // agent / empty agent run with no chatAwaitingResponse propagation) —
      // do NOT clobber other streaming assistant messages in this session.
      const targetMid = p.streamId
        ? streamIdToMidRef.current.get(p.streamId)
        : null;
      if (!targetMid) {
        debugIngest(() => ({ hypothesisId: 'H1,H3,H5', location: 'useChat.ts:onStreamInterrupted:noBinding', message: 'no streamId binding — ignoring interrupt to avoid clobbering unrelated bubbles', data: { sk, streamId: p.streamId } }));
        return;
      }

      clearWatchdog();
      // Flush any buffered chunk batch before closing parts.
      if (pendingBatchRef.current.has(sk)) {
        flushSessionBatch(sk);
        if (pendingBatchRef.current.size === 0 && chunkRafRef.current !== null) {
          cancelAnimationFrame(chunkRafRef.current);
          chunkRafRef.current = null;
        }
      }

      const isSocketClose = p.cause === 'socket-close';

      updateSessionMessages(sk, (prev) => {
        const lastUserMsg = [...prev].reverse().find((m) => m.role === 'user');
        return prev.map((m) => {
          if (m.id !== targetMid) return m;
          return {
            ...m,
            isStreaming: false,
            // For socket-close, defer the retry pill — the server may still complete the turn.
            // The reconcile after reconnect will deliver the real message, or the timer below
            // will flip this to interrupted after 12s.
            interrupted: !isSocketClose,
            retryFromMessageId: lastUserMsg?.id,
            parts: m.parts ? closeAllParts(m.parts) : m.parts,
          };
        });
      });

      // Only clear refs/streaming state if the interrupted stream is the one we
      // were actively tracking. A side-stream interrupt must not clear an unrelated
      // session's mid ref.
      if (getStreamMid(sk) === targetMid) {
        streamingPhaseRef.current.delete(sk);
        setThinkingPart(sk, null);
        clearStreamMid(sk);
      }

      if (isSocketClose) {
        // Show reconnecting activity. A reconcile after reconnect will deliver the
        // completed response (clearing this activity) or the 12s timer below
        // falls back to the normal retry pill.
        setActivity(sk, {
          reason: 'reconnecting-stream-pending',
          label: t('chat.activity.reconnectingStream'),
          since: Date.now(),
        });
        const existingPending = socketClosePendingRef.current.get(sk);
        if (existingPending) clearTimeout(existingPending.timerId);
        const timerId = setTimeout(() => {
          socketClosePendingRef.current.delete(sk);
          // Flip to interrupted+retry if reconcile hasn't resolved it yet.
          updateSessionMessages(sk, (prev) => prev.map((m) => {
            if (m.id !== targetMid || m.interrupted) return m;
            return { ...m, interrupted: true };
          }));
          const curr = activityBySessionRef.current[sk];
          if (curr?.reason === 'reconnecting-stream-pending') setActivity(sk, null);
        }, 12000);
        socketClosePendingRef.current.set(sk, { mid: targetMid, timerId });
      } else {
        setActivity(sk, null);
      }

      if (p.streamId) {
        streamIdToMidRef.current.delete(p.streamId);
      }
      // Immediately persist so the interrupted bubble survives the next cold start.
      flushSessionToDisk(sk);
    };

    const onCompaction = (payload: unknown): void => {
      if (connectGenRef.current !== genAtSubscribe) {
        return;
      }
      const p = payload as { phase?: string; sessionKey?: string };
      const sk = resolveSessionKey(p.sessionKey);
      if (!sk) {
        return;
      }
      if (p.phase === 'start') {
        setActivity(sk, { reason: 'compacting', label: t('chat.activity.compacting'), since: Date.now() });
      } else if (p.phase === 'end') {
        const curr = activityBySessionRef.current[sk];
        if (curr?.reason === 'compacting') {
          setActivity(sk, null);
        }
        // Compaction summarizes the working memory and may evict the original
        // primer message. Re-prime on the next send so the agent doesn't lose
        // the convention mid-conversation when running in fallback mode.
        const set = primedSessionsRef.current;
        for (const k of set) {
          if (k.endsWith(`:${sk}`)) set.delete(k);
        }
      }
    };

    const onAgentStatus = (payload: unknown): void => {
      if (connectGenRef.current !== genAtSubscribe) {
        return;
      }
      // Be defensive: the presence payload shape may vary across gateway versions.
      const p = payload as { sessionKey?: string; status?: string; busy?: boolean; label?: string };
      const sk = resolveSessionKey(p.sessionKey);
      if (!sk) {
        return;
      }
      const isBusy =
        p.busy === true ||
        p.status === 'busy' ||
        p.status === 'working' ||
        p.status === 'running';
      if (isBusy) {
        // agentBusy is presence-sourced — never let it clobber a locally-initiated
        // activity (streaming/awaiting/resetting/compacting). Only set when idle
        // or already in agentBusy.
        const curr = activityBySessionRef.current[sk];
        if (curr == null || curr.reason === 'agentBusy') {
          setActivity(sk, {
            reason: 'agentBusy',
            label: typeof p.label === 'string' ? p.label : t('chat.activity.working'),
            since: Date.now(),
          });
        }
      } else {
        // Only clear agentBusy; don't override streaming/compacting activity.
        const curr = activityBySessionRef.current[sk];
        if (curr?.reason === 'agentBusy') {
          setActivity(sk, null);
        }
      }
    };

    const onChatStatus = (_payload: unknown): void => {
      if (connectGenRef.current !== genAtSubscribe) {
        return;
      }
    };

    // Handle committed transcript messages pushed by sessions.messages.subscribe.
    // The gateway sends these when a message is finalized in the transcript,
    // same normalization as chat.history. We merge them into the cache so
    // reconnect reconcile works without a full chat.history call in most cases.
    const onSessionMessage = (payload: unknown): void => {
      if (connectGenRef.current !== genAtSubscribe) return;
      const p = payload as { sessionKey?: string; message?: unknown };
      if (!p?.message) return;
      const sk = resolveSessionKey(p.sessionKey);
      if (!sk) return;

      const gatewayUrl = oc.getGatewayUrl();
      const rawMsg = p.message as OpenClawMessage;
      if (!rawMsg?.role || !rawMsg?.id) return;
      const chatMsg = openClawMessageToChat(rawMsg, gatewayUrl);
      if (!chatMsg) return;

      updateSessionMessages(sk, (prev) => {
        // Deduplicate by message id — the same message may arrive via chat:final
        // AND session.message. Keep whichever is already in cache.
        if (prev.some((m) => m.id === chatMsg.id)) return prev;
        // For assistant messages arriving via subscribe: if there's a
        // reconnecting-stream-pending placeholder, remove it (the real response arrived).
        const pending = socketClosePendingRef.current.get(sk);
        if (pending && chatMsg.role === 'assistant') {
          clearTimeout(pending.timerId);
          socketClosePendingRef.current.delete(sk);
          const curr = activityBySessionRef.current[sk];
          if (curr?.reason === 'reconnecting-stream-pending') setActivity(sk, null);
          return [...prev.filter((m) => m.id !== pending.mid), chatMsg];
        }
        return [...prev, chatMsg];
      });

      requestRefreshSessions();
    };

    oc.on('chatAwaitingResponse', onAwaitingResponse);
    oc.on('streamStart', onStreamStart);
    oc.on('streamChunk', onStreamChunk);
    oc.on('thinkingChunk', onThinkingChunk);
    oc.on('toolCall', onToolCall);
    oc.on('message', onMessage);
    oc.on('streamEnd', onStreamEnd);
    oc.on('streamInterrupted', onStreamInterrupted);
    oc.on('compaction', onCompaction);
    oc.on('agentStatus', onAgentStatus);
    oc.on('chatStatus', onChatStatus);
    oc.on('sessionMessage', onSessionMessage);

    return () => {
      oc.off('chatAwaitingResponse', onAwaitingResponse);
      oc.off('streamStart', onStreamStart);
      oc.off('streamChunk', onStreamChunk);
      oc.off('thinkingChunk', onThinkingChunk);
      oc.off('toolCall', onToolCall);
      oc.off('message', onMessage);
      oc.off('streamEnd', onStreamEnd);
      oc.off('streamInterrupted', onStreamInterrupted);
      oc.off('compaction', onCompaction);
      oc.off('agentStatus', onAgentStatus);
      oc.off('chatStatus', onChatStatus);
      oc.off('sessionMessage', onSessionMessage);
      clearWatchdog();
      cancelChunkRaf();
    };
  }, [
    client,
    connectionState.status,
    connectGeneration,
    updateSessionMessages,
    appendWatchdogTimeout,
    clearWatchdog,
    cancelChunkRaf,
    flushSessionToDisk,
    setActivity,
    requestRefreshSessions,
  ]);

  const sendMessage = useCallback(
    (text: string, attachments?: InputAttachment[], onAbort?: () => void): void => {
      void (async () => {
        const c = client.current;
        if (!c || connectionState.status !== 'connected') {
          return;
        }

        const trimmed = text.trim();
        const att = attachments ?? [];
        if (!trimmed && att.length === 0) {
          return;
        }

        // If there's no active session, create one for the current agent so the
        // first message goes to the correct agent key (e.g. agent:jerry:<uuid>).
        let sk = currentSessionKeyRef.current;
        if (!sk) {
          sk = await createSession(currentAgent?.id);
        }

        c.setPrimarySessionKey(sk);

        // ---------------------------------------------------------------------------
        // Audio capability gating — transcribe voice notes for models that don't
        // accept native audio input (Claude, DeepSeek, Llama, etc.).
        // ---------------------------------------------------------------------------
        const nonAudioAtts = att.filter((a) => a.type !== 'audio');
        const hasOtherContent = trimmed.length > 0 || nonAudioAtts.length > 0;
        // Tracks whether a cancel should restore the caller's draft. Flipped to
        // false only when the user explicitly chooses "Discard recording".
        let shouldRestoreDraft = true;

        const policyResult = await applyAudioCapabilityPolicy(att, currentModel, {
          onTranscriptionError: (_a, err: TranscriptionError) => {
            const reason =
              err.code === 'permission_denied'
                ? t('chat.voice.reasonPermission')
                : err.code === 'unavailable'
                  ? t('chat.voice.reasonUnavailable')
                  : err.code === 'empty_result'
                    ? t('chat.voice.reasonEmpty')
                    : err.code === 'timeout'
                      ? t('chat.voice.reasonTimeout')
                      : t('chat.voice.reasonFailed');
            const modelLabel = currentModel?.name ?? currentModel?.id ?? t('chat.voice.thisModel');
            return new Promise<boolean>((resolve) => {
              if (hasOtherContent) {
                Alert.alert(
                  t('chat.voice.title'),
                  t('chat.voice.errorWithContentBody', { reason, model: modelLabel }),
                  [
                    { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
                    { text: t('chat.voice.sendWithoutVoice'), onPress: () => resolve(true) },
                  ],
                );
              } else {
                Alert.alert(
                  t('chat.voice.title'),
                  t('chat.voice.errorNoContentBody', { reason, model: modelLabel }),
                  [
                    { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
                    {
                      text: t('chat.voice.discardRecording'),
                      style: 'destructive',
                      onPress: () => {
                        shouldRestoreDraft = false;
                        resolve(false);
                      },
                    },
                  ],
                );
              }
            });
          },
        });

        if (policyResult === null) {
          if (shouldRestoreDraft) onAbort?.();
          return;
        }

        const { attachmentsForGateway: attsForGateway, voiceTranscript } = policyResult;

        let gatewayAttachments: Awaited<ReturnType<typeof prepareChatAttachmentsFromInput>> | undefined;
        try {
          gatewayAttachments =
            attsForGateway.length > 0
              ? await prepareChatAttachmentsFromInput(
                  attsForGateway.map((a) => ({
                    id: a.id,
                    name: a.name,
                    type: a.type,
                    uri: a.uri,
                    mimeType: a.mimeType,
                  })),
                )
              : undefined;
        } catch (err) {
          const msg = translateClawError(err, 'chat.attachments.prepareFailFallback');
          Alert.alert(t('chat.attachments.title'), msg);
          return;
        }

        const images: MessageImage[] = [];
        const attachedFiles: NonNullable<ChatMessage['attachedFiles']> = [];
        let audioUrl: string | undefined;
        for (const a of att) {
          if (a.type === 'image' && (a.preview ?? a.uri)) {
            images.push({
              url: a.preview ?? a.uri,
              mimeType: a.mimeType,
              alt: a.name,
            });
          } else if (a.type === 'audio') {
            // Always keep the first audio URI for the local playback bubble,
            // even when the gateway payload had it stripped out for transcription.
            if (!audioUrl && (a.preview ?? a.uri)) {
              audioUrl = a.preview ?? a.uri;
            } else {
              attachedFiles.push({ name: a.name, mimeType: a.mimeType ?? 'audio/*' });
            }
          } else if (a.type === 'video' || a.type === 'file') {
            attachedFiles.push({ name: a.name, mimeType: a.mimeType });
          }
        }

        const contentForUi = stripClawboyDirectivesForRender(trimmed) || (att.length > 0 ? ' ' : '');
        // When voice notes were transcribed, prefix the transcript so the model
        // has clear context that this was spoken input.
        const baseContentForGateway = voiceTranscript
          ? [trimmed, `[Voice note transcription]\n${voiceTranscript}`].filter(Boolean).join('\n\n')
          : trimmed || (att.length > 0 ? ' ' : '');

        // ClawBoy convention auto-injection.
        // 1) On first interaction with an agent, kick off lazy AGENTS.md install
        //    when the global mode is 'auto'. This call is debounced/deduped per
        //    agent inside the convention-install context.
        // 2) If the agent is in fallback mode (declined / install failed /
        //    global mode 'off'), prepend a hidden HTML-comment primer to the
        //    first message of each session. Other markdown clients ignore the
        //    comment; the OpenClaw agent reads it as part of the user message.
        const profileId = activeProfile?.id;
        const agentId = currentAgent?.id;
        let resolvedStatus: ReturnType<typeof getConventionStatus> | null = null;
        if (profileId && agentId) {
          // Fire-and-forget — the resolveOnFirstInteraction call may install
          // AGENTS.md asynchronously. We read whatever status is already
          // committed at this moment (no awaiting on the network so the user's
          // first send doesn't stall behind the install RPC). Fallback path
          // covers the case where the install hasn't completed yet.
          void resolveOnFirstInteraction(profileId, agentId);
          resolvedStatus = getConventionStatus(profileId, agentId);
        }

        const primerKey = profileId && agentId ? `${profileId}:${agentId}:${sk}` : null;
        const shouldInjectPrimer =
          primerKey !== null &&
          resolvedStatus !== null &&
          resolvedStatus.kind === 'fallback' &&
          conventionGlobalMode !== 'off' &&
          !primedSessionsRef.current.has(primerKey);

        const contentForGateway = shouldInjectPrimer
          ? `${buildClientContextDirective()}\n\n${baseContentForGateway}`
          : baseContentForGateway;
        if (shouldInjectPrimer && primerKey) {
          primedSessionsRef.current.add(primerKey);
        }

        const userMsg: ChatMessage = {
          id: generateUUID(),
          role: 'user',
          content: contentForUi,
          timestamp: new Date().toISOString(),
          images: images.length > 0 ? images : undefined,
          attachedFiles: attachedFiles.length > 0 ? attachedFiles : undefined,
          audioUrl,
        };
        debugIngest(() => ({ hypothesisId: 'H4', location: 'useChat.ts:sendMessage', message: 'sendMessage about to chat.send', data: { sk, contentLen: contentForGateway.length, userMsgId: userMsg.id, priorMsgCount: (sessionCacheRef.current.get(sk) ?? []).length } }));
        updateSessionMessages(sk, (prev) => [...prev, userMsg]);
        streamMessageIdRef.current.delete(sk);
        // Flush immediately so the user message survives an app kill during streaming.
        flushSessionToDisk(sk);

        // Lazy sessions only materialize on the gateway on the first chat.send.
        // sessions.changed is not reliable for new sessions, so we track whether
        // this key was unknown to the server before the send and force a refresh.
        const wasUnlistedBeforeSend = !sessionsRef.current.some((s) => s.key === sk);

        // Probe liveness before high-risk sends: half-open sockets accept writes
        // silently. Skip probe only when server activity is <5s old.
        const msSinceActivity = Date.now() - (c.lastActivityAt ?? 0);
        if (msSinceActivity > 5000) {
          // Show awaiting activity during probe so the user sees a response
          // rather than a silent freeze on slow/dead networks.
          beginActivity(sk, 'awaiting');
          // 5s timeout — aggressive enough to catch dead sockets while tolerating
          // slow-but-live cellular connections (3s was too tight).
          const alive = await c.probeNow(5000);
          if (!alive) {
            endActivity(sk);
            // Dead socket — remove the optimistic user bubble, show send-failed row.
            updateSessionMessages(sk, (prev) => [
              ...prev.filter((m) => m.id !== userMsg.id),
              {
                id: `probe-fail-${Date.now()}`,
                role: 'system' as const,
                content: t('chat.system.sendFailed'),
                timestamp: new Date().toISOString(),
              },
            ]);
            return;
          }
          // Probe succeeded — clear the manual awaiting state; chatAwaitingResponse
          // from the gateway will re-set it once the send RPC resolves.
          endActivity(sk);
        }

        try {
          const modelId = (currentModel?.id ?? '').toLowerCase();
          // Experimental: DeepSeek/R1 runs often omit explicit reasoning unless a
          // stronger thinking level is requested. Keep this scoped to those models.
          const thinkingLevel =
            modelId.includes('deepseek') || modelId.includes('r1')
              ? 'high'
              : undefined;
          await c.sendMessage({
            sessionId: sk,
            content: contentForGateway,
            agentId: currentAgent?.id,
            thinking: true,
            thinkingLevel,
            attachments: gatewayAttachments,
          });
          debugIngest(() => ({ hypothesisId: 'H7', location: 'useChat.ts:sendMessage:rpcOk', message: 'chat.send RPC resolved ok', data: { sk, streamMid: streamMessageIdRef.current.get(sk) ?? null } }));
          // Badge event: message sent
          {
            const now = new Date();
            const sessionMsgs = sessionCacheRef.current.get(sk) ?? [];
            const hasVoice = att.some((a) => a.type === 'audio');
            const sessionInfo = sessions.find((s) => s.key === sk);
            const totalTokens = sessionInfo?.totalTokens;
            const contextWindow = sessionInfo?.contextTokens;
            const leanRatio =
              totalTokens !== undefined && contextWindow !== undefined && contextWindow > 0
                ? totalTokens / contextWindow
                : null;
            emitMessageSent({
              localHour: now.getHours(),
              localMinute: now.getMinutes(),
              localDateKey: formatLocalDateKey(now),
              modelId: currentModel?.id ?? null,
              sessionMessageCount: sessionMsgs.length + 1,
              attachmentCount: att.length,
              hasVoiceAttachment: hasVoice,
              leanRatio,
            });
          }
          if (wasUnlistedBeforeSend) {
            void refreshSessions();
          }
        } catch (sendErr) {
          debugIngest(() => ({ hypothesisId: 'H7', location: 'useChat.ts:sendMessage:rpcError', message: 'chat.send RPC rejected', data: { sk, errMsg: sendErr instanceof Error ? sendErr.message : String(sendErr), streamMid: streamMessageIdRef.current.get(sk) ?? null } }));
          // Remove any orphan typing placeholder that chatAwaitingResponse may
          // have created before the send error was returned.
          const orphanId = streamMessageIdRef.current.get(sk) ?? null;
          streamMessageIdRef.current.delete(sk);
          endActivity(sk);
          updateSessionMessages(sk, (prev) => {
            const withoutOrphan = orphanId
              ? prev.filter((m) => m.id !== orphanId)
              : prev;
            return [
              ...withoutOrphan,
              {
                id: `send-err-${Date.now()}`,
                role: 'system',
                content: t('chat.system.sendFailed'),
                timestamp: new Date().toISOString(),
              },
            ];
          });
        }
      })();
    },
    [
      client,
      connectionState.status,
      currentAgent?.id,
      currentModel,
      createSession,
      refreshSessions,
      updateSessionMessages,
      flushSessionToDisk,
    ]
  );

  const abortResponse = useCallback((): void => {
    const c = client.current;
    const sk = currentSessionKeyRef.current;
    if (!c || !sk || connectionState.status !== 'connected') {
      return;
    }

    clearWatchdog();
    // Cancel only this session's pending batch; preserve other sessions' batches.
    pendingBatchRef.current.delete(sk);
    if (pendingBatchRef.current.size === 0 && chunkRafRef.current !== null) {
      cancelAnimationFrame(chunkRafRef.current);
      chunkRafRef.current = null;
    }
    streamingPhaseRef.current.delete(sk);
    currentThinkingPartRef.current.set(sk, null);

    const mid = streamMessageIdRef.current.get(sk) ?? null;
    updateSessionMessages(sk, (prev) => {
      const lastUserMsg = [...prev].reverse().find((m) => m.role === 'user');
      return prev.map((m) => {
        if (m.id === mid || (m.role === 'assistant' && m.isStreaming)) {
          return {
            ...m,
            isStreaming: false,
            interrupted: true,
            retryFromMessageId: lastUserMsg?.id,
            parts: m.parts ? closeAllParts(m.parts) : m.parts,
          };
        }
        return m;
      });
    });
    streamMessageIdRef.current.delete(sk);
    setActivity(sk, null);
    flushSessionToDisk(sk);

    // Badge event: stop generation
    emitAbortGen();

    // Fire-and-forget abort RPC. Errors are non-fatal — the optimistic UI
    // already reflects user intent.
    void c.abortChat(sk).catch(() => {});
  }, [client, connectionState.status, clearWatchdog, updateSessionMessages, setActivity, flushSessionToDisk]);

  /**
   * Re-sends the user message that triggered an interrupted assistant turn.
   * Removes the interrupted bubble, then fires sendMessage with the original text.
   */
  const retryMessage = useCallback(
    (assistantMessageId: string): void => {
      const sk = currentSessionKeyRef.current;
      if (!sk) {
        return;
      }
      let retryText: string | null = null;
      updateSessionMessages(sk, (prev) => {
        const assistantMsg = prev.find((m) => m.id === assistantMessageId);
        if (!assistantMsg?.retryFromMessageId) {
          return prev;
        }
        const userMsg = prev.find((m) => m.id === assistantMsg.retryFromMessageId);
        if (!userMsg) {
          return prev;
        }
        retryText = userMsg.content;
        // Remove the interrupted assistant bubble; keep the user message so
        // chat.history reconciliation can drop the duplicate later.
        return prev.filter((m) => m.id !== assistantMessageId);
      });
      debugIngest(() => ({ hypothesisId: 'H4', location: 'useChat.ts:retryMessage', message: 'retryMessage invoked', data: { assistantMessageId, sk, retryTextLen: retryText ? (retryText as string).length : 0, willResend: !!retryText } }));
      if (retryText) {
        const c = client.current;
        const content = retryText as string;
        if (c && connectionState.status === 'connected') {
          // sessions.steer atomically aborts any in-flight server-side run then
          // sends the new content. This eliminates the race from a fire-and-forget
          // abort + immediate send (both could execute concurrently on the server).
          // If the gateway doesn't support steer (older version), fall back to
          // serialized abort-then-send via sendMessage.
          const modelId = (currentModel?.id ?? '').toLowerCase();
          const thinkingLevel =
            modelId.includes('deepseek') || modelId.includes('r1') ? 'high' : undefined;
          void c.steerSession({
            sessionId: sk,
            content,
            thinking: true,
            thinkingLevel,
          }).then(() => {
            requestRefreshSessions();
          }).catch(() => {
            void c.abortChat(sk).catch(() => {}).finally(() => sendMessage(content));
          });
        } else {
          sendMessage(content);
        }
      }
    },
    [updateSessionMessages, sendMessage, client, connectionState.status, currentModel, requestRefreshSessions]
  );

  /**
   * Clear local chat display for a session (UI-only, does not touch server history).
   * Mirrors OpenClaw's /clear command semantics.
   */
  const clearMessages = useCallback(
    (sessionKey: string): void => {
      replaceSessionMessages(sessionKey, []);
      // Drop primer markers for this session so the next user send re-injects
      // the convention primer. Reset wipes the agent's working memory of the
      // convention along with the rest of the conversation context.
      const set = primedSessionsRef.current;
      for (const k of set) {
        if (k.endsWith(`:${sessionKey}`)) set.delete(k);
      }
    },
    [replaceSessionMessages]
  );

  /**
   * Append a single message to a session's local cache (e.g. an info marker after reset).
   * Does not send anything to the server.
   */
  const appendMessage = useCallback(
    (sessionKey: string, message: ChatMessage): void => {
      updateSessionMessages(sessionKey, (prev) => [...prev, message]);
    },
    [updateSessionMessages]
  );

  /**
   * Remove a single message from a session's local cache by id.
   * Used to clean up info markers when an operation fails (e.g. a failed /reset).
   */
  const removeMessage = useCallback(
    (sessionKey: string, id: string): void => {
      updateSessionMessages(sessionKey, (prev) => prev.filter((m) => m.id !== id));
    },
    [updateSessionMessages]
  );

  return {
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
  };
}
