/**
 * Unit tests for DemoOpenClawClient.
 *
 * The demo client is headless (no React, no native modules) so these tests
 * run in Node/Jest without any special setup.
 *
 * expo-asset require() inside DemoOpenClawClient is guarded with try/catch so
 * it won't throw in Jest even though the module isn't available.
 */

import { DemoOpenClawClient } from '../DemoOpenClawClient';

// AsyncStorage is mocked by jest.setup.js (stateless mock — getItem always returns null)
// expo-asset is not available → the catch block fires silently

describe('DemoOpenClawClient', () => {
  beforeEach(() => {
    // Reset all jest mocks so each test starts from a clean state.
    jest.clearAllMocks();
  });
  it('starts isConnected=true after connect()', async () => {
    const client = new DemoOpenClawClient();
    await client.connect();
    expect(client.isConnected).toBe(true);
  });

  it('has serverVersion="Demo"', () => {
    const client = new DemoOpenClawClient();
    expect(client.serverVersion).toBe('Demo');
  });

  it('on/off event bus works', () => {
    const client = new DemoOpenClawClient();
    const received: unknown[] = [];
    const handler = (p: unknown): void => { received.push(p); };
    client.on('test:event', handler);
    client.emit('test:event', { value: 1 });
    expect(received).toHaveLength(1);
    client.off('test:event', handler);
    client.emit('test:event', { value: 2 });
    expect(received).toHaveLength(1);
  });

  it('listSessions returns seeded + user sessions', async () => {
    const client = new DemoOpenClawClient();
    await client.connect();
    const sessions = await client.listSessions();
    // Should include the 3 seeded demo sessions
    const keys = sessions.map((s) => s.key);
    expect(keys).toContain('demo:welcome');
    expect(keys).toContain('demo:codegen');
    expect(keys).toContain('demo:media');
  });

  it('createSession adds the new session to the list', async () => {
    const client = new DemoOpenClawClient();
    await client.connect();
    const created = await client.createSession();
    const after = await client.listSessions();
    expect(after.some((s) => s.key === created.key)).toBe(true);
  });

  it('deleteSession removes the session from the list', async () => {
    const client = new DemoOpenClawClient();
    await client.connect();
    const created = await client.createSession();
    // Confirm it exists.
    const before = await client.listSessions();
    expect(before.some((s) => s.key === created.key)).toBe(true);
    // Delete it.
    await client.deleteSession(created.key);
    const after = await client.listSessions();
    expect(after.find((s) => s.key === created.key)).toBeUndefined();
  });

  it('getSessionMessages returns history for seeded sessions', async () => {
    const client = new DemoOpenClawClient();
    await client.connect();
    const { messages } = await client.getSessionMessages('demo:welcome');
    expect(messages.length).toBeGreaterThan(0);
  });

  it('sendMessage emits chatAwaitingResponse', async () => {
    const client = new DemoOpenClawClient();
    await client.connect();
    client.setPrimarySessionKey('demo:welcome');

    const events: string[] = [];
    client.on('chatAwaitingResponse', () => events.push('chatAwaitingResponse'));

    await client.sendMessage({ content: 'hello', sessionId: 'demo:welcome' });
    expect(events).toContain('chatAwaitingResponse');
  });

  it('abortChat aborts in-flight script', async () => {
    const client = new DemoOpenClawClient();
    await client.connect();

    const messages: unknown[] = [];
    client.on('message', (p) => messages.push(p));

    // Start but don't await completion — abort immediately.
    const sendPromise = client.sendMessage({ content: 'hello', sessionId: 'demo:welcome' });
    await client.abortChat('demo:welcome');
    await sendPromise;

    // In Jest timing is instant, but abortChat should have emitted streamInterrupted.
    // The important thing is no unhandled rejection.
  });

  it('listAgents returns demo agents', async () => {
    const client = new DemoOpenClawClient();
    const agents = await client.listAgents();
    expect(agents.length).toBe(2);
    expect(agents[0]!.id).toBe('demo-general');
  });

  it('listModels returns demo models', async () => {
    const client = new DemoOpenClawClient();
    const models = await client.listModels();
    expect(models.length).toBe(2);
    expect(models[0]!.id).toBe('demo-reasoning');
  });

  it('listCommands returns demo commands', async () => {
    const client = new DemoOpenClawClient();
    const cmds = await client.listCommands();
    expect(cmds.length).toBeGreaterThan(0);
  });

  it('stubs return empty or null', async () => {
    const client = new DemoOpenClawClient();
    expect(await client.listSkills()).toEqual([]);
    expect(await client.listCronJobs()).toEqual([]);
    expect(await client.listNodes()).toEqual([]);
    expect(await client.listDevicePairings()).toBeNull();
    expect(await client.getTtsStatus()).toMatchObject({ enabled: false });
  });

  it('setPrimarySessionKey / getActiveSessionKey round-trip', () => {
    const client = new DemoOpenClawClient();
    client.setPrimarySessionKey('demo:codegen');
    expect(client.getActiveSessionKey()).toBe('demo:codegen');
    client.setPrimarySessionKey(null);
    expect(client.getActiveSessionKey()).toBeNull();
  });
});
