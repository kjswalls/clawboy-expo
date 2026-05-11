import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection } from '@/contexts/ConnectionContext';
import type { AgentFile } from '@/lib/openclaw/types';

export interface AgentFilesValue {
  files: AgentFile[];
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Module-level cache so switching between sessions (which re-mounts components)
 * doesn't re-fetch the same agent's file list every time.
 *
 * Key: agentId. Cleared when the connection generation increments (reconnect /
 * disconnect), since the gateway may have updated the workspace.
 * Capped at 20 entries (LRU: oldest insertion evicted when limit is exceeded).
 */
const FILE_CACHE_MAX = 20;
const fileCache = new Map<string, AgentFile[]>();
let cacheGeneration = -1;

function fileCacheSet(key: string, value: AgentFile[]): void {
  fileCache.delete(key); // promote to newest if already present
  fileCache.set(key, value);
  if (fileCache.size > FILE_CACHE_MAX) {
    fileCache.delete(fileCache.keys().next().value as string);
  }
}

export function useAgentFiles(agentId: string | null | undefined): AgentFilesValue {
  const { client: clientRef, connectGeneration, connectionState } = useConnection();
  const [files, setFiles] = useState<AgentFile[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Evict cache when a new connection generation starts (reconnect/disconnect).
  useEffect(() => {
    if (connectGeneration !== cacheGeneration) {
      fileCache.clear();
      cacheGeneration = connectGeneration;
    }
  }, [connectGeneration]);

  // Stable setter that avoids emitting a new array reference when the content
  // hasn't actually changed. Without this, every connection-state flip that
  // calls setFiles([]) would produce a fresh [] and defeat React.memo on
  // downstream MessageBubble components (forcing re-renders + markdown re-parse).
  const setFilesIfChanged = useCallback((next: AgentFile[]): void => {
    if (!mountedRef.current) return;
    setFiles((prev) => {
      if (prev === next) return prev;
      if (prev.length === 0 && next.length === 0) return prev;
      if (
        prev.length === next.length &&
        prev.every((f, i) => f === next[i])
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const fetchFiles = useCallback(async (id: string): Promise<void> => {
    const client = clientRef.current;
    if (!client || connectionState.status !== 'connected') {
      return;
    }

    const cached = fileCache.get(id);
    if (cached) {
      setFilesIfChanged(cached);
      return;
    }

    if (mountedRef.current) setLoading(true);
    try {
      const result = await client.getAgentFiles(id);
      const list = result?.files ?? [];
      fileCacheSet(id, list);
      setFilesIfChanged(list);
    } catch {
      // Silently fail — callers treat an empty list as "no matches"
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [clientRef, connectionState.status, setFilesIfChanged]);

  useEffect(() => {
    if (!agentId || connectionState.status !== 'connected') {
      setFilesIfChanged([]);
      return;
    }
    void fetchFiles(agentId);
  }, [agentId, connectionState.status, fetchFiles, setFilesIfChanged]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!agentId) return;
    fileCache.delete(agentId);
    await fetchFiles(agentId);
  }, [agentId, fetchFiles]);

  return { files, loading, refresh };
}
