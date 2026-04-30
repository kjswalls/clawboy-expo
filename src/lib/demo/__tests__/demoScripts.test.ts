/**
 * Tests for the keyword-routing demo script engine.
 * Timing is stripped in Jest (JEST_WORKER_ID is set) so all delays are 0ms.
 */

import { runDemoScript } from '../demoScripts';

type EmittedEvent = { event: string; payload: unknown };

function makeEmitter(): {
  emit: (event: string, payload: unknown) => void;
  events: EmittedEvent[];
} {
  const events: EmittedEvent[] = [];
  return {
    emit: (event: string, payload: unknown) => events.push({ event, payload }),
    events,
  };
}

describe('runDemoScript keyword routing', () => {
  it('emits chatAwaitingResponse first', async () => {
    const { emit, events } = makeEmitter();
    await runDemoScript('hello', 'sk-1', emit, { aborted: false });
    expect(events[0]!.event).toBe('chatAwaitingResponse');
  });

  it('emits streamStart before text chunks', async () => {
    const { emit, events } = makeEmitter();
    await runDemoScript('hello', 'sk-1', emit, { aborted: false });
    const streamStartIdx = events.findIndex((e) => e.event === 'streamStart');
    const firstChunkIdx = events.findIndex((e) => e.event === 'streamChunk');
    expect(streamStartIdx).toBeGreaterThanOrEqual(0);
    expect(firstChunkIdx).toBeGreaterThan(streamStartIdx);
  });

  it('emits streamEnd before message', async () => {
    const { emit, events } = makeEmitter();
    await runDemoScript('hello', 'sk-1', emit, { aborted: false });
    const streamEndIdx = events.findIndex((e) => e.event === 'streamEnd');
    const msgIdx = events.findIndex((e) => e.event === 'message');
    expect(streamEndIdx).toBeGreaterThanOrEqual(0);
    expect(msgIdx).toBeGreaterThan(streamEndIdx);
  });

  it('routes /joke/ keyword to joke script (includes "bug")', async () => {
    const { emit, events } = makeEmitter();
    await runDemoScript('tell me a joke', 'sk-joke', emit, { aborted: false });
    const msg = events.find((e) => e.event === 'message')?.payload as Record<string, unknown>;
    expect(typeof msg.content).toBe('string');
    // Joke script includes the word "bug"
    expect((msg.content as string).toLowerCase()).toMatch(/bug/);
  });

  it('routes /code/ keyword to code script (includes typescript)', async () => {
    const { emit, events } = makeEmitter();
    await runDemoScript('write me some code', 'sk-code', emit, { aborted: false });
    const msg = events.find((e) => e.event === 'message')?.payload as Record<string, unknown>;
    expect((msg.content as string).toLowerCase()).toMatch(/typescript/);
  });

  it('emits toolCall events when tool is in the script', async () => {
    const { emit, events } = makeEmitter();
    await runDemoScript('write me some code', 'sk-tool', emit, { aborted: false });
    const toolCalls = events.filter((e) => e.event === 'toolCall');
    expect(toolCalls.length).toBeGreaterThanOrEqual(2); // start + result
  });

  it('returns includeImage=true for image keyword', async () => {
    const { emit } = makeEmitter();
    const result = await runDemoScript('show me a sunset photo', 'sk-img', emit, { aborted: false });
    expect(result.includeImage).toBe(true);
  });

  it('returns includeImage=false for non-image keyword', async () => {
    const { emit } = makeEmitter();
    const result = await runDemoScript('tell me a joke', 'sk-j2', emit, { aborted: false });
    expect(result.includeImage).toBeFalsy();
  });

  it('aborts immediately when signal is already set', async () => {
    const { emit, events } = makeEmitter();
    const signal = { aborted: true };
    await runDemoScript('hello', 'sk-abort', emit, signal);
    // Only the chatAwaitingResponse was emitted before the first delay check
    const names = events.map((e) => e.event);
    expect(names).not.toContain('message');
  });
});
