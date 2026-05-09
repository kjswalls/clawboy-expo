import {
  composeAgentsMdContent,
  ensureAgentsMdInstalled,
  uninstallAgentsMd,
} from '../openclaw/installConventions';
import {
  AGENTS_MD_END,
  AGENTS_MD_START,
  buildAgentsMdSection,
} from '../openclaw/clientContext';

// ---------------------------------------------------------------------------
// composeAgentsMdContent (pure)
// ---------------------------------------------------------------------------

describe('composeAgentsMdContent', () => {
  it('produces just the managed section (with trailing newline) when input is empty', () => {
    const out = composeAgentsMdContent('');
    expect(out.startsWith(AGENTS_MD_START)).toBe(true);
    expect(out.trimEnd().endsWith(AGENTS_MD_END)).toBe(true);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('appends the managed section after existing user content', () => {
    const user = '# My Agent\n\nDo cool things.\n';
    const out = composeAgentsMdContent(user);
    expect(out.startsWith('# My Agent')).toBe(true);
    expect(out).toContain('Do cool things.');
    expect(out).toContain(AGENTS_MD_START);
    expect(out).toContain(AGENTS_MD_END);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('replaces an existing managed block instead of stacking duplicates', () => {
    const user = '# Header\n';
    const installed = composeAgentsMdContent(user);
    const reinstalled = composeAgentsMdContent(installed);
    // Exactly one start/end marker pair after reinstall.
    const startCount = (reinstalled.match(/clawboy:managed-start/g) ?? []).length;
    const endCount = (reinstalled.match(/clawboy:managed-end/g) ?? []).length;
    expect(startCount).toBe(1);
    expect(endCount).toBe(1);
    // User header is preserved.
    expect(reinstalled).toContain('# Header');
  });

  it('preserves user content placed AFTER an existing managed block on update', () => {
    // Hypothetical: user manually edited their AGENTS.md to include a section
    // below our managed block. Our composer should preserve it.
    const user = '# Header\n';
    const installed = composeAgentsMdContent(user);
    const userAfter = `${installed}\n## My footer notes\n\nimportant\n`;
    const recomposed = composeAgentsMdContent(userAfter);
    expect(recomposed).toContain('# Header');
    expect(recomposed).toContain('My footer notes');
    expect(recomposed).toContain('important');
    // And there's still exactly one managed block.
    const startCount = (recomposed.match(/clawboy:managed-start/g) ?? []).length;
    expect(startCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ensureAgentsMdInstalled — uses a tiny in-memory mock client
// ---------------------------------------------------------------------------

interface MockClient {
  files: Map<string, string>;
  getCalls: number;
  setCalls: number;
  getThrows?: Error;
  setThrows?: Error;
  getReturnsNull?: boolean;
  setReturnsFalse?: boolean;
  getAgentFile: (
    agentId: string,
    name: string,
  ) => Promise<{ content?: string; missing: boolean } | null>;
  setAgentFile: (
    agentId: string,
    name: string,
    content: string,
  ) => Promise<boolean>;
}

function createMockClient(seed?: Record<string, string>): MockClient {
  const files = new Map<string, string>(Object.entries(seed ?? {}));
  const mock: MockClient = {
    files,
    getCalls: 0,
    setCalls: 0,
    getAgentFile: async (agentId: string, name: string) => {
      mock.getCalls += 1;
      if (mock.getThrows) throw mock.getThrows;
      if (mock.getReturnsNull) return null;
      const key = `${agentId}/${name}`;
      const content = files.get(key);
      return content === undefined
        ? { missing: true }
        : { content, missing: false };
    },
    setAgentFile: async (agentId: string, name: string, content: string) => {
      mock.setCalls += 1;
      if (mock.setThrows) throw mock.setThrows;
      if (mock.setReturnsFalse) return false;
      const key = `${agentId}/${name}`;
      files.set(key, content);
      return true;
    },
  };
  return mock;
}

// Cast the mock to OpenClawClient — we only ever call the two methods listed.
type AnyClient = Parameters<typeof ensureAgentsMdInstalled>[0];

describe('ensureAgentsMdInstalled', () => {
  it('creates AGENTS.md when missing', async () => {
    const c = createMockClient();
    const result = await ensureAgentsMdInstalled(c as unknown as AnyClient, 'main');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mode).toBe('created');
    }
    expect(c.files.get('main/AGENTS.md')).toBeDefined();
    expect(c.files.get('main/AGENTS.md')!).toContain('clawboy:managed-start');
  });

  it('appends to an existing AGENTS.md without managed block', async () => {
    const c = createMockClient({ 'main/AGENTS.md': '# Existing\n\nSome content.\n' });
    const result = await ensureAgentsMdInstalled(c as unknown as AnyClient, 'main');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mode).toBe('appended');
    }
    const out = c.files.get('main/AGENTS.md')!;
    expect(out).toContain('# Existing');
    expect(out).toContain('Some content.');
    expect(out).toContain('clawboy:managed-start');
  });

  it('replaces an existing (older) managed block in place', async () => {
    // Seed an "older" managed block — the start marker wouldn't match the
    // current version-tagged marker exactly, but our strip regex accepts any
    // version. Composer should detect the existing managed block, strip it,
    // and append the current one.
    const olderBlock =
      '<!-- clawboy:managed-start v0 -->\nold convention text\n<!-- clawboy:managed-end -->';
    const seed = `# Existing\n\n${olderBlock}\n`;
    const c = createMockClient({ 'main/AGENTS.md': seed });
    const result = await ensureAgentsMdInstalled(c as unknown as AnyClient, 'main');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mode).toBe('replaced');
    }
    const out = c.files.get('main/AGENTS.md')!;
    expect((out.match(/clawboy:managed-start/g) ?? []).length).toBe(1);
    expect(out).toContain('# Existing');
    expect(out).not.toContain('old convention text');
  });

  it('reports noop when the file already matches what we would write', async () => {
    const c = createMockClient();
    // First install → creates file.
    await ensureAgentsMdInstalled(c as unknown as AnyClient, 'main');
    // Second install with no other changes → should noop.
    const result = await ensureAgentsMdInstalled(c as unknown as AnyClient, 'main');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mode).toBe('noop');
    }
    expect(c.setCalls).toBe(1);
  });

  it('returns no_workspace when getAgentFile returns null', async () => {
    const c = createMockClient();
    c.getReturnsNull = true;
    const result = await ensureAgentsMdInstalled(c as unknown as AnyClient, 'main');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('no_workspace');
    }
  });

  it('returns rpc_failed when getAgentFile throws', async () => {
    const c = createMockClient();
    c.getThrows = new Error('boom');
    const result = await ensureAgentsMdInstalled(c as unknown as AnyClient, 'main');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('rpc_failed');
      expect(result.message).toContain('boom');
    }
  });

  it('returns rpc_failed when setAgentFile throws', async () => {
    const c = createMockClient();
    c.setThrows = new Error('write denied');
    const result = await ensureAgentsMdInstalled(c as unknown as AnyClient, 'main');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('rpc_failed');
      expect(result.message).toContain('write denied');
    }
  });

  it('returns rpc_failed when setAgentFile returns false', async () => {
    const c = createMockClient();
    c.setReturnsFalse = true;
    const result = await ensureAgentsMdInstalled(c as unknown as AnyClient, 'main');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('rpc_failed');
    }
  });
});

// ---------------------------------------------------------------------------
// uninstallAgentsMd
// ---------------------------------------------------------------------------

describe('uninstallAgentsMd', () => {
  it('removes the managed block and preserves user content', async () => {
    const user = '# Custom\n\nMy content.\n';
    const seed = `${user}\n${buildAgentsMdSection()}\n`;
    const c = createMockClient({ 'main/AGENTS.md': seed });
    const result = await uninstallAgentsMd(c as unknown as AnyClient, 'main');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mode).toBe('removed');
    }
    const out = c.files.get('main/AGENTS.md')!;
    expect(out).toContain('# Custom');
    expect(out).toContain('My content.');
    expect(out.includes('clawboy:managed-')).toBe(false);
  });

  it('produces empty file when only the managed block was present', async () => {
    const seed = `${buildAgentsMdSection()}\n`;
    const c = createMockClient({ 'main/AGENTS.md': seed });
    const result = await uninstallAgentsMd(c as unknown as AnyClient, 'main');
    expect(result.ok).toBe(true);
    expect(c.files.get('main/AGENTS.md')!).toBe('');
  });

  it('reports noop when AGENTS.md has no managed block', async () => {
    const c = createMockClient({ 'main/AGENTS.md': '# Existing\n\nOnly user.\n' });
    const result = await uninstallAgentsMd(c as unknown as AnyClient, 'main');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mode).toBe('noop');
    }
    // No write should have happened.
    expect(c.setCalls).toBe(0);
  });

  it('reports noop when AGENTS.md does not exist at all', async () => {
    const c = createMockClient();
    const result = await uninstallAgentsMd(c as unknown as AnyClient, 'main');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mode).toBe('noop');
    }
  });

  it('returns no_workspace when getAgentFile returns null', async () => {
    const c = createMockClient();
    c.getReturnsNull = true;
    const result = await uninstallAgentsMd(c as unknown as AnyClient, 'main');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('no_workspace');
    }
  });
});
