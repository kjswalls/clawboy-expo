import { useCallback, useEffect, useRef, useState } from 'react';
import type { HistoryToolCall } from '@/lib/openclaw/chat';
import type { Message as OpenClawMessage } from '@/lib/openclaw/types';
import { generateUUID } from '@/lib/openclaw/utils';
import { useConnection } from '@/contexts/ConnectionContext';
import { useAgents } from '@/hooks/useAgents';
import { useSessions } from '@/hooks/useSessions';
import type { ChatMessage, ChatThinkingBlock, ChatToolCall } from '@/types';
import { openClawMessageToChat } from '@/types';

const SESSION_CACHE_MAX = 50;
const RESPONSE_WATCHDOG_MS = 120_000;
const THINKING_ID = 'thinking-stream';

function evictOldestSessionCaches(map: Map<string, ChatMessage[]>): void {
  while (map.size > SESSION_CACHE_MAX) {
    const first = map.keys().next().value;
    if (first === undefined) {
      break;
    }
    map.delete(first);
  }
}

function mergeHistoryToolCalls(messages: ChatMessage[], toolCalls: HistoryToolCall[]): ChatMessage[] {
  const msgs = messages.map((m) => ({
    ...m,
    toolCalls: m.toolCalls ? m.toolCalls.map((t) => ({ ...t })) : undefined,
  }));
  for (const tc of toolCalls) {
    const anchor = tc.afterMessageId;
    if (!anchor) {
      continue;
    }
    const msg = msgs.find((m) => m.id === anchor);
    if (!msg || msg.role !== 'assistant') {
      continue;
    }
    if (!msg.toolCalls) {
      msg.toolCalls = [];
    }
    msg.toolCalls.push({
      id: tc.toolCallId,
      name: tc.name,
      status: 'completed',
      result: tc.result,
      args: tc.args,
    });
  }
  return msgs;
}

function upsertThinkingBlocks(
  blocks: ChatThinkingBlock[] | undefined,
  text: string,
  cumulative: boolean
): ChatThinkingBlock[] {
  const prev = blocks ?? [];
  const existing = prev.find((b) => b.id === THINKING_ID);
  if (!existing) {
    return [...prev, { id: THINKING_ID, content: text, isExpanded: false }];
  }
  return prev.map((b) =>
    b.id === THINKING_ID
      ? {
          ...b,
          content: cumulative ? text : `${b.content}${text}`,
        }
      : b
  );
}

function upsertToolCalls(
  list: ChatToolCall[] | undefined,
  payload: {
    toolCallId: string;
    name: string;
    phase: string;
    result?: string;
    args?: Record<string, unknown>;
    meta?: string;
  }
): ChatToolCall[] {
  const arr = list ? [...list] : [];
  const id = payload.toolCallId;
  const idx = arr.findIndex((t) => t.id === id);
  const phase = payload.phase;
  const nextStatus: ChatToolCall['status'] =
    phase === 'result' || phase === 'error' ? 'completed' : 'running';
  const entry: ChatToolCall = {
    id,
    name: payload.name,
    status: phase === 'error' ? 'error' : nextStatus,
    args: phase === 'start' ? payload.args : arr[idx]?.args ?? payload.args,
    result: payload.result ?? arr[idx]?.result,
    meta: payload.meta ?? arr[idx]?.meta,
  };
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], ...entry };
  } else {
    arr.push({ ...entry, status: phase === 'start' ? 'running' : entry.status });
  }
  return arr;
}

export interface UseChatResult {
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (text: string, sessionKey?: string) => void;
  abortResponse: () => void;
  loadHistory: (sessionKey: string) => Promise<void>;
}

export function useChat(): UseChatResult {
  const { client, connectionState, connectGeneration } = useConnection();
  const { currentSessionKey, setCurrentSession } = useSessions();
  const { currentAgent } = useAgents();

  const sessionCacheRef = useRef<Map<string, ChatMessage[]>>(new Map());
  const streamMessageIdRef = useRef<string | null>(null);
  const currentSessionKeyRef = useRef<string | null>(currentSessionKey);
  currentSessionKeyRef.current = currentSessionKey;

  const connectGenRef = useRef(connectGeneration);
  connectGenRef.current = connectGeneration;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWatchdog = useCallback((): void => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const cloneSessionMessages = useCallback((sk: string): ChatMessage[] => {
    const list = sessionCacheRef.current.get(sk);
    if (!list) {
      return [];
    }
    return list.map((m) => ({
      ...m,
      toolCalls: m.toolCalls?.map((t) => ({ ...t })),
      thinkingBlocks: m.thinkingBlocks?.map((b) => ({ ...b })),
      images: m.images?.map((img) => ({ ...img })),
    }));
  }, []);

  const replaceSessionMessages = useCallback(
    (sk: string, next: ChatMessage[]): void => {
      sessionCacheRef.current.set(sk, next);
      evictOldestSessionCaches(sessionCacheRef.current);
      if (sk === currentSessionKeyRef.current) {
        setMessages(cloneSessionMessages(sk));
      }
    },
    [cloneSessionMessages]
  );

  const updateSessionMessages = useCallback(
    (sk: string, updater: (prev: ChatMessage[]) => ChatMessage[]): void => {
      const prev = sessionCacheRef.current.get(sk) ?? [];
      const next = updater(prev);
      replaceSessionMessages(sk, next);
    },
    [replaceSessionMessages]
  );

  useEffect(() => {
    const sk = currentSessionKey;
    if (!sk) {
      setMessages([]);
      return;
    }
    // Show whatever is already cached immediately.
    setMessages(cloneSessionMessages(sk));
    // If the cache is empty and we're connected, fetch history from the server.
    if (!sessionCacheRef.current.has(sk) && connectionState.status === 'connected') {
      void loadHistory(sk);
    }
  }, [currentSessionKey, cloneSessionMessages, connectionState.status, loadHistory]);

  useEffect(() => {
    if (connectionState.status !== 'connected') {
      streamMessageIdRef.current = null;
      setIsStreaming(false);
      clearWatchdog();
    }
  }, [connectionState.status, clearWatchdog]);

  const loadHistory = useCallback(
    async (sessionKey: string): Promise<void> => {
      const c = client.current;
      if (!c || connectionState.status !== 'connected') {
        return;
      }
      const { messages: raw, toolCalls } = await c.getSessionMessages(sessionKey);
      let chatMsgs = raw.map(openClawMessageToChat);
      chatMsgs = mergeHistoryToolCalls(chatMsgs, toolCalls);
      replaceSessionMessages(sessionKey, chatMsgs);
    },
    [client, connectionState.status, replaceSessionMessages]
  );

  const appendWatchdogTimeout = useCallback(
    (sk: string): void => {
      updateSessionMessages(sk, (prev) => [
        ...prev,
        {
          id: `timeout-${Date.now()}`,
          role: 'system',
          content: 'The assistant took too long to respond. Try again or check the gateway.',
          timestamp: new Date().toISOString(),
        },
      ]);
      setIsStreaming(false);
      streamMessageIdRef.current = null;
    },
    [updateSessionMessages]
  );

  useEffect(() => {
    const oc = client.current;
    if (!oc || connectionState.status !== 'connected') {
      return;
    }

    const genAtSubscribe = connectGenRef.current;

    const resolveSessionKey = (k: unknown): string | null => {
      if (typeof k === 'string' && k.length > 0) {
        return k;
      }
      return currentSessionKeyRef.current;
    };

    const onStreamStart = (payload: unknown): void => {
      if (connectGenRef.current !== genAtSubscribe) {
        return;
      }
      const p = payload as { sessionKey?: string };
      const sk = resolveSessionKey(p.sessionKey);
      if (!sk) {
        return;
      }
      setIsStreaming(true);
      const mid = `stream-${generateUUID()}`;
      streamMessageIdRef.current = mid;
      updateSessionMessages(sk, (prev) => [
        ...prev,
        {
          id: mid,
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
          isStreaming: true,
        },
      ]);
      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        appendWatchdogTimeout(sk);
      }, RESPONSE_WATCHDOG_MS);
    };

    const onStreamChunk = (payload: unknown): void => {
      if (connectGenRef.current !== genAtSubscribe) {
        return;
      }
      const p = payload as { text?: string; sessionKey?: string };
      const sk = resolveSessionKey(p.sessionKey);
      const text = typeof p.text === 'string' ? p.text : '';
      if (!sk || !text) {
        return;
      }
      const mid = streamMessageIdRef.current;
      if (!mid) {
        return;
      }
      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        appendWatchdogTimeout(sk);
      }, RESPONSE_WATCHDOG_MS);
      updateSessionMessages(sk, (prev) =>
        prev.map((m) =>
          m.id === mid
            ? { ...m, content: m.content + text, isStreaming: true }
            : m
        )
      );
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
      const mid = streamMessageIdRef.current;
      if (!mid) {
        return;
      }
      const cumulative = p.cumulative === true;
      updateSessionMessages(sk, (prev) =>
        prev.map((m) =>
          m.id === mid
            ? {
                ...m,
                thinkingBlocks: upsertThinkingBlocks(m.thinkingBlocks, text, cumulative),
              }
            : m
        )
      );
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
      const mid = streamMessageIdRef.current;
      if (!mid) {
        return;
      }
      updateSessionMessages(sk, (prev) =>
        prev.map((m) =>
          m.id === mid
            ? {
                ...m,
                toolCalls: upsertToolCalls(m.toolCalls, p),
              }
            : m
        )
      );
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
      clearWatchdog();
      const rawMsg = { ...row } as Record<string, unknown>;
      delete rawMsg.sessionKey;
      const mapped = openClawMessageToChat(rawMsg as unknown as OpenClawMessage);
      const streamId = streamMessageIdRef.current;
      updateSessionMessages(sk, (prev) => {
        if (streamId && mapped.role === 'assistant') {
          const withoutStream = prev.filter((m) => m.id !== streamId);
          const merged: ChatMessage = {
            ...mapped,
            thinkingBlocks: mapped.thinking
              ? [
                  {
                    id: THINKING_ID,
                    content: mapped.thinking,
                    isExpanded: false,
                  },
                ]
              : undefined,
            isStreaming: false,
          };
          return [...withoutStream, merged];
        }
        const exists = prev.some((m) => m.id === mapped.id);
        if (exists) {
          return prev.map((m) => (m.id === mapped.id ? { ...mapped, isStreaming: false } : m));
        }
        return [...prev, { ...mapped, isStreaming: false }];
      });
      streamMessageIdRef.current = null;
      setIsStreaming(false);
    };

    const onStreamEnd = (payload: unknown): void => {
      if (connectGenRef.current !== genAtSubscribe) {
        return;
      }
      const p = payload as { sessionKey?: string };
      const sk = resolveSessionKey(p.sessionKey);
      clearWatchdog();
      if (sk && streamMessageIdRef.current) {
        const mid = streamMessageIdRef.current;
        updateSessionMessages(sk, (prev) =>
          prev.map((m) => (m.id === mid ? { ...m, isStreaming: false } : m))
        );
      }
      streamMessageIdRef.current = null;
      setIsStreaming(false);
    };

    oc.on('streamStart', onStreamStart);
    oc.on('streamChunk', onStreamChunk);
    oc.on('thinkingChunk', onThinkingChunk);
    oc.on('toolCall', onToolCall);
    oc.on('message', onMessage);
    oc.on('streamEnd', onStreamEnd);

    return () => {
      oc.off('streamStart', onStreamStart);
      oc.off('streamChunk', onStreamChunk);
      oc.off('thinkingChunk', onThinkingChunk);
      oc.off('toolCall', onToolCall);
      oc.off('message', onMessage);
      oc.off('streamEnd', onStreamEnd);
      clearWatchdog();
    };
  }, [
    client,
    connectionState.status,
    connectGeneration,
    updateSessionMessages,
    appendWatchdogTimeout,
    clearWatchdog,
  ]);

  const sendMessage = useCallback(
    (text: string, sessionKey?: string): void => {
      const c = client.current;
      if (!c || connectionState.status !== 'connected') {
        return;
      }
      const sk = sessionKey ?? currentSessionKeyRef.current;
      if (!sk) {
        return;
      }
      c.setPrimarySessionKey(sk);
      if (sessionKey) {
        setCurrentSession(sessionKey);
      }

      const userMsg: ChatMessage = {
        id: generateUUID(),
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };
      updateSessionMessages(sk, (prev) => [...prev, userMsg]);
      streamMessageIdRef.current = null;

      void (async () => {
        try {
          await c.sendMessage({
            sessionId: sk,
            content: text,
            agentId: currentAgent?.id,
            thinking: true,
          });
        } catch {
          updateSessionMessages(sk, (prev) => [
            ...prev,
            {
              id: `send-err-${Date.now()}`,
              role: 'system',
              content: 'Failed to send message. Check the connection and try again.',
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      })();
    },
    [client, connectionState.status, currentAgent?.id, setCurrentSession, updateSessionMessages]
  );

  const abortResponse = useCallback((): void => {
    const c = client.current;
    const sk = currentSessionKeyRef.current;
    if (!c || !sk || connectionState.status !== 'connected') {
      return;
    }
    clearWatchdog();
    void c.abortChat(sk);
    streamMessageIdRef.current = null;
    setIsStreaming(false);
  }, [client, connectionState.status, clearWatchdog]);

  return {
    messages,
    isStreaming,
    sendMessage,
    abortResponse,
    loadHistory,
  };
}
