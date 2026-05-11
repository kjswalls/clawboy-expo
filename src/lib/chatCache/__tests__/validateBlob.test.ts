import { describe, it, expect } from '@jest/globals';
import { parseCachedSessionBlob } from '../validateBlob';

const MIN_MSG = {
  id: 'msg-1',
  role: 'user',
  content: 'hello',
  timestamp: '2025-01-01T00:00:00.000Z',
};

describe('parseCachedSessionBlob', () => {
  // ---------------------------------------------------------------------------
  // Migration: v1 → v4
  // ---------------------------------------------------------------------------

  it('migrates a v1 blob to v3 with empty drafts and no snapshots', () => {
    const raw = {
      version: 1,
      profileId: 'prof-1',
      sessionKey: 'sess-1',
      updatedAt: 1_700_000_000_000,
      messages: [MIN_MSG],
    };
    const result = parseCachedSessionBlob(raw, 'prof-1');
    expect(result).not.toBeNull();
    expect(result!.version).toBe(4);
    expect(result!.drafts).toEqual({});
    expect(result!.agent).toBeUndefined();
    expect(result!.model).toBeUndefined();
    expect(result!.profileId).toBe('prof-1');
    expect(result!.messages).toHaveLength(1);
  });

  it('migrates a v1 blob with deprecated agentId/modelId into minimal snapshots', () => {
    const raw = {
      version: 1,
      profileId: 'prof-1',
      sessionKey: 'sess-1',
      updatedAt: 1_700_000_000_000,
      messages: [MIN_MSG],
      agentId: 'main',
      modelId: 'gpt-4o',
    };
    const result = parseCachedSessionBlob(raw, 'prof-1');
    expect(result).not.toBeNull();
    expect(result!.version).toBe(4);
    expect(result!.agent).toEqual({ id: 'main', name: 'main' });
    expect(result!.model).toEqual({ id: 'gpt-4o', name: 'gpt-4o' });
  });

  // ---------------------------------------------------------------------------
  // Migration: v2 → v4
  // ---------------------------------------------------------------------------

  it('migrates a v2 blob to v3 and preserves drafts', () => {
    const draft = { text: 'unfinished thought', attachments: [], updatedAt: 1_700_000_001_000 };
    const raw = {
      version: 2,
      profileId: 'prof-1',
      sessionKey: 'sess-1',
      updatedAt: 1_700_000_000_000,
      messages: [MIN_MSG],
      drafts: { 'sess-1': draft },
    };
    const result = parseCachedSessionBlob(raw, 'prof-1');
    expect(result).not.toBeNull();
    expect(result!.version).toBe(4);
    expect(result!.drafts['sess-1']).toEqual(draft);
    expect(result!.agent).toBeUndefined();
    expect(result!.model).toBeUndefined();
  });

  it('migrates a v2 blob with deprecated agentId/modelId into minimal snapshots', () => {
    const raw = {
      version: 2,
      profileId: 'prof-1',
      sessionKey: 'sess-1',
      updatedAt: 1_700_000_000_000,
      messages: [MIN_MSG],
      drafts: {},
      agentId: 'coder',
      modelId: 'claude-3-5-sonnet',
    };
    const result = parseCachedSessionBlob(raw, 'prof-1');
    expect(result).not.toBeNull();
    expect(result!.version).toBe(4);
    expect(result!.agent).toEqual({ id: 'coder', name: 'coder' });
    expect(result!.model).toEqual({ id: 'claude-3-5-sonnet', name: 'claude-3-5-sonnet' });
  });

  it('treats v2 blob missing drafts key as empty drafts', () => {
    const raw = {
      version: 2,
      profileId: 'prof-1',
      sessionKey: 'sess-1',
      updatedAt: 1_700_000_000_000,
      messages: [MIN_MSG],
      // drafts intentionally omitted
    };
    const result = parseCachedSessionBlob(raw, 'prof-1');
    expect(result).not.toBeNull();
    expect(result!.drafts).toEqual({});
  });

  // ---------------------------------------------------------------------------
  // v4 round-trip
  // ---------------------------------------------------------------------------

  it('parses a v3 blob with full agent and model snapshots', () => {
    const raw = {
      version: 3,
      profileId: 'prof-1',
      sessionKey: 'sess-1',
      updatedAt: 1_700_000_000_000,
      messages: [MIN_MSG],
      drafts: {},
      agent: { id: 'main', name: 'Main Agent', emoji: '🤖', dotBg: '#F59E0B' },
      model: { id: 'gpt-4o', name: 'GPT-4o', providerSlug: 'openai', dotBg: '#10A37F' },
    };
    const result = parseCachedSessionBlob(raw, 'prof-1');
    expect(result).not.toBeNull();
    expect(result!.version).toBe(4);
    expect(result!.agent).toEqual({ id: 'main', name: 'Main Agent', emoji: '🤖', dotBg: '#F59E0B' });
    expect(result!.model).toEqual({ id: 'gpt-4o', name: 'GPT-4o', providerSlug: 'openai', dotBg: '#10A37F' });
  });

  it('parses a v3 blob with no agent or model snapshots', () => {
    const raw = {
      version: 3,
      profileId: 'prof-1',
      sessionKey: 'sess-1',
      updatedAt: 1_700_000_000_000,
      messages: [MIN_MSG],
      drafts: {},
    };
    const result = parseCachedSessionBlob(raw, 'prof-1');
    expect(result).not.toBeNull();
    expect(result!.agent).toBeUndefined();
    expect(result!.model).toBeUndefined();
  });

  it('ignores a malformed agent snapshot (missing name)', () => {
    const raw = {
      version: 3,
      profileId: 'prof-1',
      sessionKey: 'sess-1',
      updatedAt: 1_700_000_000_000,
      messages: [MIN_MSG],
      drafts: {},
      agent: { id: 'main' }, // name missing
      model: { id: 'gpt-4o', name: 'GPT-4o' },
    };
    const result = parseCachedSessionBlob(raw, 'prof-1');
    expect(result).not.toBeNull();
    expect(result!.agent).toBeUndefined();
    expect(result!.model).not.toBeUndefined();
  });

  it('ignores a malformed model snapshot (not an object)', () => {
    const raw = {
      version: 3,
      profileId: 'prof-1',
      sessionKey: 'sess-1',
      updatedAt: 1_700_000_000_000,
      messages: [MIN_MSG],
      drafts: {},
      agent: { id: 'main', name: 'Main' },
      model: 'not-an-object',
    };
    const result = parseCachedSessionBlob(raw, 'prof-1');
    expect(result).not.toBeNull();
    expect(result!.agent).not.toBeUndefined();
    expect(result!.model).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Error cases (unchanged behaviour)
  // ---------------------------------------------------------------------------

  it('returns null for a mismatched profileId', () => {
    const raw = {
      version: 3,
      profileId: 'prof-other',
      sessionKey: 'sess-1',
      updatedAt: 1_700_000_000_000,
      messages: [MIN_MSG],
      drafts: {},
    };
    expect(parseCachedSessionBlob(raw, 'prof-1')).toBeNull();
  });

  it('returns null for an unknown version', () => {
    const raw = {
      version: 99,
      profileId: 'prof-1',
      sessionKey: 'sess-1',
      updatedAt: 1_700_000_000_000,
      messages: [MIN_MSG],
    };
    expect(parseCachedSessionBlob(raw, 'prof-1')).toBeNull();
  });

  it('returns null when messages array is empty after filtering', () => {
    const raw = {
      version: 3,
      profileId: 'prof-1',
      sessionKey: 'sess-1',
      updatedAt: 1_700_000_000_000,
      messages: [{ id: 'x' }],
      drafts: {},
    };
    expect(parseCachedSessionBlob(raw, 'prof-1')).toBeNull();
  });

  it('strips non-ChatMessage entries from messages array', () => {
    const raw = {
      version: 3,
      profileId: 'prof-1',
      sessionKey: 'sess-1',
      updatedAt: 1_700_000_000_000,
      messages: [
        { id: 'bad' }, // missing role/content/timestamp
        MIN_MSG,
      ],
      drafts: {},
    };
    const result = parseCachedSessionBlob(raw, 'prof-1');
    expect(result).not.toBeNull();
    expect(result!.messages).toHaveLength(1);
    expect(result!.messages[0]!.id).toBe('msg-1');
  });
});
