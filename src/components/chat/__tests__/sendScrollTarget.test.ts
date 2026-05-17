import { describe, it, expect } from '@jest/globals';

import type { ChatUiMessage } from '@/types/chat-ui';
import { computeSendScrollTarget } from '../sendScrollTarget';

const NOW = new Date('2024-01-15T12:00:00Z');

function userMsg(id: string): ChatUiMessage {
  return { id, role: 'user', content: 'hi', timestamp: NOW };
}

function aiMsg(id: string): ChatUiMessage {
  return { id, role: 'assistant', content: '', timestamp: NOW };
}

describe('computeSendScrollTarget', () => {
  it('returns no scroll on empty list', () => {
    expect(computeSendScrollTarget([])).toEqual({ index: -1, userId: null });
  });

  it('returns no scroll when last message is assistant', () => {
    expect(
      computeSendScrollTarget([userMsg('u1'), aiMsg('a1')]),
    ).toEqual({ index: -1, userId: null });
  });

  it('returns the tail user message index when last item is a user message', () => {
    expect(
      computeSendScrollTarget([aiMsg('a0'), userMsg('u1')]),
    ).toEqual({ index: 1, userId: 'u1' });
  });

  it('treats a fresh second send as a new target', () => {
    // Caller deduplicates against the previous userId; the helper just reports
    // whichever user message is currently at the tail.
    expect(
      computeSendScrollTarget([userMsg('u1'), aiMsg('a1'), userMsg('u2')]),
    ).toEqual({ index: 2, userId: 'u2' });
  });

  it('ignores spacer/info/internalEvent rows at the tail', () => {
    const spacer: ChatUiMessage = {
      id: 'spacer',
      role: 'assistant',
      content: '',
      timestamp: NOW,
      kind: 'spacer',
      spacerHeight: 400,
    };
    expect(
      computeSendScrollTarget([userMsg('u1'), spacer]),
    ).toEqual({ index: -1, userId: null });
  });
});
