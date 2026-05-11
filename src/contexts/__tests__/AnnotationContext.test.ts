/**
 * Tests for AnnotationContext — annotations-005.
 *
 * Exercises the real AnnotationProvider and useAnnotations hook using
 * renderHook so that any bug in the React context wiring is caught.
 *
 * Covers:
 *  - addAnnotation: appends, multiple independent additions
 *  - updateAnnotation: comment, quotedText, only targeted item
 *  - removeAnnotation: removes by id, no-op for unknown id
 *  - clearAnnotations: empties the list
 *  - session-switch isolation: annotations reset when sessionKey prop changes
 */

import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ── Mocks ──────────────────────────────────────────────────────────────────

// useDraft depends on useServerConfig; return isHydrated:false to skip disk load.
jest.mock('@/hooks/useServerConfig', () => ({
  useServerConfig: () => ({ isHydrated: false, serverProfiles: [] }),
}));

// useDraft imports these for the (skipped) disk-load path — stub them out.
jest.mock('@/lib/chatCache', () => ({
  readCachedSession: jest.fn().mockResolvedValue(null),
  writeCachedSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/pickBestServerProfile', () => ({
  pickBestServerProfile: jest.fn().mockReturnValue(null),
}));

// AnnotationProvider uses generateUUID to mint annotation ids.
jest.mock('@/lib/openclaw/utils', () => {
  let _counter = 0;
  return { generateUUID: () => `test-uuid-${++_counter}` };
});

// ── Subject under test ─────────────────────────────────────────────────────

import { AnnotationProvider, useAnnotations } from '@/contexts/AnnotationContext';
import type { Annotation, AnnotationAnchor } from '@/lib/annotations';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeWrapper(sessionKey: string | null) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(AnnotationProvider, { sessionKey }, children);
  };
}

const blockAnchor = (blockIndex: number): AnnotationAnchor => ({ kind: 'block', blockIndex });
const rangeAnchor = (start: number, end: number): AnnotationAnchor => ({ kind: 'range', start, end });

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AnnotationContext — addAnnotation', () => {
  it('appends a new annotation to the list', () => {
    const { result } = renderHook(() => useAnnotations(), {
      wrapper: makeWrapper('session-1'),
    });

    let added!: Annotation;
    act(() => {
      added = result.current.addAnnotation('msg-1', blockAnchor(0), 'Hello world', '');
    });

    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.annotations[0]).toBe(added);
    expect(added.messageId).toBe('msg-1');
    expect(added.quotedText).toBe('Hello world');
  });

  it('adds multiple annotations independently', () => {
    const { result } = renderHook(() => useAnnotations(), {
      wrapper: makeWrapper('session-1'),
    });

    // Each addAnnotation captures `annotations` in its closure, so separate
    // act() calls are required to let the hook re-render between additions.
    act(() => { result.current.addAnnotation('msg-1', blockAnchor(0), 'First', ''); });
    act(() => { result.current.addAnnotation('msg-1', blockAnchor(2), 'Second', ''); });
    act(() => { result.current.addAnnotation('msg-2', rangeAnchor(10, 40), 'Third', ''); });

    expect(result.current.annotations).toHaveLength(3);
    expect(result.current.annotations.map((a) => a.quotedText)).toEqual(['First', 'Second', 'Third']);
  });
});

describe('AnnotationContext — updateAnnotation', () => {
  it('updates the comment of the targeted annotation', () => {
    const { result } = renderHook(() => useAnnotations(), {
      wrapper: makeWrapper('session-1'),
    });

    let added!: Annotation;
    act(() => {
      added = result.current.addAnnotation('msg-1', blockAnchor(0), 'quoted', '');
    });

    act(() => {
      result.current.updateAnnotation(added.id, { comment: 'My comment' });
    });

    expect(result.current.annotations[0].comment).toBe('My comment');
    expect(result.current.annotations[0].quotedText).toBe('quoted');
  });

  it('only updates the targeted annotation, not others', () => {
    const { result } = renderHook(() => useAnnotations(), {
      wrapper: makeWrapper('session-1'),
    });

    let a1!: Annotation;
    let a2!: Annotation;
    act(() => { a1 = result.current.addAnnotation('msg-1', blockAnchor(0), 'A', ''); });
    act(() => { a2 = result.current.addAnnotation('msg-1', blockAnchor(1), 'B', ''); });

    act(() => {
      result.current.updateAnnotation(a1.id, { comment: 'Updated A' });
    });

    const found1 = result.current.annotations.find((a) => a.id === a1.id)!;
    const found2 = result.current.annotations.find((a) => a.id === a2.id)!;
    expect(found1.comment).toBe('Updated A');
    expect(found2.comment).toBe('');
  });

  it('can update quotedText', () => {
    const { result } = renderHook(() => useAnnotations(), {
      wrapper: makeWrapper('session-1'),
    });

    let added!: Annotation;
    act(() => {
      added = result.current.addAnnotation('msg-1', blockAnchor(0), 'original', '');
    });

    act(() => {
      result.current.updateAnnotation(added.id, { quotedText: 'corrected' });
    });

    expect(result.current.annotations[0].quotedText).toBe('corrected');
  });
});

describe('AnnotationContext — removeAnnotation', () => {
  it('removes the annotation with the given id', () => {
    const { result } = renderHook(() => useAnnotations(), {
      wrapper: makeWrapper('session-1'),
    });

    let a1!: Annotation;
    let a2!: Annotation;
    act(() => {
      a1 = result.current.addAnnotation('msg-1', blockAnchor(0), 'A', '');
      a2 = result.current.addAnnotation('msg-1', blockAnchor(1), 'B', '');
    });

    act(() => {
      result.current.removeAnnotation(a1.id);
    });

    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.annotations[0].id).toBe(a2.id);
  });

  it('is a no-op for an unknown id', () => {
    const { result } = renderHook(() => useAnnotations(), {
      wrapper: makeWrapper('session-1'),
    });

    act(() => {
      result.current.addAnnotation('msg-1', blockAnchor(0), 'A', '');
    });

    act(() => {
      result.current.removeAnnotation('nonexistent-id');
    });

    expect(result.current.annotations).toHaveLength(1);
  });
});

describe('AnnotationContext — clearAnnotations', () => {
  it('empties the list regardless of prior state', () => {
    const { result } = renderHook(() => useAnnotations(), {
      wrapper: makeWrapper('session-1'),
    });

    act(() => { result.current.addAnnotation('msg-1', blockAnchor(0), 'A', ''); });
    act(() => { result.current.addAnnotation('msg-1', blockAnchor(1), 'B', ''); });
    expect(result.current.annotations).toHaveLength(2);

    act(() => {
      result.current.clearAnnotations();
    });

    expect(result.current.annotations).toHaveLength(0);
  });
});

describe('AnnotationContext — session-switch isolation', () => {
  it('resets annotations to empty when sessionKey prop changes', () => {
    // Use a stateful parent so we can drive the sessionKey change from outside.
    let setSessionKey!: (key: string | null) => void;

    function DynamicWrapper({ children }: { children: React.ReactNode }) {
      const [sessionKey, setKey] = React.useState<string | null>('session-a');
      setSessionKey = setKey;
      return React.createElement(AnnotationProvider, { sessionKey }, children);
    }

    const { result } = renderHook(() => useAnnotations(), { wrapper: DynamicWrapper });

    // Add an annotation to session-a.
    act(() => {
      result.current.addAnnotation('msg-a', blockAnchor(0), 'A note', 'A comment');
    });
    expect(result.current.annotations).toHaveLength(1);

    // Switch to session-b — annotations should reset to empty (no cached draft).
    act(() => {
      setSessionKey('session-b');
    });
    expect(result.current.annotations).toHaveLength(0);
  });

  it('annotations from separate sessions do not bleed into each other', () => {
    let setSessionKey!: (key: string | null) => void;

    function DynamicWrapper({ children }: { children: React.ReactNode }) {
      const [sessionKey, setKey] = React.useState<string | null>('session-a');
      setSessionKey = setKey;
      return React.createElement(AnnotationProvider, { sessionKey }, children);
    }

    const { result } = renderHook(() => useAnnotations(), { wrapper: DynamicWrapper });

    act(() => {
      result.current.addAnnotation('msg-a', blockAnchor(0), 'Session A note', '');
    });
    expect(result.current.annotations[0].messageId).toBe('msg-a');

    act(() => { setSessionKey('session-b'); });
    // session-b starts empty — session-a note must not appear.
    expect(result.current.annotations).toHaveLength(0);

    act(() => {
      result.current.addAnnotation('msg-b', rangeAnchor(0, 10), 'Session B note', '');
    });
    expect(result.current.annotations[0].messageId).toBe('msg-b');

    // Switching back to session-a restores its in-memory draft (draftsMapRef is
    // updated immediately on addAnnotation — only the disk write is debounced).
    act(() => { setSessionKey('session-a'); });
    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.annotations[0].messageId).toBe('msg-a');
  });
});
