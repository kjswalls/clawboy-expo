/**
 * AnnotationLayoutContext — lightweight registry that maps annotation IDs to
 * the native View nodes rendered by InlineAnnotationRow.
 *
 * MessageList hosts the provider and reads the registry to implement
 * scrollToAnnotationId (precise scroll-to-row, not just scroll-to-cell).
 */

import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import type { View } from 'react-native';

export interface AnnotationLayoutRegistry {
  register: (id: string, ref: View) => void;
  unregister: (id: string) => void;
  getRef: (id: string) => View | undefined;
}

const AnnotationLayoutContext = createContext<AnnotationLayoutRegistry | null>(null);

interface AnnotationLayoutProviderProps {
  children: React.ReactNode;
  /**
   * Optional externally-managed registry. When provided the provider simply
   * exposes this value via context without creating its own internal map.
   * Use this when the host component (e.g. MessageList) needs direct access
   * to the registry outside of a render/context call.
   */
  value?: AnnotationLayoutRegistry;
}

export function AnnotationLayoutProvider({ children, value: externalValue }: AnnotationLayoutProviderProps): React.JSX.Element {
  const mapRef = useRef<Map<string, View>>(new Map());

  const register = useCallback((id: string, ref: View): void => {
    mapRef.current.set(id, ref);
  }, []);

  const unregister = useCallback((id: string): void => {
    mapRef.current.delete(id);
  }, []);

  const getRef = useCallback((id: string): View | undefined => {
    return mapRef.current.get(id);
  }, []);

  const internalValue = useMemo<AnnotationLayoutRegistry>(
    () => ({ register, unregister, getRef }),
    [register, unregister, getRef],
  );

  return (
    <AnnotationLayoutContext.Provider value={externalValue ?? internalValue}>
      {children}
    </AnnotationLayoutContext.Provider>
  );
}

/**
 * Create a standalone annotation layout registry backed by the given map ref.
 * Call this inside a component to get stable callbacks that read/write the map,
 * then pass the result as the `value` prop to `AnnotationLayoutProvider`.
 */
export function useCreateAnnotationLayoutRegistry(): AnnotationLayoutRegistry {
  const mapRef = useRef<Map<string, View>>(new Map());

  const register = useCallback((id: string, ref: View): void => {
    mapRef.current.set(id, ref);
  }, []);

  const unregister = useCallback((id: string): void => {
    mapRef.current.delete(id);
  }, []);

  const getRef = useCallback((id: string): View | undefined => {
    return mapRef.current.get(id);
  }, []);

  return useMemo<AnnotationLayoutRegistry>(
    () => ({ register, unregister, getRef }),
    [register, unregister, getRef],
  );
}

export function useAnnotationLayout(): AnnotationLayoutRegistry {
  const ctx = useContext(AnnotationLayoutContext);
  if (!ctx) {
    throw new Error('useAnnotationLayout must be used inside <AnnotationLayoutProvider>');
  }
  return ctx;
}

/**
 * Nullable variant for components that may render outside the provider
 * (e.g. annotation preview modal). Returns null when not in context.
 */
export function useAnnotationLayoutMaybe(): AnnotationLayoutRegistry | null {
  return useContext(AnnotationLayoutContext);
}
