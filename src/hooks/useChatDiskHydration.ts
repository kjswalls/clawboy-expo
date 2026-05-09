import { useLayoutEffect, useRef, useState } from 'react';

import { useBootReady } from '@/contexts/BootReadyContext';
import { useServerConfig } from '@/hooks/useServerConfig';
import { readCachedSession } from '@/lib/chatCache';
import { pickBestServerProfile } from '@/lib/pickBestServerProfile';
import type { CachedAgentSnapshot, CachedModelSnapshot } from '@/lib/chatCache/types';
import type { ChatMessage } from '@/types';

export interface DiskHydrationState {
  /** True once the disk read has finished (success, miss, or error). */
  attempted: boolean;
  /** True only when seedCache was called with at least one message. */
  seeded: boolean;
  /** The session key that was seeded from disk, or null if nothing was seeded. */
  seededSessionKey: string | null;
}

export interface DiskHydrationCallbacks {
  seedCache: (sessionKey: string, messages: ChatMessage[]) => void;
  setCurrentSession: (key: string) => void;
  /** Optional: seed the agent picker before the WS list loads. */
  seedAgentFromCache?: (snap: CachedAgentSnapshot) => void;
  /** Optional: seed the model picker before the WS list loads. */
  seedModelFromCache?: (snap: CachedModelSnapshot) => void;
}

/**
 * Reads the encrypted on-disk tail cache for the best server profile and seeds
 * `useChat` / `useSessions` before the WebSocket handshake completes.
 *
 * Runs in `useLayoutEffect` so it starts in the same frame as first paint; the
 * actual disk + decrypt work is async. When finished (hit or miss), it calls
 * `markDiskHydrationAttempted()` so `useAutoReconnect` can fire `connect()`
 * without a fixed delay.
 */
export function useChatDiskHydration(
  seedCache: (sessionKey: string, messages: ChatMessage[]) => void,
  setCurrentSession: (key: string) => void,
  opts?: Pick<DiskHydrationCallbacks, 'seedAgentFromCache' | 'seedModelFromCache'>,
): DiskHydrationState {
  const { isHydrated, serverProfiles } = useServerConfig();
  const { markDiskHydrationAttempted } = useBootReady();
  const attemptedRef = useRef(false);

  const [attempted, setAttempted] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [seededSessionKey, setSeededSessionKey] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (attemptedRef.current) {
      return;
    }

    if (!isHydrated) {
      return;
    }

    const profile = pickBestServerProfile(serverProfiles);
    if (!profile) {
      // No profile — nothing to read; hydration is "done" immediately.
      attemptedRef.current = true;
      setAttempted(true);
      markDiskHydrationAttempted();
      return;
    }

    attemptedRef.current = true;

    void (async () => {
      try {
        const blob = await readCachedSession(profile.id);
        if (!blob || blob.profileId !== profile.id) {
          return;
        }
        // Seed the cache BEFORE setting the session key so that when
        // useChat's session-key effect fires it finds messages already in
        // sessionCacheRef and calls setMessages(cached) in the same commit.
        // This prevents the skeleton bridge from entering for one frame before
        // the cached messages land.
        seedCache(blob.sessionKey, blob.messages);
        setCurrentSession(blob.sessionKey);
        if (blob.agent) {
          opts?.seedAgentFromCache?.(blob.agent);
        }
        if (blob.model) {
          opts?.seedModelFromCache?.(blob.model);
        }
        if (blob.messages.length > 0) {
          setSeeded(true);
          setSeededSessionKey(blob.sessionKey);
        }
      } catch {
        /* ignore */
      } finally {
        setAttempted(true);
        markDiskHydrationAttempted();
      }
    })();
  }, [isHydrated, serverProfiles, seedCache, setCurrentSession, markDiskHydrationAttempted, opts]);

  return { attempted, seeded, seededSessionKey };
}
