import React, { createContext, useContext, useMemo } from 'react';

interface AnnotationDraftValue {
  targetId: string | null;
  draftText: string;
}

const Ctx = createContext<AnnotationDraftValue>({ targetId: null, draftText: '' });

export function AnnotationDraftProvider({
  targetId,
  draftText,
  children,
}: {
  targetId: string | null;
  draftText: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const value = useMemo(() => ({ targetId, draftText }), [targetId, draftText]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Returns live draft text iff this annotation is the current target, else null. */
export function useLiveDraftFor(annotationId: string): string | null {
  const { targetId, draftText } = useContext(Ctx);
  return targetId === annotationId ? draftText : null;
}

/** Returns true when the user is actively typing an annotation comment. */
export function useIsAnnotationDraftActive(): boolean {
  const { targetId } = useContext(Ctx);
  return targetId !== null;
}
