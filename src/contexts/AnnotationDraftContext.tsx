import React, { createContext, useContext, useMemo } from 'react';

interface AnnotationDraftValue {
  targetId: string | null;
  draftText: string;
  composerFocused: boolean;
  setComposerFocused: (b: boolean) => void;
}

const Ctx = createContext<AnnotationDraftValue>({
  targetId: null,
  draftText: '',
  composerFocused: false,
  setComposerFocused: () => {},
});

const NOOP_SET_COMPOSER_FOCUSED = (): void => {};

export function AnnotationDraftProvider({
  targetId,
  draftText,
  composerFocused = false,
  setComposerFocused = NOOP_SET_COMPOSER_FOCUSED,
  children,
}: {
  targetId: string | null;
  draftText: string;
  composerFocused?: boolean;
  setComposerFocused?: (b: boolean) => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const value = useMemo(
    () => ({ targetId, draftText, composerFocused, setComposerFocused }),
    [targetId, draftText, composerFocused, setComposerFocused],
  );
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

/** Returns true when annotation composer is focused (focus mode active). */
export function useIsAnnotationFocusActive(): boolean {
  const { targetId, composerFocused } = useContext(Ctx);
  return targetId !== null && composerFocused;
}

/** Returns stable setter for composerFocused. */
export function useSetAnnotationComposerFocused(): (b: boolean) => void {
  return useContext(Ctx).setComposerFocused;
}
