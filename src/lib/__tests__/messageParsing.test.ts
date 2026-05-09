/**
 * Integration tests for the openClawMessageToChat → ChatMessage.interactive chain.
 *
 * These tests cover the full path from a raw OpenClawMessage (as delivered by the
 * gateway) through openClawMessageToChat to the resulting ChatMessage, asserting
 * that the clawboy:options directive is stripped from `content` and the parsed
 * prompt ends up in `interactive`. This is the path that was previously broken by
 * the double-parse bug (C1).
 */

import { openClawMessageToChat } from '@/types';
import type { OpenClawMessage } from '@/lib/openclaw/types';

// Minimal OpenClawMessage factory.
function makeAssistantMsg(content: string): OpenClawMessage {
  return {
    id: 'msg-001',
    role: 'assistant',
    content,
    timestamp: 1_700_000_000_000,
  } as unknown as OpenClawMessage;
}

const DIRECTIVE_WITH_CHOICES = [
  'Which database should I use?',
  '',
  '<!-- clawboy:options',
  JSON.stringify({
    choices: [
      { label: 'Postgres', value: 'Use Postgres' },
      { label: 'SQLite', value: 'Use SQLite' },
    ],
    allowFreeText: false,
  }),
  '-->',
].join('\n');

describe('openClawMessageToChat → ChatMessage.interactive', () => {
  it('strips the directive from content and populates interactive', () => {
    const msg = makeAssistantMsg(DIRECTIVE_WITH_CHOICES);
    const result = openClawMessageToChat(msg);

    expect(result.content).toBe('Which database should I use?');
    expect(result.interactive).not.toBeUndefined();
    expect(result.interactive!.choices).toHaveLength(2);
    expect(result.interactive!.choices[0]!.label).toBe('Postgres');
    expect(result.interactive!.choices[1]!.label).toBe('SQLite');
    expect(result.interactive!.allowFreeText).toBe(false);
  });

  it('leaves content and interactive unchanged when no directive is present', () => {
    const plain = 'Hello, how can I help?';
    const msg = makeAssistantMsg(plain);
    const result = openClawMessageToChat(msg);

    expect(result.content).toBe(plain);
    expect(result.interactive).toBeUndefined();
  });

  it('sets interactive to undefined when the directive JSON is malformed', () => {
    const malformed = 'Some question\n<!-- clawboy:options\n{not valid json}\n-->';
    const msg = makeAssistantMsg(malformed);
    const result = openClawMessageToChat(msg);

    // Malformed directive is not stripped and interactive is not set.
    expect(result.interactive).toBeUndefined();
  });

  it('strips only valid directives and leaves prose intact', () => {
    const text = [
      'Multiple paragraphs.',
      '',
      'Pick one:',
      '',
      '<!-- clawboy:options',
      JSON.stringify({ choices: [{ label: 'A', value: 'Alpha' }] }),
      '-->',
    ].join('\n');

    const msg = makeAssistantMsg(text);
    const result = openClawMessageToChat(msg);

    expect(result.content).toContain('Multiple paragraphs.');
    expect(result.content).toContain('Pick one:');
    expect(result.content).not.toContain('clawboy:options');
    expect(result.interactive).not.toBeUndefined();
    expect(result.interactive!.choices[0]!.value).toBe('Alpha');
  });

  it('uses content from the clean text in a second openClawMessageToChat call (no double-parse regression)', () => {
    // Simulates the useChat.ts pattern where mapped.content (already clean)
    // might be passed back through another round of processing. The second
    // call must not produce a different result.
    const msg = makeAssistantMsg(DIRECTIVE_WITH_CHOICES);
    const first = openClawMessageToChat(msg);

    // Re-wrap the clean output as if it were re-ingested (the regression scenario).
    const second = openClawMessageToChat(makeAssistantMsg(first.content));
    expect(second.content).toBe(first.content);
    expect(second.interactive).toBeUndefined(); // directive already stripped; nothing to parse
  });
});
