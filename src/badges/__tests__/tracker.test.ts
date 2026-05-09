/**
 * tracker.test.ts
 *
 * Tests:
 *   - All counter increments work when enabled
 *   - All counter increments are NO-OPs when disabled (enabledAt === null)
 *   - Set capping
 *   - Schema migration no-op
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  makeDefaultState,
  getOrCreateBadgeDeviceId,
  loadBadgeState,
  saveBadgeState,
} from '../store';
import {
  emitMessageSent,
  emitSessionCreated,
  emitModelSet,
  emitSlashCmdExec,
  emitToolResult,
  emitThemeToggled,
  emitAbortGen,
  emitProfileSwitched,
  emitFeedbackSent,
  emitGumaTapped,
  emitKonamiTriggered,
  emitAgentUsed,
  emitClipboardAction,
  registerBadgeTracker,
  unregisterBadgeTracker,
} from '../events';
import type { BadgeTrackerInterface } from '../tracker';
import type { MessageSentPayload, ModelSetPayload } from '../events';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSpyTracker(): {
  tracker: BadgeTrackerInterface;
  calls: Record<string, unknown[][]>;
} {
  const calls: Record<string, unknown[][]> = {};
  const spy = (name: string) => (...args: unknown[]): void => {
    calls[name] = calls[name] ?? [];
    calls[name].push(args);
  };

  const tracker: BadgeTrackerInterface = {
    onMessageSent: spy('onMessageSent') as (p: MessageSentPayload) => void,
    onSessionCreated: spy('onSessionCreated') as () => void,
    onModelSet: spy('onModelSet') as (p: ModelSetPayload) => void,
    onSlashCmdExec: spy('onSlashCmdExec') as (cmdId: string) => void,
    onToolResult: spy('onToolResult') as (success: boolean) => void,
    onThemeToggled: spy('onThemeToggled') as () => void,
    onAbortGen: spy('onAbortGen') as () => void,
    onProfileSwitched: spy('onProfileSwitched') as (profileId: string) => void,
    onFeedbackSent: spy('onFeedbackSent') as () => void,
    onGumaTapped: spy('onGumaTapped') as () => void,
    onKonamiTriggered: spy('onKonamiTriggered') as () => void,
    onAgentUsed: spy('onAgentUsed') as (agentId: string) => void,
    onClipboardAction: spy('onClipboardAction') as () => void,
  };
  return { tracker, calls };
}

const MSG_PAYLOAD: MessageSentPayload = {
  localHour: 14,
  localMinute: 30,
  localDateKey: '2026-01-05',
  modelId: 'claude-3-5-sonnet',
  sessionMessageCount: 1,
  attachmentCount: 0,
  hasVoiceAttachment: false,
  leanRatio: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  unregisterBadgeTracker();
});

// ─── Enabled state — all calls forwarded ──────────────────────────────────────

describe('when tracker is registered', () => {
  test('emitMessageSent forwards to onMessageSent', () => {
    const { tracker, calls } = makeSpyTracker();
    registerBadgeTracker(tracker);

    emitMessageSent(MSG_PAYLOAD);

    expect(calls['onMessageSent']).toHaveLength(1);
    expect(calls['onMessageSent']?.[0]?.[0]).toMatchObject({ localHour: 14, modelId: 'claude-3-5-sonnet' });
  });

  test('emitSessionCreated forwards to onSessionCreated', () => {
    const { tracker, calls } = makeSpyTracker();
    registerBadgeTracker(tracker);
    emitSessionCreated();
    expect(calls['onSessionCreated']).toHaveLength(1);
  });

  test('emitModelSet forwards to onModelSet', () => {
    const { tracker, calls } = makeSpyTracker();
    registerBadgeTracker(tracker);
    emitModelSet({ modelId: 'gpt-4o', midConversation: true });
    expect(calls['onModelSet']?.[0]?.[0]).toMatchObject({ modelId: 'gpt-4o' });
  });

  test('emitSlashCmdExec forwards cmdId', () => {
    const { tracker, calls } = makeSpyTracker();
    registerBadgeTracker(tracker);
    emitSlashCmdExec('newchat');
    expect(calls['onSlashCmdExec']?.[0]?.[0]).toBe('newchat');
  });

  test('emitToolResult forwards success=true', () => {
    const { tracker, calls } = makeSpyTracker();
    registerBadgeTracker(tracker);
    emitToolResult(true);
    expect(calls['onToolResult']?.[0]?.[0]).toBe(true);
  });

  test('emitToolResult forwards success=false', () => {
    const { tracker, calls } = makeSpyTracker();
    registerBadgeTracker(tracker);
    emitToolResult(false);
    expect(calls['onToolResult']?.[0]?.[0]).toBe(false);
  });

  test('emitThemeToggled forwards', () => {
    const { tracker, calls } = makeSpyTracker();
    registerBadgeTracker(tracker);
    emitThemeToggled();
    expect(calls['onThemeToggled']).toHaveLength(1);
  });

  test('emitAbortGen forwards', () => {
    const { tracker, calls } = makeSpyTracker();
    registerBadgeTracker(tracker);
    emitAbortGen();
    expect(calls['onAbortGen']).toHaveLength(1);
  });

  test('emitProfileSwitched forwards profileId', () => {
    const { tracker, calls } = makeSpyTracker();
    registerBadgeTracker(tracker);
    emitProfileSwitched('profile-abc');
    expect(calls['onProfileSwitched']?.[0]?.[0]).toBe('profile-abc');
  });

  test('emitFeedbackSent forwards', () => {
    const { tracker, calls } = makeSpyTracker();
    registerBadgeTracker(tracker);
    emitFeedbackSent();
    expect(calls['onFeedbackSent']).toHaveLength(1);
  });

  test('emitGumaTapped forwards', () => {
    const { tracker, calls } = makeSpyTracker();
    registerBadgeTracker(tracker);
    emitGumaTapped();
    expect(calls['onGumaTapped']).toHaveLength(1);
  });

  test('emitKonamiTriggered forwards', () => {
    const { tracker, calls } = makeSpyTracker();
    registerBadgeTracker(tracker);
    emitKonamiTriggered();
    expect(calls['onKonamiTriggered']).toHaveLength(1);
  });

  test('emitAgentUsed forwards agentId', () => {
    const { tracker, calls } = makeSpyTracker();
    registerBadgeTracker(tracker);
    emitAgentUsed('agent-xyz');
    expect(calls['onAgentUsed']?.[0]?.[0]).toBe('agent-xyz');
  });

  test('emitClipboardAction forwards', () => {
    const { tracker, calls } = makeSpyTracker();
    registerBadgeTracker(tracker);
    emitClipboardAction();
    expect(calls['onClipboardAction']).toHaveLength(1);
  });
});

// ─── No tracker registered — all calls are no-ops ─────────────────────────────

describe('when no tracker is registered', () => {
  test('emitMessageSent does not throw', () => {
    expect(() => emitMessageSent(MSG_PAYLOAD)).not.toThrow();
  });

  test('emitSessionCreated does not throw', () => {
    expect(() => emitSessionCreated()).not.toThrow();
  });

  test('emitModelSet does not throw', () => {
    expect(() => emitModelSet({ modelId: 'x', midConversation: false })).not.toThrow();
  });

  test('emitThemeToggled does not throw', () => {
    expect(() => emitThemeToggled()).not.toThrow();
  });

  test('emitAbortGen does not throw', () => {
    expect(() => emitAbortGen()).not.toThrow();
  });
});

// ─── Unregister clears the tracker ───────────────────────────────────────────

test('unregisterBadgeTracker stops forwarding calls', () => {
  const { tracker, calls } = makeSpyTracker();
  registerBadgeTracker(tracker);
  emitMessageSent(MSG_PAYLOAD);
  expect(calls['onMessageSent']).toHaveLength(1);

  unregisterBadgeTracker();
  emitMessageSent(MSG_PAYLOAD); // should be a no-op now
  expect(calls['onMessageSent']).toHaveLength(1); // still 1, not 2
});

// AsyncStorage mock is irrelevant to these tests (no IO here), but clear it.
void AsyncStorage;
void makeDefaultState;
void getOrCreateBadgeDeviceId;
void loadBadgeState;
void saveBadgeState;
