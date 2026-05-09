/**
 * Tests for mergeMessagesPreservingIdentity and the interactiveEqual helper
 * (tested indirectly via chatMessagesEqual).
 */

import { chatMessagesEqual, mergeMessagesPreservingIdentity } from '../messageMerge';
import type { ChatMessage } from '@/types';
import type { ClawboyOptionsPrompt } from '@/lib/openclaw/interactive';

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const promptA: ClawboyOptionsPrompt = {
  choices: [
    { label: 'Yes', value: 'Yes please' },
    { label: 'No', value: 'No thanks' },
  ],
  allowFreeText: true,
};

const promptB: ClawboyOptionsPrompt = {
  choices: [
    { label: 'Accept', value: 'I accept' },
  ],
  allowFreeText: false,
};

// ---------------------------------------------------------------------------
// chatMessagesEqual — interactiveEqual paths
// ---------------------------------------------------------------------------

describe('chatMessagesEqual — interactive field', () => {
  it('equal when both interactive are undefined', () => {
    const a = makeMsg();
    const b = makeMsg();
    expect(chatMessagesEqual(a, b)).toBe(true);
  });

  it('not equal when one has interactive and the other does not', () => {
    const a = makeMsg({ interactive: promptA });
    const b = makeMsg();
    expect(chatMessagesEqual(a, b)).toBe(false);
  });

  it('not equal when interactive is undefined on b (asymmetric)', () => {
    const a = makeMsg();
    const b = makeMsg({ interactive: promptA });
    expect(chatMessagesEqual(a, b)).toBe(false);
  });

  it('equal when both have identical interactive prompts', () => {
    const a = makeMsg({ interactive: promptA });
    // Structurally equal but different object reference
    const b = makeMsg({
      interactive: {
        choices: [
          { label: 'Yes', value: 'Yes please' },
          { label: 'No', value: 'No thanks' },
        ],
        allowFreeText: true,
      },
    });
    expect(chatMessagesEqual(a, b)).toBe(true);
  });

  it('not equal when choice labels differ', () => {
    const a = makeMsg({ interactive: promptA });
    const b = makeMsg({
      interactive: {
        ...promptA,
        choices: [
          { label: 'Yep', value: 'Yes please' },
          { label: 'No', value: 'No thanks' },
        ],
      },
    });
    expect(chatMessagesEqual(a, b)).toBe(false);
  });

  it('not equal when choice values differ', () => {
    const a = makeMsg({ interactive: promptA });
    const b = makeMsg({
      interactive: {
        ...promptA,
        choices: [
          { label: 'Yes', value: 'Yes CHANGED' },
          { label: 'No', value: 'No thanks' },
        ],
      },
    });
    expect(chatMessagesEqual(a, b)).toBe(false);
  });

  it('not equal when choice count differs', () => {
    const a = makeMsg({ interactive: promptA });
    const b = makeMsg({
      interactive: {
        ...promptA,
        choices: [{ label: 'Yes', value: 'Yes please' }],
      },
    });
    expect(chatMessagesEqual(a, b)).toBe(false);
  });

  it('not equal when allowFreeText differs', () => {
    const a = makeMsg({ interactive: promptA });
    const b = makeMsg({ interactive: { ...promptA, allowFreeText: false } });
    expect(chatMessagesEqual(a, b)).toBe(false);
  });

  it('not equal when prompt text differs', () => {
    const a = makeMsg({ interactive: { ...promptA, prompt: 'Choose:' } });
    const b = makeMsg({ interactive: { ...promptA, prompt: 'Pick:' } });
    expect(chatMessagesEqual(a, b)).toBe(false);
  });

  it('not equal when completely different prompts', () => {
    const a = makeMsg({ interactive: promptA });
    const b = makeMsg({ interactive: promptB });
    expect(chatMessagesEqual(a, b)).toBe(false);
  });

  it('equal when both prompts are the same object reference', () => {
    const a = makeMsg({ interactive: promptA });
    const b = makeMsg({ interactive: promptA });
    expect(chatMessagesEqual(a, b)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mergeMessagesPreservingIdentity — interactive change triggers new ref
// ---------------------------------------------------------------------------

describe('mergeMessagesPreservingIdentity — interactive identity', () => {
  it('returns prev reference when interactive prompt is structurally unchanged', () => {
    const prev = makeMsg({ interactive: promptA });
    const next = makeMsg({
      interactive: {
        choices: [
          { label: 'Yes', value: 'Yes please' },
          { label: 'No', value: 'No thanks' },
        ],
        allowFreeText: true,
      },
    });
    const result = mergeMessagesPreservingIdentity([prev], [next]);
    expect(result[0]).toBe(prev);
  });

  it('returns next reference when interactive prompt changes', () => {
    const prev = makeMsg({ interactive: promptA });
    const next = makeMsg({ interactive: promptB });
    const result = mergeMessagesPreservingIdentity([prev], [next]);
    expect(result[0]).toBe(next);
  });

  it('returns next reference when interactive is added to a previously plain message', () => {
    const prev = makeMsg();
    const next = makeMsg({ interactive: promptA });
    const result = mergeMessagesPreservingIdentity([prev], [next]);
    expect(result[0]).toBe(next);
  });
});
