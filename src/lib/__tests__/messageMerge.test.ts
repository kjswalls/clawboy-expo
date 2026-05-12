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
// chatMessagesEqual — images, files, toolCalls, parts, thinkingBlocks
// ---------------------------------------------------------------------------

describe('chatMessagesEqual — images field', () => {
  it('equal when both have no images', () => {
    expect(chatMessagesEqual(makeMsg(), makeMsg())).toBe(true);
  });

  it('equal when images arrays are same reference', () => {
    const imgs = [{ url: 'https://example.com/a.png' }];
    expect(chatMessagesEqual(makeMsg({ images: imgs }), makeMsg({ images: imgs }))).toBe(true);
  });

  it('equal when images have same URLs in same order', () => {
    const a = makeMsg({ images: [{ url: 'https://example.com/a.png' }] });
    const b = makeMsg({ images: [{ url: 'https://example.com/a.png' }] });
    expect(chatMessagesEqual(a, b)).toBe(true);
  });

  it('not equal when image URLs differ', () => {
    const a = makeMsg({ images: [{ url: 'https://example.com/a.png' }] });
    const b = makeMsg({ images: [{ url: 'https://example.com/b.png' }] });
    expect(chatMessagesEqual(a, b)).toBe(false);
  });

  it('not equal when image array lengths differ', () => {
    const a = makeMsg({ images: [{ url: 'https://example.com/a.png' }] });
    const b = makeMsg({ images: [] });
    expect(chatMessagesEqual(a, b)).toBe(false);
  });

  it('not equal when one has images and the other does not', () => {
    const a = makeMsg({ images: [{ url: 'https://example.com/a.png' }] });
    const b = makeMsg();
    expect(chatMessagesEqual(a, b)).toBe(false);
  });
});

describe('chatMessagesEqual — files field', () => {
  it('equal when both have no files', () => {
    expect(chatMessagesEqual(makeMsg(), makeMsg())).toBe(true);
  });

  it('equal when files have same URLs', () => {
    const a = makeMsg({ files: [{ url: 'file://a.pdf', name: 'a.pdf', mimeType: 'application/pdf' }] });
    const b = makeMsg({ files: [{ url: 'file://a.pdf', name: 'a.pdf', mimeType: 'application/pdf' }] });
    expect(chatMessagesEqual(a, b)).toBe(true);
  });

  it('not equal when file URLs differ', () => {
    const a = makeMsg({ files: [{ url: 'file://a.pdf', name: 'a.pdf', mimeType: 'application/pdf' }] });
    const b = makeMsg({ files: [{ url: 'file://b.pdf', name: 'b.pdf', mimeType: 'application/pdf' }] });
    expect(chatMessagesEqual(a, b)).toBe(false);
  });

  it('not equal when file count differs', () => {
    const a = makeMsg({ files: [{ url: 'file://a.pdf', name: 'a.pdf', mimeType: 'application/pdf' }] });
    const b = makeMsg({ files: [] });
    expect(chatMessagesEqual(a, b)).toBe(false);
  });

  it('not equal when one has files and other has undefined', () => {
    const a = makeMsg({ files: [{ url: 'file://a.pdf', name: 'a.pdf', mimeType: 'application/pdf' }] });
    const b = makeMsg();
    expect(chatMessagesEqual(a, b)).toBe(false);
  });
});

describe('chatMessagesEqual — toolCalls field', () => {
  it('equal when both have no toolCalls', () => {
    expect(chatMessagesEqual(makeMsg(), makeMsg())).toBe(true);
  });

  it('equal when toolCalls have same id, status, result', () => {
    const calls = [{ id: 'tc-1', name: 'bash', status: 'completed' as const, result: 'ok' }];
    const a = makeMsg({ toolCalls: calls });
    const b = makeMsg({ toolCalls: [{ id: 'tc-1', name: 'bash', status: 'completed' as const, result: 'ok' }] });
    expect(chatMessagesEqual(a, b)).toBe(true);
  });

  it('not equal when toolCall status differs', () => {
    const a = makeMsg({ toolCalls: [{ id: 'tc-1', name: 'bash', status: 'pending' as const }] });
    const b = makeMsg({ toolCalls: [{ id: 'tc-1', name: 'bash', status: 'completed' as const }] });
    expect(chatMessagesEqual(a, b)).toBe(false);
  });

  it('not equal when toolCall count differs', () => {
    const a = makeMsg({ toolCalls: [{ id: 'tc-1', name: 'bash', status: 'pending' as const }] });
    const b = makeMsg({ toolCalls: [] });
    expect(chatMessagesEqual(a, b)).toBe(false);
  });
});

describe('chatMessagesEqual — parts field', () => {
  it('equal when both have no parts', () => {
    expect(chatMessagesEqual(makeMsg(), makeMsg())).toBe(true);
  });

  it('equal when parts have same id, kind, and text', () => {
    const a = makeMsg({ parts: [{ kind: 'text' as const, id: 'p-1', text: 'hello' }] });
    const b = makeMsg({ parts: [{ kind: 'text' as const, id: 'p-1', text: 'hello' }] });
    expect(chatMessagesEqual(a, b)).toBe(true);
  });

  it('not equal when part text differs', () => {
    const a = makeMsg({ parts: [{ kind: 'text' as const, id: 'p-1', text: 'hello' }] });
    const b = makeMsg({ parts: [{ kind: 'text' as const, id: 'p-1', text: 'world' }] });
    expect(chatMessagesEqual(a, b)).toBe(false);
  });

  it('not equal when part count differs', () => {
    const a = makeMsg({ parts: [{ kind: 'text' as const, id: 'p-1', text: 'hello' }] });
    const b = makeMsg({ parts: [] });
    expect(chatMessagesEqual(a, b)).toBe(false);
  });

  it('equal with empty parts arrays', () => {
    expect(chatMessagesEqual(makeMsg({ parts: [] }), makeMsg({ parts: [] }))).toBe(true);
  });
});

describe('chatMessagesEqual — thinkingBlocks field', () => {
  it('equal when both have no thinkingBlocks', () => {
    expect(chatMessagesEqual(makeMsg(), makeMsg())).toBe(true);
  });

  it('equal when thinkingBlocks match', () => {
    const blocks = [{ id: 'tb-1', content: 'reasoning...', isExpanded: false }];
    const a = makeMsg({ thinkingBlocks: blocks });
    const b = makeMsg({ thinkingBlocks: [{ id: 'tb-1', content: 'reasoning...', isExpanded: false }] });
    expect(chatMessagesEqual(a, b)).toBe(true);
  });

  it('not equal when thinkingBlock content differs', () => {
    const a = makeMsg({ thinkingBlocks: [{ id: 'tb-1', content: 'A', isExpanded: false }] });
    const b = makeMsg({ thinkingBlocks: [{ id: 'tb-1', content: 'B', isExpanded: false }] });
    expect(chatMessagesEqual(a, b)).toBe(false);
  });

  it('not equal when one has thinkingBlocks and other has undefined', () => {
    const a = makeMsg({ thinkingBlocks: [{ id: 'tb-1', content: 'A', isExpanded: false }] });
    const b = makeMsg();
    expect(chatMessagesEqual(a, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mergeMessagesPreservingIdentity — isAborted, streaming flags, empty parts
// ---------------------------------------------------------------------------

describe('mergeMessagesPreservingIdentity — streaming and isAborted', () => {
  it('returns next when isStreaming toggles true → false', () => {
    const prev = makeMsg({ isStreaming: true });
    const next = makeMsg({ isStreaming: false });
    const result = mergeMessagesPreservingIdentity([prev], [next]);
    expect(result[0]).toBe(next);
  });

  it('returns prev when isStreaming stays false (treated as equal)', () => {
    const prev = makeMsg({ isStreaming: false });
    const next = makeMsg({ isStreaming: false });
    const result = mergeMessagesPreservingIdentity([prev], [next]);
    expect(result[0]).toBe(prev);
  });

  it('returns next when interrupted becomes true', () => {
    const prev = makeMsg({ interrupted: false });
    const next = makeMsg({ interrupted: true });
    const result = mergeMessagesPreservingIdentity([prev], [next]);
    expect(result[0]).toBe(next);
  });

  it('returns prev when both have empty parts arrays', () => {
    const prev = makeMsg({ parts: [] });
    const next = makeMsg({ parts: [] });
    const result = mergeMessagesPreservingIdentity([prev], [next]);
    expect(result[0]).toBe(prev);
  });

  it('returns next when parts array grows', () => {
    const prev = makeMsg({ parts: [] });
    const next = makeMsg({ parts: [{ kind: 'text' as const, id: 'p-1', text: 'hello' }] });
    const result = mergeMessagesPreservingIdentity([prev], [next]);
    expect(result[0]).toBe(next);
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
