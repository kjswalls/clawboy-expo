/**
 * Badge event emit functions.
 *
 * All functions are synchronous fire-and-forget.
 * They check enabledAt first — if null (disabled), return immediately.
 * No message content, clipboard content, file content, URLs, or filenames
 * are ever passed to these functions.
 *
 * Callers pass the tracker ref:
 *   import { getBadgeTracker } from '@/badges/events';
 *   getBadgeTracker().messageSent({ ... });
 *
 * The tracker singleton is initialized in useBadgeTracker(). Before init,
 * all calls are no-ops.
 */

import type { BadgeTrackerInterface } from './tracker';

// ─── Singleton tracker ref ────────────────────────────────────────────────────

let _tracker: BadgeTrackerInterface | null = null;

export function registerBadgeTracker(t: BadgeTrackerInterface): void {
  _tracker = t;
}

export function unregisterBadgeTracker(): void {
  _tracker = null;
}

// ─── Emit API ─────────────────────────────────────────────────────────────────

export interface MessageSentPayload {
  /** Local hour of the send (0-23). */
  localHour: number;
  /** Local minute of the send (0-59). */
  localMinute: number;
  /** Local YYYY-MM-DD date string. */
  localDateKey: string;
  /** Model ID active at time of send (e.g. "claude-3-5-sonnet"). */
  modelId: string | null;
  /** Number of messages in this session including the one being sent. */
  sessionMessageCount: number;
  /** Number of attachments included (not their content). */
  attachmentCount: number;
  /** True if any attachment is of type 'audio'. */
  hasVoiceAttachment: boolean;
  /**
   * Peak context ratio for this session (used / total). Pass null if unknown.
   * When ratio < 0.10, session counts toward Lean Machine.
   */
  leanRatio: number | null;
}

export function emitMessageSent(payload: MessageSentPayload): void {
  _tracker?.onMessageSent(payload);
}

export function emitSessionCreated(): void {
  _tracker?.onSessionCreated();
}

export interface ModelSetPayload {
  modelId: string;
  /** True if a conversation was already started when the model was changed. */
  midConversation: boolean;
  /** True if the model has reasoning/thinking capability. */
  isReasoning?: boolean;
}

export function emitModelSet(payload: ModelSetPayload): void {
  _tracker?.onModelSet(payload);
}

export function emitSlashCmdExec(cmdId: string): void {
  _tracker?.onSlashCmdExec(cmdId);
}

export function emitToolResult(success: boolean): void {
  _tracker?.onToolResult(success);
}

export function emitThemeToggled(): void {
  _tracker?.onThemeToggled();
}

export function emitAbortGen(): void {
  _tracker?.onAbortGen();
}

export function emitProfileSwitched(profileId: string): void {
  _tracker?.onProfileSwitched(profileId);
}

export function emitFeedbackSent(): void {
  _tracker?.onFeedbackSent();
}

export function emitGumaTapped(): void {
  _tracker?.onGumaTapped();
}

export function emitKonamiTriggered(): void {
  _tracker?.onKonamiTriggered();
}

export function emitAgentUsed(agentId: string): void {
  _tracker?.onAgentUsed(agentId);
}

export function emitClipboardAction(): void {
  _tracker?.onClipboardAction();
}
