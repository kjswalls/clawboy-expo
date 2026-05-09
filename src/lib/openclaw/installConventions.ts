/**
 * Install / uninstall the ClawBoy convention managed-section in an agent's
 * `AGENTS.md` workspace file via the gateway's `agents.files.get` /
 * `agents.files.set` RPCs.
 *
 * The managed section is bookended by `<!-- clawboy:managed-start -->` and
 * `<!-- clawboy:managed-end -->`. Anything outside those markers is preserved
 * byte-for-byte across install / update / uninstall flows.
 */

import type { OpenClawClient } from './client';
import {
  AGENTS_MD_END,
  AGENTS_MD_START,
  buildAgentsMdSection,
  stripAgentsMdSection,
} from './clientContext';

/** Result mode for {@link ensureAgentsMdInstalled} success cases. */
export type InstallMode = 'created' | 'replaced' | 'appended' | 'noop';

/** Result mode for {@link uninstallAgentsMd} success cases. */
export type UninstallMode = 'removed' | 'noop';

/** Discriminated result types so callers can branch on outcome reliably. */
export type InstallResult =
  | { ok: true; mode: InstallMode }
  | {
      ok: false;
      reason: 'rpc_failed' | 'no_workspace' | 'unknown';
      message: string;
    };

export type UninstallResult =
  | { ok: true; mode: UninstallMode }
  | {
      ok: false;
      reason: 'rpc_failed' | 'no_workspace' | 'unknown';
      message: string;
    };

const AGENTS_MD = 'AGENTS.md';

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : 'Unknown error';
}

/**
 * Read `AGENTS.md`, replace or append the managed section, write it back.
 *
 * - If the file is missing, a fresh `AGENTS.md` containing only the managed
 *   section is created (`created`).
 * - If the file already contains a managed block, every managed block is
 *   stripped and one fresh block is appended (`replaced`).
 * - If the file exists but has no managed block, the managed section is
 *   appended after a blank line (`appended`).
 * - If the file already matches what we'd write, no RPC is made (`noop`).
 *
 * Failures map to a typed `reason` so callers can decide whether to fall
 * back to the per-session primer path.
 */
export async function ensureAgentsMdInstalled(
  client: OpenClawClient,
  agentId: string,
): Promise<InstallResult> {
  let existing: { content?: string; missing: boolean } | null;
  try {
    existing = await client.getAgentFile(agentId, AGENTS_MD);
  } catch (err) {
    return {
      ok: false,
      reason: 'rpc_failed',
      message: `agents.files.get failed: ${errorMessage(err)}`,
    };
  }

  // `getAgentFile` returns null when the agent has no workspace at all
  // (the gateway distinguishes "missing file" — `{ missing: true }` —
  // from "no workspace" — `null`).
  if (existing === null) {
    return {
      ok: false,
      reason: 'no_workspace',
      message: 'Agent has no writable workspace',
    };
  }

  const currentContent = existing.missing ? '' : (existing.content ?? '');
  const newContent = composeAgentsMdContent(currentContent);

  if (newContent === currentContent) {
    return { ok: true, mode: 'noop' };
  }

  let ok = false;
  try {
    ok = await client.setAgentFile(agentId, AGENTS_MD, newContent);
  } catch (err) {
    return {
      ok: false,
      reason: 'rpc_failed',
      message: `agents.files.set failed: ${errorMessage(err)}`,
    };
  }

  if (!ok) {
    return {
      ok: false,
      reason: 'rpc_failed',
      message: 'agents.files.set returned false',
    };
  }

  return { ok: true, mode: classifyInstallMode(currentContent) };
}

/**
 * Remove every ClawBoy-managed block from `AGENTS.md`, leaving the rest of
 * the file intact. Returns `noop` when there was nothing to remove.
 */
export async function uninstallAgentsMd(
  client: OpenClawClient,
  agentId: string,
): Promise<UninstallResult> {
  let existing: { content?: string; missing: boolean } | null;
  try {
    existing = await client.getAgentFile(agentId, AGENTS_MD);
  } catch (err) {
    return {
      ok: false,
      reason: 'rpc_failed',
      message: `agents.files.get failed: ${errorMessage(err)}`,
    };
  }

  if (existing === null) {
    return {
      ok: false,
      reason: 'no_workspace',
      message: 'Agent has no writable workspace',
    };
  }

  const currentContent = existing.missing ? '' : (existing.content ?? '');
  if (!currentContent.includes('clawboy:managed-')) {
    return { ok: true, mode: 'noop' };
  }

  // Strip every managed block; collapse any double-blank lines the strip
  // may have left behind so we don't drift `AGENTS.md` over time.
  const stripped = stripAgentsMdSection(currentContent).replace(/\n{3,}/g, '\n\n');
  const trimmed = stripped.replace(/^\s+/, '').replace(/\s+$/, '');
  // Preserve trailing newline so editors don't reformat the file on next save.
  const newContent = trimmed.length === 0 ? '' : `${trimmed}\n`;

  if (newContent === currentContent) {
    return { ok: true, mode: 'noop' };
  }

  let ok = false;
  try {
    ok = await client.setAgentFile(agentId, AGENTS_MD, newContent);
  } catch (err) {
    return {
      ok: false,
      reason: 'rpc_failed',
      message: `agents.files.set failed: ${errorMessage(err)}`,
    };
  }

  if (!ok) {
    return {
      ok: false,
      reason: 'rpc_failed',
      message: 'agents.files.set returned false',
    };
  }

  return { ok: true, mode: 'removed' };
}

/**
 * Build the new `AGENTS.md` content string from the existing file content.
 *
 * - Empty / missing file → managed section, with trailing newline.
 * - Has any managed block → strip ALL managed blocks (defensive: handles the
 *   case where the user accidentally pasted a copy), normalize whitespace,
 *   then append one fresh managed section.
 * - No managed block → append a blank line + the managed section.
 *
 * Always returns content with a trailing newline so editors don't reformat
 * the file on next save.
 */
export function composeAgentsMdContent(existingContent: string): string {
  const stripped = stripAgentsMdSection(existingContent).replace(/\n{3,}/g, '\n\n');
  const head = stripped.replace(/^\s+/, '').replace(/\s+$/, '');
  const section = buildAgentsMdSection();

  if (head.length === 0) {
    return `${section}\n`;
  }
  return `${head}\n\n${section}\n`;
}

/**
 * Decide the result mode based on the existing file content (used after a
 * successful set call). Examines the input — not the output — so we report
 * what the install actually changed.
 */
function classifyInstallMode(existingContent: string): InstallMode {
  if (existingContent.length === 0) return 'created';
  if (existingContent.includes('clawboy:managed-')) return 'replaced';
  return 'appended';
}

// ---------------------------------------------------------------------------
// Re-exports — keep the public surface of `installConventions` self-contained
// for callers that don't need the lower-level helpers in `clientContext`.
// ---------------------------------------------------------------------------
export { AGENTS_MD_START, AGENTS_MD_END, buildAgentsMdSection };
