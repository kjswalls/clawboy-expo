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

import type { OpenClawClient as _OpenClawClientClass } from '@/lib/openclaw/client';
// Mapped type extracts only the public surface (private members are excluded from keyof).
type _OpenClawClientPublic = { [K in keyof _OpenClawClientClass]: _OpenClawClientClass[K] };
import type { Session, Agent, CronJob, Skill, Node } from '@/lib/openclaw/types';
import type { ChatHistoryResult } from '@/lib/openclaw/chat';
import type { CommandEntry } from '@/lib/openclaw/commands';
import type { HooksState } from '@/lib/openclaw/hooks';
import type { LogsTailParams, LogsTailResult } from '@/lib/openclaw/logs';
import type { ExecApprovalsFile, ExecApprovalsResponse, ExecApprovalDecision, DevicePairListResponse } from '@/lib/openclaw/nodes';
import type { CreateAgentParams, CreateAgentResult, DeleteAgentResult } from '@/lib/openclaw/agents';
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
import { generateUUID } from '@/lib/openclaw/utils';
import {
  loadDemoUserSessions,
  saveDemoUserSessions,
  loadDemoHistory,
  saveDemoHistory,
  loadDemoSessionOverrides,
  saveDemoSessionOverrides,
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

export class DemoOpenClawClient implements _OpenClawClientPublic {
  /** Mirrors OpenClawClient.url so useChat can read it for media URL construction. */
  public readonly url: string = DEMO_URL;
  /** Mirrors public serverVersion field. */
  public serverVersion: string | null = 'Demo';
  /** Mirrors minClientVersion (unused in demo). */
  public minClientVersion: string | null = null;

  /** Mirrors OpenClawClient.getGatewayUrl — used by useChat for media URL resolution. */
  getGatewayUrl(): string {
    return this.url;
  }

  /** Mirrors OpenClawClient.getSessionStreamText — demo has no background stream buffer. */
  getSessionStreamText(_sessionKey: string): string | null {
    return null;
  }

  private eventHandlers = new Map<string, Set<EventHandler>>();
  private primarySessionKey: string | null = null;
  private userSessions: Session[] = [];
  private sessionOverrides: Record<string, { title?: string }> = {};
  private abortSignals = new Map<string, { aborted: boolean }>();
  /** Stable streamId per session — bound at sendMessage / resetSession, read by
   *  abortChat so streamInterrupted lands on the same bubble that streamStart
   *  bound in useChat. */
  private activeStreamIds = new Map<string, string>();

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
    this.sessionOverrides = await loadDemoSessionOverrides();
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

  /** Mirrors OpenClawClient.lastActivityAt — demo is always considered fresh. */
  get lastActivityAt(): number {
    return Date.now();
  }

  /** Mirrors OpenClawClient.isAlive — offline demo has no real socket. */
  isAlive(): boolean {
    return this.isConnected;
  }

  /** Mirrors OpenClawClient.probeNow — no RPC; demo is always reachable. */
  async probeNow(_timeoutMs = 4000): Promise<boolean> {
    return true;
  }

  /** Mirrors OpenClawClient.hasActiveStream — in-flight demo script per session. */
  hasActiveStream(sessionKey: string): boolean {
    return this.abortSignals.has(sessionKey);
  }

  /** Mirrors OpenClawClient.hasAnyActiveStream — true if any demo script is in flight. */
  hasAnyActiveStream(): boolean {
    return this.abortSignals.size > 0;
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
    return result.map((s) =>
      this.sessionOverrides[s.key]?.title ? { ...s, title: this.sessionOverrides[s.key]!.title! } : s,
    );
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
    if (this.sessionOverrides[sessionId]) {
      const { [sessionId]: _dropped, ...rest } = this.sessionOverrides;
      this.sessionOverrides = rest;
      await saveDemoSessionOverrides(this.sessionOverrides);
    }
    this.emit('sessions.changed', {});
  }

  async updateSession(sessionId: string, updates: { label?: string; model?: string }): Promise<void> {
    // Mutate userSessions for snappier in-memory lookups on user-created sessions.
    this.userSessions = this.userSessions.map((s) =>
      s.key === sessionId ? { ...s, title: updates.label ?? s.title } : s,
    );
    await saveDemoUserSessions(this.userSessions);
    // Write override so seeded sessions also persist across listSessions() regenerations.
    if (updates.label !== undefined) {
      this.sessionOverrides = { ...this.sessionOverrides, [sessionId]: { title: updates.label } };
      await saveDemoSessionOverrides(this.sessionOverrides);
    }
    this.emit('sessions.changed', {});
  }

  async resetSession(sessionKey: string): Promise<void> {
    await saveDemoHistory(sessionKey, []);
    this.emit('sessions.changed', {});
    const IS_TEST = typeof process !== 'undefined' && !!process.env.JEST_WORKER_ID;
    const delayMs = IS_TEST ? 0 : 300;
    // Simulate the gateway startup greeting.
    const sk = sessionKey;
    setTimeout(() => {
      const resetReply = i18n.t('demo.defaults.resetReply');
      const streamId = generateUUID();
      this.activeStreamIds.set(sk, streamId);
      this.emit('streamStart', { sessionKey: sk, streamId });
      this.emit('streamChunk', { text: resetReply, sessionKey: sk });
      this.emit('streamEnd', { sessionKey: sk, streamId });
      this.activeStreamIds.delete(sk);
      this.emit('message', {
        id: `reset-reply-${Date.now()}`,
        role: 'assistant',
        content: resetReply,
        timestamp: new Date().toISOString(),
        sessionKey: sk,
      });
    }, delayMs);
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

  /** No-op — demo streams via chat events; no gateway transcript subscribe. */
  async subscribeSessionMessages(_sessionKey: string): Promise<void> {
    return;
  }

  async unsubscribeSessionMessages(_sessionKey: string): Promise<void> {
    return;
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

    // Mint a streamId for this turn — propagated on every lifecycle event
    // so useChat can match streamInterrupted to the exact bubble it bound.
    const streamId = generateUUID();
    this.activeStreamIds.set(sk, streamId);

    // Emit signal that the gateway is working.
    this.emit('chatAwaitingResponse', { sessionKey: sk, streamId });

    // Run script async, then persist assistant reply.
    void runDemoScript(params.content, sk, this.emit.bind(this), signal, streamId).then(
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
        this.activeStreamIds.delete(sk);

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
    const streamId = this.activeStreamIds.get(sessionId);
    this.activeStreamIds.delete(sessionId);
    this.emit('streamInterrupted', { sessionKey: sessionId, streamId });
  }

  /** Mirrors OpenClawClient.steerSession — abort in-flight script, then send. */
  async steerSession(params: {
    sessionId: string;
    content: string;
    thinking?: boolean;
    thinkingLevel?: string | null;
    attachments?: unknown[];
  }): Promise<{ sessionKey?: string; interruptedActiveRun?: boolean }> {
    const sk = params.sessionId;
    const hadActive = this.abortSignals.has(sk);
    await this.abortChat(sk);
    await this.sendMessage({ sessionId: sk, content: params.content });
    return { sessionKey: sk, interruptedActiveRun: hadActive };
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

  // Sessions
  async getSession(_sessionKey: string): Promise<Session | null> { return null; }
  async describeSession(
    _sessionKey: string,
    _opts?: { includeDerivedTitles?: boolean; includeLastMessage?: boolean },
  ): Promise<Session | null> { return null; }
  async compactSession(_sessionId: string): Promise<void> { return; }
  async spawnSession(_agentId: string, _prompt?: string): Promise<Session> { throw new Error('not supported in demo mode'); }

  // Agents
  async getAgentFiles(_agentId: string): Promise<{ workspace: string; files: Array<{ name: string; path: string; missing: boolean; size?: number }> } | null> { return null; }
  async getAgentFile(_agentId: string, _fileName: string): Promise<{ content?: string; missing: boolean } | null> { return null; }
  async setAgentFile(_agentId: string, _fileName: string, _content: string): Promise<boolean> { return false; }
  async createAgent(_params: CreateAgentParams): Promise<CreateAgentResult> { throw new Error('not supported in demo mode'); }
  async deleteAgent(_agentId: string): Promise<DeleteAgentResult> { throw new Error('not supported in demo mode'); }

  // Skills
  async listSkills(): Promise<Skill[]> { return []; }
  async toggleSkill(_skillKey: string, _enabled: boolean): Promise<void> { return; }
  async installSkill(_skillName: string, _installId: string): Promise<void> { return; }
  async installHubSkill(_slug: string, _sessionKey?: string): Promise<void> { return; }

  // Cron Jobs
  async listCronJobs(): Promise<CronJob[]> { return []; }
  async toggleCronJob(_cronId: string, _enabled: boolean): Promise<void> { return; }
  async getCronJobDetails(_cronId: string): Promise<CronJob | null> { return null; }
  async addCronJob(_params: unknown): Promise<void> { return; }
  async updateCronJob(_id: string, _params: unknown): Promise<void> { return; }
  async removeCronJob(_id: string): Promise<void> { return; }
  async runCronJob(_id: string): Promise<void> { return; }

  // Nodes
  async listNodes(): Promise<Node[]> { return []; }
  async listDevicePairings(): Promise<DevicePairListResponse | null> { return null; }
  async getExecApprovals(): Promise<ExecApprovalsResponse | null> { return null; }
  async getNodeExecApprovals(_nodeId: string): Promise<ExecApprovalsResponse | null> { return null; }
  async setExecApprovals(_file: ExecApprovalsFile, _baseHash: string): Promise<void> { return; }
  async setNodeExecApprovals(_nodeId: string, _file: ExecApprovalsFile, _baseHash: string): Promise<void> { return; }
  async approveDevicePairing(_requestId: string): Promise<void> { return; }
  async rejectDevicePairing(_requestId: string): Promise<void> { return; }
  async removeDevice(_deviceId: string): Promise<void> { return; }
  async rotateDeviceToken(_deviceId: string, _role: string, _scopes?: string[]): Promise<void> { return; }
  async revokeDeviceToken(_deviceId: string, _role: string): Promise<void> { return; }
  async resolveExecApproval(_approvalId: string, _decision: ExecApprovalDecision): Promise<void> { return; }

  // Config
  async patchServerConfig(_patch: object, _baseHash: string): Promise<void> { return; }
  async validateServerConfig(_patch: object, _baseHash: string): Promise<{ valid: boolean; errors?: Array<{ path: string; message: string }> }> { return { valid: true }; }

  // Hooks
  async fetchHooks(): Promise<HooksState> { return { hooks: [], hooksConfig: {}, configHash: '' }; }
  async toggleHookEnabled(_hookId: string, _enabled: boolean): Promise<void> { return; }
  async toggleInternalHooksEnabled(_enabled: boolean): Promise<void> { return; }
  async updateHookEnv(_hookId: string, _env: Record<string, string>): Promise<void> { return; }

  // Features (TTS / Voicewake)
  async setTtsEnable(_enable: boolean): Promise<null> { return null; }
  async setTtsProvider(_provider: string): Promise<null> { return null; }
  async getVoicewake(): Promise<null> { return null; }
  async setVoicewake(_params: unknown): Promise<null> { return null; }

  // Logs
  async tailLogs(_params?: LogsTailParams): Promise<LogsTailResult> { return { path: '', cursor: 0, size: 0, lines: [] }; }

  // Generic RPC — not available in demo
  async call<T = unknown>(_method: string, _params?: unknown, _options?: { timeoutMs?: number }): Promise<T> { throw new Error('not supported in demo mode'); }

  emitFakeExecApprovalRequested(opts?: {
    command?: string;
    warningText?: string;
    allowedDecisions?: ExecApprovalDecision[];
  }): void {
    const now = Date.now();
    this.emit('execApprovalRequested', {
      id: `demo-${now}`,
      createdAtMs: now,
      expiresAtMs: now + 5 * 60 * 1000,
      request: {
        command: opts?.command ?? 'rm -rf /tmp/example',
        commandPreview: opts?.command ?? 'rm -rf /tmp/example',
        sessionKey: this.primarySessionKey,
        host: 'sandbox',
        warningText: opts?.warningText ?? null,
        allowedDecisions: opts?.allowedDecisions ?? ['allow-once', 'allow-always', 'deny'],
        agentId: 'demo-agent',
      },
    });
  }
  async getToolsCatalog(): Promise<Array<{ name: string; description?: string; provenance?: string; enabled?: boolean }>> { return []; }
  async getTtsStatus(): Promise<{ enabled: boolean; provider: string | null }> {
    return { enabled: false, provider: null };
  }
  async getTtsProviders(): Promise<{ providers: unknown[] }> {
    return { providers: [] };
  }
  async getUsageStatus(): Promise<null> { return null; }
  async getUsageCost(): Promise<null> { return null; }
  async getSessionsUsage(_params?: { days?: number; limit?: number }): Promise<null> { return null; }
  async getServerConfig(): Promise<{ config: unknown; hash: string }> {
    return { config: {}, hash: '' };
  }
  async getAgentIdentity(_agentId: string): Promise<null> { return null; }

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

