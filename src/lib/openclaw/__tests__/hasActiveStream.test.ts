import { describe, it, expect } from '@jest/globals';
import { OpenClawClient } from '../client';

function makeClient(): OpenClawClient {
  return new OpenClawClient('wss://example.invalid', '', 'token', () => {
    throw new Error('wsFactory not expected to be called in this test');
  });
}

function streamMap(client: OpenClawClient): Map<string, { started: boolean; finalized: boolean }> {
  return (client as unknown as { sessionStreams: Map<string, { started: boolean; finalized: boolean }> }).sessionStreams;
}

describe('OpenClawClient.hasActiveStream', () => {
  it('returns false when no stream state exists for the key', () => {
    const client = makeClient();
    expect(client.hasActiveStream('agent:foo:cron:nightly')).toBe(false);
  });

  it('returns false for a stream that has not started yet', () => {
    const client = makeClient();
    streamMap(client).set('agent:foo:bar', { started: false, finalized: false });
    expect(client.hasActiveStream('agent:foo:bar')).toBe(false);
  });

  it('returns true while a stream is in flight (started, not finalized)', () => {
    const client = makeClient();
    streamMap(client).set('agent:foo:bar', { started: true, finalized: false });
    expect(client.hasActiveStream('agent:foo:bar')).toBe(true);
  });

  it('returns false for a finalized stream (e.g. completed cron firing)', () => {
    const client = makeClient();
    streamMap(client).set('agent:foo:cron:nightly', { started: true, finalized: true });
    expect(client.hasActiveStream('agent:foo:cron:nightly')).toBe(false);
  });
});
