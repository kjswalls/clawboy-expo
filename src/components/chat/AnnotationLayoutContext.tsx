/**
 * AnnotationLayoutContext — lightweight registry that maps annotation IDs to
 * the native View nodes rendered by InlineAnnotationRow.
 *
 * MessageList hosts the provider and reads the registry to implement
 * scrollToAnnotationId (precise scroll-to-row, not just scroll-to-cell).
 *
 * SectionLayoutContext — parallel registry keyed by `${messageId}::${sectionIndex}`.
 * Maps section container Views so MessageList can measure section bottoms for
 * smart annotation-enter scroll targeting.
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

// ---------------------------------------------------------------------------
// Section layout registry — keyed by `${messageId}::${sectionIndex}`
// ---------------------------------------------------------------------------

export interface SectionLayoutRegistry {
  register: (key: string, ref: View) => void;
  unregister: (key: string) => void;
  getRef: (key: string) => View | undefined;
  /** Returns all registered keys whose prefix matches `${messageId}::`. */
  getSectionKeysForMessage: (messageId: string) => string[];
}

const SectionLayoutContext = createContext<SectionLayoutRegistry | null>(null);

interface SectionLayoutProviderProps {
  children: React.ReactNode;
  value?: SectionLayoutRegistry;
}

export function SectionLayoutProvider({ children, value: externalValue }: SectionLayoutProviderProps): React.JSX.Element {
  const mapRef = useRef<Map<string, View>>(new Map());

  const register = useCallback((key: string, ref: View): void => {
    mapRef.current.set(key, ref);
  }, []);

  const unregister = useCallback((key: string): void => {
    mapRef.current.delete(key);
  }, []);

  const getRef = useCallback((key: string): View | undefined => {
    return mapRef.current.get(key);
  }, []);

  const getSectionKeysForMessage = useCallback((messageId: string): string[] => {
    const prefix = `${messageId}::`;
    const keys: string[] = [];
    for (const key of mapRef.current.keys()) {
      if (key.startsWith(prefix)) keys.push(key);
    }
    return keys;
  }, []);

  const internalValue = useMemo<SectionLayoutRegistry>(
    () => ({ register, unregister, getRef, getSectionKeysForMessage }),
    [register, unregister, getRef, getSectionKeysForMessage],
  );

  return (
    <SectionLayoutContext.Provider value={externalValue ?? internalValue}>
      {children}
    </SectionLayoutContext.Provider>
  );
}

export function useCreateSectionLayoutRegistry(): SectionLayoutRegistry {
  const mapRef = useRef<Map<string, View>>(new Map());

  const register = useCallback((key: string, ref: View): void => {
    mapRef.current.set(key, ref);
  }, []);

  const unregister = useCallback((key: string): void => {
    mapRef.current.delete(key);
  }, []);

  const getRef = useCallback((key: string): View | undefined => {
    return mapRef.current.get(key);
  }, []);

  const getSectionKeysForMessage = useCallback((messageId: string): string[] => {
    const prefix = `${messageId}::`;
    const keys: string[] = [];
    for (const key of mapRef.current.keys()) {
      if (key.startsWith(prefix)) keys.push(key);
    }
    return keys;
  }, []);

  return useMemo<SectionLayoutRegistry>(
    () => ({ register, unregister, getRef, getSectionKeysForMessage }),
    [register, unregister, getRef, getSectionKeysForMessage],
  );
}

export function useSectionLayoutMaybe(): SectionLayoutRegistry | null {
  return useContext(SectionLayoutContext);
}
