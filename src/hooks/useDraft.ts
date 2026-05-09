import { useCallback, useEffect, useRef, useState } from 'react';
import type { InputAttachment } from '@/components/input/types';
import { readCachedSession, writeCachedSession } from '@/lib/chatCache';
import type { DraftEntry } from '@/lib/chatCache/types';
import type { Annotation } from '@/lib/annotations';
import { useServerConfig } from '@/hooks/useServerConfig';
import { pickBestServerProfile } from '@/lib/pickBestServerProfile';

const DRAFT_PERSIST_DEBOUNCE_MS = 500;

export interface UseDraftResult {
  /**
   * The text that should be loaded into the TextInput for the current session.
   * Changes when: (a) initial disk load completes, or (b) sessionKey changes.
   * Consumers should call setTextProgrammatic(hydratedText) once per change,
   * using hydrationGen to detect genuine changes.
   */
  hydratedText: string;
  /**
   * Increments each time hydratedText represents a fresh session/disk load.
   * Guards against accidentally re-applying the same value on unrelated re-renders.
   */
  hydrationGen: number;
  /**
   * Persists text for the current session to the in-memory drafts map and
   * schedules a debounced disk write. Does NOT trigger React re-renders.
   */
  persistText: (text: string) => void;
  /** Attachment list state for the current session. */
  attachments: InputAttachment[];
  setAttachments: (attachments: InputAttachment[]) => void;
  /** Pending annotation list for the current session. */
  annotations: Annotation[];
  setAnnotations: (annotations: Annotation[]) => void;
  /**
   * Removes the draft entry for the given session and flushes to disk
   * immediately (called on successful send). If it is the current session,
   * also clears attachments and annotations state.
   */
  clearDraft: (sessionKey: string) => void;
}

/**
 * Manages per-session draft persistence for the input bar.
 *
 * Text state is intentionally NOT held here — it lives in useInputTextController
 * so the TextInput can be uncontrolled (fixing iOS Voice Control / dictation).
 * This hook owns only:
 *   - The on-disk drafts map (read on mount, written debounced)
 *   - `hydratedText` / `hydrationGen` signals to tell InputBar when to push
 *     a new text value into the native input
 *   - `attachments` state (doesn't affect native text, so stays in React state)
 */
export function useDraft(sessionKey: string | null): UseDraftResult {
  const { isHydrated, serverProfiles } = useServerConfig();

  const [attachments, setAttachmentsState] = useState<InputAttachment[]>([]);
  const [annotations, setAnnotationsState] = useState<Annotation[]>([]);
  const [hydratedText, setHydratedText] = useState('');
  const [hydrationGen, setHydrationGen] = useState(0);

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
        const sk = sessionKeyRef.current;
        if (sk) {
          const entry = draftsMapRef.current[sk];
          if (entry) {
            const raw = entry.attachments ?? [];
            const validAttachments = raw.filter(
              (a): a is InputAttachment =>
                typeof (a as InputAttachment).uri === 'string' &&
                (a as InputAttachment).uri.length > 0,
            );
            setAttachmentsState(validAttachments);
            setAnnotationsState((entry.annotations as Annotation[] | undefined) ?? []);
            setHydratedText(entry.text);
            setHydrationGen((g) => g + 1);
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
      setAttachmentsState([]);
      setAnnotationsState([]);
      setHydratedText('');
      setHydrationGen((g) => g + 1);
      return;
    }
    const entry = draftsMapRef.current[sessionKey];
    if (entry) {
      const raw = entry.attachments ?? [];
      const validAttachments = raw.filter(
        (a): a is InputAttachment =>
          typeof (a as InputAttachment).uri === 'string' &&
          (a as InputAttachment).uri.length > 0,
      );
      setAttachmentsState(validAttachments);
      setAnnotationsState((entry.annotations as Annotation[] | undefined) ?? []);
      setHydratedText(entry.text);
    } else {
      setAttachmentsState([]);
      setAnnotationsState([]);
      setHydratedText('');
    }
    setHydrationGen((g) => g + 1);
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

  const persistText = useCallback(
    (text: string): void => {
      const sk = sessionKeyRef.current;
      if (!sk) {
        return;
      }
      const existing = draftsMapRef.current[sk];
      if (text.length === 0 && (!existing || existing.attachments?.length === 0)) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete draftsMapRef.current[sk];
      } else {
        draftsMapRef.current[sk] = {
          text,
          attachments: existing?.attachments ?? [],
          annotations: existing?.annotations,
          updatedAt: Date.now(),
        };
      }
      scheduleDraftWrite();
    },
    [scheduleDraftWrite],
  );

  const setAttachments = useCallback(
    (next: InputAttachment[]): void => {
      setAttachmentsState(next);
      const sk = sessionKeyRef.current;
      if (!sk) {
        return;
      }
      const existing = draftsMapRef.current[sk];
      if (next.length === 0 && (!existing || existing.text.length === 0)) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete draftsMapRef.current[sk];
      } else {
        draftsMapRef.current[sk] = {
          text: existing?.text ?? '',
          attachments: next,
          annotations: existing?.annotations,
          updatedAt: Date.now(),
        };
      }
      scheduleDraftWrite();
    },
    [scheduleDraftWrite],
  );

  const setAnnotations = useCallback(
    (next: Annotation[]): void => {
      setAnnotationsState(next);
      const sk = sessionKeyRef.current;
      if (!sk) {
        return;
      }
      const existing = draftsMapRef.current[sk];
      if (next.length === 0 && (!existing || (existing.text.length === 0 && (!existing.attachments || existing.attachments.length === 0)))) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete draftsMapRef.current[sk];
      } else {
        draftsMapRef.current[sk] = {
          text: existing?.text ?? '',
          attachments: existing?.attachments ?? [],
          annotations: next.length > 0 ? next : undefined,
          updatedAt: Date.now(),
        };
      }
      scheduleDraftWrite();
    },
    [scheduleDraftWrite],
  );

  const clearDraft = useCallback(
    (sk: string): void => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete draftsMapRef.current[sk];
      if (sk === sessionKeyRef.current) {
        setAttachmentsState([]);
        setAnnotationsState([]);
      }
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      flushDraftsToDisk();
    },
    [flushDraftsToDisk],
  );

  // Cleanup debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, []);

  return {
    hydratedText,
    hydrationGen,
    persistText,
    attachments,
    setAttachments,
    annotations,
    setAnnotations,
    clearDraft,
  };
}
