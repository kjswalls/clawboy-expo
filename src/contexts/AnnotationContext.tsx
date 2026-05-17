/**
 * AnnotationContext — per-session pending annotation state.
 *
 * Wraps useDraft's annotation slice so any component can add, update, remove,
 * or clear annotations without passing props through the tree.
 *
 * The context must be mounted inside a component that provides `sessionKey` as
 * a prop. When sessionKey changes the draft hook automatically swaps in the
 * stored annotations for the new session.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Annotation, AnnotationAnchor } from '@/lib/annotations';
import { useDraft } from '@/hooks/useDraft';
import { generateUUID } from '@/lib/openclaw/utils';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface AnnotationContextValue {
  annotations: Annotation[];
  addAnnotation: (
    messageId: string,
    anchor: AnnotationAnchor,
    quotedText: string,
    comment: string,
  ) => Annotation;
  updateAnnotation: (id: string, patch: Partial<Pick<Annotation, 'comment' | 'quotedText'>>) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: () => void;
  /** Which annotation the InputBar is currently editing (null = untargeted). */
  targetAnnotationId: string | null;
  setTargetAnnotationId: (id: string | null) => void;
}

const AnnotationContext = createContext<AnnotationContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface AnnotationProviderProps {
  sessionKey: string | null;
  children: React.ReactNode;
}

export function AnnotationProvider({ sessionKey, children }: AnnotationProviderProps): React.JSX.Element {
  const { annotations, setAnnotations } = useDraft(sessionKey);
  const [targetAnnotationId, setTargetAnnotationId] = useState<string | null>(null);

  // Reset target when session changes.
  useEffect(() => {
    setTargetAnnotationId(null);
  }, [sessionKey]);

  // Auto-clear target when its annotation is deleted.
  useEffect(() => {
    if (targetAnnotationId && !annotations.some((a) => a.id === targetAnnotationId)) {
      setTargetAnnotationId(null);
    }
  }, [annotations, targetAnnotationId]);

  const addAnnotation = useCallback(
    (
      messageId: string,
      anchor: AnnotationAnchor,
      quotedText: string,
      comment: string,
    ): Annotation => {
      const annotation: Annotation = {
        id: generateUUID(),
        messageId,
        anchor,
        quotedText,
        comment,
        createdAt: Date.now(),
      };
      setAnnotations([...annotations, annotation]);
      return annotation;
    },
    [annotations, setAnnotations],
  );

  const updateAnnotation = useCallback(
    (id: string, patch: Partial<Pick<Annotation, 'comment' | 'quotedText'>>): void => {
      setAnnotations(
        annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      );
    },
    [annotations, setAnnotations],
  );

  const removeAnnotation = useCallback(
    (id: string): void => {
      setAnnotations(annotations.filter((a) => a.id !== id));
    },
    [annotations, setAnnotations],
  );

  const clearAnnotations = useCallback((): void => {
    setAnnotations([]);
  }, [setAnnotations]);

  const value = useMemo<AnnotationContextValue>(
    () => ({
      annotations,
      addAnnotation,
      updateAnnotation,
      removeAnnotation,
      clearAnnotations,
      targetAnnotationId,
      setTargetAnnotationId,
    }),
    [annotations, addAnnotation, updateAnnotation, removeAnnotation, clearAnnotations, targetAnnotationId, setTargetAnnotationId],
  );

  return (
    <AnnotationContext.Provider value={value}>
      {children}
    </AnnotationContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAnnotations(): AnnotationContextValue {
  const ctx = useContext(AnnotationContext);
  if (!ctx) {
    throw new Error('useAnnotations must be used inside <AnnotationProvider>');
  }
  return ctx;
}
