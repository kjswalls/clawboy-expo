import { useCallback, useEffect, useRef, useState } from 'react';
import type { InputAttachment } from '@/components/input/types';
import { readCachedSession, writeCachedSession } from '@/lib/chatCache';
import type { DraftEntry } from '@/lib/chatCache/types';
import { useServerConfig } from '@/hooks/useServerConfig';
import { pickBestServerProfile } from '@/lib/pickBestServerProfile';

const DRAFT_PERSIST_DEBOUNCE_MS = 500;

export interface DraftValue {
  text: string;
  attachments: InputAttachment[];
}

export interface UseDraftResult {
  draft: DraftValue;
  setDraft: (value: DraftValue) => void;
  clearDraft: (sessionKey: string) => void;
}

/**
 * Reads and writes the current session's draft from/to the encrypted on-disk
 * blob (CachedSessionBlobV2.drafts), debounced so keystrokes don't flood disk.
 *
 * - On mount / sessionKey change, seeds from disk immediately.
 * - setDraft() updates local state synchronously and schedules a debounced
 *   disk write.
 * - clearDraft() removes the entry for the given session and flushes immediately
 *   (called on successful send).
 * - Multiple sessions can have independent in-flight drafts; each session's
 *   entry lives under its own key in the drafts map.
 */
export function useDraft(sessionKey: string | null): UseDraftResult {
  const { isHydrated, serverProfiles } = useServerConfig();

  const [draft, setDraftState] = useState<DraftValue>({ text: '', attachments: [] });

  // Keep a stable ref to the full drafts map so writes can merge without
  // triggering re-renders for the whole map.
  const draftsMapRef = useRef<Record<string, DraftEntry>>({});
  const profileIdRef = useRef<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionKeyRef = useRef(sessionKey);
  sessionKeyRef.current = sessionKey;

  // Load drafts from disk when the profile is hydrated (once per app session).
  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    const profile = pickBestServerProfile(serverProfiles);
    if (!profile) {
      return;
    }
    profileIdRef.current = profile.id;
    void (async () => {
      try {
        const blob = await readCachedSession(profile.id);
        if (blob) {
          draftsMapRef.current = { ...blob.drafts };
        }
        // Seed local state for the current session.
        const sk = sessionKeyRef.current;
        if (sk) {
          const entry = draftsMapRef.current[sk];
          if (entry) {
            const raw = entry.attachments ?? [];
            const attachments = raw.filter(
              (a): a is InputAttachment => typeof (a as InputAttachment).uri === 'string' && (a as InputAttachment).uri.length > 0,
            );
            setDraftState({ text: entry.text, attachments });
          }
        }
      } catch {
        /* ignore */
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, serverProfiles]);

  // When sessionKey changes, swap in the draft for the new session.
  useEffect(() => {
    if (!sessionKey) {
      setDraftState({ text: '', attachments: [] });
      return;
    }
    const entry = draftsMapRef.current[sessionKey];
    if (entry) {
      const raw = entry.attachments ?? [];
      const attachments = raw.filter(
        (a): a is InputAttachment => typeof (a as InputAttachment).uri === 'string' && (a as InputAttachment).uri.length > 0,
      );
      setDraftState({ text: entry.text, attachments });
    } else {
      setDraftState({ text: '', attachments: [] });
    }
  }, [sessionKey]);

  const flushDraftsToDisk = useCallback((): void => {
    const pid = profileIdRef.current;
    if (!pid) {
      return;
    }
    void (async () => {
      try {
        const existing = await readCachedSession(pid);
        if (!existing) {
          return;
        }
        await writeCachedSession(pid, { ...existing, drafts: draftsMapRef.current });
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const scheduleDraftWrite = useCallback((): void => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      flushDraftsToDisk();
    }, DRAFT_PERSIST_DEBOUNCE_MS);
  }, [flushDraftsToDisk]);

  const setDraft = useCallback(
    (value: DraftValue): void => {
      setDraftState(value);
      const sk = sessionKeyRef.current;
      if (!sk) {
        return;
      }
      if (value.text.length === 0 && value.attachments.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete draftsMapRef.current[sk];
      } else {
        draftsMapRef.current[sk] = {
          text: value.text,
          attachments: value.attachments,
          updatedAt: Date.now(),
        };
      }
      scheduleDraftWrite();
    },
    [scheduleDraftWrite]
  );

  const clearDraft = useCallback(
    (sk: string): void => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete draftsMapRef.current[sk];
      if (sk === sessionKeyRef.current) {
        setDraftState({ text: '', attachments: [] });
      }
      // Flush immediately so cleared drafts don't resurface on next cold start.
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      flushDraftsToDisk();
    },
    [flushDraftsToDisk]
  );

  // Cleanup debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, []);

  return { draft, setDraft, clearDraft };
}
