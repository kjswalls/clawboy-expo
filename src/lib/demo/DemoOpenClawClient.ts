/**
 * DemoOpenClawClient — offline scripted stand-in for OpenClawClient.
 *
 * Implements the same public surface that useChat / useSessions / useAgents /
 * useModels / useCommands actually call. TypeScript structural typing means
 * it can be assigned to `React.MutableRefObject<OpenClawClient | null>` via
 * a cast inside useConnection (the only place the swap happens).
 *
 * Keeps session list and message histories in AsyncStorage via demoStorage.ts
 * so demo turns survive app restarts.
 */

import type { Session, Agent } from '@/lib/openclaw/types';
import type { ChatHistoryResult } from '@/lib/openclaw/chat';
import type { CommandEntry } from '@/lib/openclaw/commands';
import type { Model } from '@/types';
import i18n from '@/i18n';
import {
  makeDemoSessions,
  getDemoAgents,
  getDemoModels,
  getDemoCommands,
  getWelcomeHistory,
  getCodegenHistory,
  getMediaHistory,
  demoSessionKey,
  type DemoHistoryMessage,
} from './demoData';
import { runDemoScript, getDemoScriptReply } from './demoScripts';
import {
  loadDemoUserSessions,
  saveDemoUserSessions,
  loadDemoHistory,
  saveDemoHistory,
} from './demoStorage';
import { getSunsetAssetUri } from './demoAssets';

type EventHandler = (...args: unknown[]) => void;

// ---------------------------------------------------------------------------
// Sentinel URL — never points to a real host
// ---------------------------------------------------------------------------

const DEMO_URL = 'demo://local';

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class DemoOpenClawClient {
  /** Mirrors OpenClawClient.url so useChat can read it for media URL construction. */
  public readonly url: string = DEMO_URL;
  /** Mirrors public serverVersion field. */
  public serverVersion: string | null = 'Demo';
  /** Mirrors minClientVersion (unused in demo). */
  public minClientVersion: string | null = null;

  private eventHandlers = new Map<string, Set<EventHandler>>();
  private primarySessionKey: string | null = null;
  private userSessions: Session[] = [];
  private abortSignals = new Map<string, { aborted: boolean }>();

  // ---------------------------------------------------------------------------
  // Event bus — exact API mirror of OpenClawClient
  // ---------------------------------------------------------------------------

  on(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    }
  }

  emit(event: string, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(event);
    handlers?.forEach((handler) => {
      try {
        handler(...args);
      } catch {
        /* ignore */
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle — no-ops (useConnection drives state externally)
  // ---------------------------------------------------------------------------

  async connect(): Promise<void> {
    // Load any sessions the user previously created in demo.
    const stored = await loadDemoUserSessions();
    this.userSessions = stored;
  }

  disconnect(): void {
    // Abort any in-flight script but keep event handler registrations intact —
    // consumers re-register once (on mount) and expect them to survive a
    // background-disconnect / reconnect cycle.
    this.abortSignals.forEach((s) => {
      s.aborted = true;
    });
    this.abortSignals.clear();
  }

  get isConnected(): boolean {
    return true;
  }

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  getActiveSessionKey(): string | null {
    return this.primarySessionKey;
  }

  setPrimarySessionKey(key: string | null): void {
    this.primarySessionKey = key;
  }

  async listSessions(): Promise<Session[]> {
    // Generate fresh seeded sessions on each call so relative timestamps
    // (e.g. "2 mins ago") remain accurate across app restarts.
    const allKeys = new Set<string>();
    const result: Session[] = [];
    for (const s of [...makeDemoSessions(), ...this.userSessions]) {
      if (!allKeys.has(s.key)) {
        allKeys.add(s.key);
        result.push(s);
      }
    }
    return result;
  }

  async createSession(_agentId?: string): Promise<Session> {
    const key = demoSessionKey();
    const now = new Date().toISOString();
    const s: Session = {
      id: key,
      key,
      title: i18n.t('demo.defaults.newChat'),
      agentId: 'demo-general',
      createdAt: now,
      updatedAt: now,
    };
    this.userSessions = [s, ...this.userSessions];
    await saveDemoUserSessions(this.userSessions);
    // Let useSessions know.
    this.emit('sessions.changed', {});
    return s;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.userSessions = this.userSessions.filter((s) => s.key !== sessionId);
    await saveDemoUserSessions(this.userSessions);
    this.emit('sessions.changed', {});
  }

  async updateSession(sessionId: string, updates: { label?: string; model?: string }): Promise<void> {
    // Rename — only relevant for user-created sessions.
    this.userSessions = this.userSessions.map((s) =>
      s.key === sessionId ? { ...s, title: updates.label ?? s.title } : s,
    );
    await saveDemoUserSessions(this.userSessions);
  }

  async resetSession(sessionKey: string): Promise<void> {
    await saveDemoHistory(sessionKey, []);
    this.emit('sessions.changed', {});
    // Simulate the gateway startup greeting.
    const sk = sessionKey;
    setTimeout(() => {
      const resetReply = i18n.t('demo.defaults.resetReply');
      this.emit('streamChunk', { text: resetReply, sessionKey: sk });
      this.emit('streamEnd', { sessionKey: sk });
      this.emit('message', {
        id: `reset-reply-${Date.now()}`,
        role: 'assistant',
        content: resetReply,
        timestamp: new Date().toISOString(),
        sessionKey: sk,
      });
    }, 300);
  }

  // ---------------------------------------------------------------------------
  // Chat history
  // ---------------------------------------------------------------------------

  async getSessionMessages(sessionId: string): Promise<ChatHistoryResult> {
    const seededGetter = SEEDED_HISTORY_GETTERS[sessionId];
    let history: DemoHistoryMessage[];
    if (seededGetter) {
      // Pre-seeded sessions: use fixed history + any appended turns from storage.
      // Resolve the getter fresh so locale changes take effect.
      const extra = await loadDemoHistory(sessionId);
      history = extra.length > 0 ? extra : seededGetter();
    } else {
      history = await loadDemoHistory(sessionId);
    }

    // Resolve the sunset asset URI once per getSessionMessages call so tests
    // and app code always see a valid URI rather than the placeholder sentinel.
    const sunsetUri = await getSunsetAssetUri();

    // Map DemoHistoryMessage → openclaw Message (minus toolCalls).
    // Keep empty-content assistant rows when they carry thinking or toolCalls —
    // those render as thinking/tool bubbles and must not be stripped.
    const messages = history
      .filter(
        (m) =>
          m.role !== 'assistant' ||
          m.content !== '' ||
          !!m.thinking ||
          (m.toolCalls && m.toolCalls.length > 0),
      )
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        thinking: m.thinking,
        images: m.images
          ? m.images.map((img) => ({
              ...img,
              url: img.url === '__demo_asset_sunset__' ? sunsetUri : img.url,
            }))
          : undefined,
        audioUrl: m.audioUrl,
      }));

    // Synthesize flat toolCalls for mergeHistoryToolCalls compatibility.
    const toolCalls: ChatHistoryResult['toolCalls'] = [];
    history.forEach((m) => {
      if (m.toolCalls && m.role === 'assistant') {
        m.toolCalls.forEach((tc) => {
          toolCalls.push({
            toolCallId: tc.id,
            name: tc.name,
            phase: 'result',
            result: tc.result,
            args: tc.args,
            afterMessageId: m.id,
          });
        });
      }
    });

    return { messages, toolCalls };
  }

  // ---------------------------------------------------------------------------
  // Send message — drives the scripted reply engine
  // ---------------------------------------------------------------------------

  async sendMessage(params: {
    sessionId?: string;
    content: string;
    agentId?: string;
  }): Promise<{ sessionKey?: string }> {
    const sk = params.sessionId ?? this.primarySessionKey ?? 'demo:welcome';

    // Cancel any previous in-flight script for this session.
    const prevSignal = this.abortSignals.get(sk);
    if (prevSignal) prevSignal.aborted = true;

    const signal = { aborted: false };
    this.abortSignals.set(sk, signal);

    // Persist the user message.
    const userMsg: DemoHistoryMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: params.content,
      timestamp: new Date().toISOString(),
    };
    const existing = await this._loadMutableHistory(sk);
    const next = [...existing, userMsg];
    await saveDemoHistory(sk, next);

    // Emit signal that the gateway is working.
    this.emit('chatAwaitingResponse', { sessionKey: sk });

    // Run script async, then persist assistant reply.
    void runDemoScript(params.content, sk, this.emit.bind(this), signal).then(
      async ({ finalMessageId, includeImage }) => {
        if (signal.aborted) return;

        const hist = await this._loadMutableHistory(sk);
        const assistantMsg: DemoHistoryMessage = {
          id: finalMessageId,
          role: 'assistant',
          content: getDemoScriptReply(params.content),
          timestamp: new Date().toISOString(),
          images: includeImage
            ? [{ url: await getSunsetAssetUri(), mimeType: 'image/jpeg', alt: i18n.t('demo.defaults.imageAlt') }]
            : undefined,
        };
        await saveDemoHistory(sk, [...hist, assistantMsg]);
        this.abortSignals.delete(sk);

        // Update session preview.
        this._touchSession(sk, params.content);
      },
    );

    return { sessionKey: sk };
  }

  async abortChat(sessionId: string): Promise<void> {
    const signal = this.abortSignals.get(sessionId);
    if (signal) {
      signal.aborted = true;
      this.abortSignals.delete(sessionId);
    }
    this.emit('streamInterrupted', { sessionKey: sessionId });
  }

  // ---------------------------------------------------------------------------
  // Agents / Models / Commands — return static demo data
  // ---------------------------------------------------------------------------

  async listAgents(): Promise<Agent[]> {
    return getDemoAgents();
  }

  async listModels(): Promise<Model[]> {
    return getDemoModels();
  }

  async listCommands(_params?: unknown): Promise<CommandEntry[]> {
    return getDemoCommands();
  }

  // ---------------------------------------------------------------------------
  // Stubs — return empty; existing UIs handle empty gracefully
  // ---------------------------------------------------------------------------

  async listSkills(): Promise<unknown[]> { return []; }
  async listCronJobs(): Promise<unknown[]> { return []; }
  async listNodes(): Promise<unknown[]> { return []; }
  async listDevicePairings(): Promise<null> { return null; }
  async getExecApprovals(): Promise<null> { return null; }
  async getToolsCatalog(): Promise<unknown[]> { return []; }
  async getTtsStatus(): Promise<{ enabled: boolean; provider: string | null }> {
    return { enabled: false, provider: null };
  }
  async getTtsProviders(): Promise<{ providers: unknown[] }> {
    return { providers: [] };
  }
  async getUsageStatus(): Promise<null> { return null; }
  async getUsageCost(): Promise<null> { return null; }
  async getSessionsUsage(): Promise<null> { return null; }
  async getServerConfig(): Promise<{ config: unknown; hash: string }> {
    return { config: {}, hash: '' };
  }
  async getAgentIdentity(_agentId: string): Promise<null> { return null; }
  async fetchHooks(): Promise<{ hooks: unknown[] }> { return { hooks: [] }; }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _loadMutableHistory(sessionKey: string): Promise<DemoHistoryMessage[]> {
    const seededGetter = SEEDED_HISTORY_GETTERS[sessionKey];
    if (seededGetter) {
      const stored = await loadDemoHistory(sessionKey);
      return stored.length > 0 ? stored : [...seededGetter()];
    }
    return await loadDemoHistory(sessionKey);
  }

  private _touchSession(sessionKey: string, lastMessage: string): void {
    const now = new Date().toISOString();
    const isUser = this.userSessions.some((s) => s.key === sessionKey);
    if (isUser) {
      this.userSessions = this.userSessions.map((s) =>
        s.key === sessionKey ? { ...s, updatedAt: now, lastMessage: lastMessage.slice(0, 120) } : s,
      );
      void saveDemoUserSessions(this.userSessions);
    }
    this.emit('sessions.changed', {});
  }
}

// ---------------------------------------------------------------------------
// Seeded history lookup
// ---------------------------------------------------------------------------

import { DEMO_SESSION_WELCOME, DEMO_SESSION_CODEGEN, DEMO_SESSION_MEDIA } from './demoData';

const SEEDED_HISTORY_GETTERS: Record<string, () => DemoHistoryMessage[]> = {
  [DEMO_SESSION_WELCOME]: getWelcomeHistory,
  [DEMO_SESSION_CODEGEN]: getCodegenHistory,
  [DEMO_SESSION_MEDIA]: getMediaHistory,
};

