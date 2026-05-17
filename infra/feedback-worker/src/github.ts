import type { Env, FeedbackRequest } from './types';
import { LEAK_PATTERNS } from './leakPatterns';
import { safeText } from './http';

const RECENT_LOGS_MAX = 32_768;

interface UploadResult {
  ok: true;
}
interface UploadError {
  ok: false;
  message: string;
}

/**
 * Uploads a base64 file to the GitHub repo contents API. If the file already
 * exists at that path (e.g. a retry after a transient failure), fetches its
 * current SHA and updates it in place so the submission succeeds cleanly.
 *
 * The caller constructs the public URL via the worker's own attachment proxy
 * route — we intentionally discard GH's `download_url` here because it is a
 * short-lived signed token that would expire before anyone opens the issue.
 */
export async function putOrUpdateFile(
  env: Env,
  path: string,
  contentBase64: string,
  branch: string,
): Promise<UploadResult | UploadError> {
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${encodeURIComponent(path)}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_PAT}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'clawboy-feedback-worker',
  };

  const tryPut = async (sha?: string): Promise<UploadResult | UploadError> => {
    const body: Record<string, string> = {
      message: `feedback attachment`,
      content: contentBase64,
      branch,
    };
    if (sha) body['sha'] = sha;

    const res = await fetch(apiBase, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (res.ok) {
      await res.arrayBuffer(); // drain body
      return { ok: true };
    }
    const text = await safeText(res);
    return { ok: false, message: `GitHub contents API ${res.status}: ${text.slice(0, 200)}` };
  };

  const first = await tryPut();
  if (first.ok) return first;

  // 409 or 422 usually means the file already exists (retry scenario).
  // GET the existing file to retrieve its SHA, then update.
  const getRes = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, { headers });
  if (!getRes.ok) {
    return first; // Return the original error if we can't resolve the conflict.
  }
  const existing = (await getRes.json()) as { sha?: string };
  if (typeof existing.sha !== 'string') return first;

  return tryPut(existing.sha);
}

interface IssueResult {
  ok: true;
  issueUrl: string;
  issueNumber: number;
}
interface IssueError {
  ok: false;
  message: string;
}

export async function createIssue(env: Env, req: FeedbackRequest, screenshotUrls: string[]): Promise<IssueResult | IssueError> {
  const titlePrefix = req.kind === 'bug' ? '[Bug]' : '[Feature]';
  const issueTitle = `${titlePrefix} ${req.title}`;
  const issueBody = renderIssueBody(req, screenshotUrls);
  const labels = [env.APP_LABEL, req.kind === 'bug' ? 'bug' : 'enhancement', 'needs-triage'];

  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/issues`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_PAT}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'clawboy-feedback-worker',
      },
      body: JSON.stringify({ title: issueTitle, body: issueBody, labels }),
    },
  );

  if (!res.ok) {
    const text = await safeText(res);
    return { ok: false, message: `GitHub API ${res.status}: ${text.slice(0, 200)}` };
  }
  const data = (await res.json()) as { html_url: string; number: number };
  return { ok: true, issueUrl: data.html_url, issueNumber: data.number };
}

export function renderIssueBody(req: FeedbackRequest, screenshotUrls: string[]): string {
  const lines: string[] = [];
  lines.push(req.body.trim());
  lines.push('');

  if (screenshotUrls.length > 0) {
    lines.push('### Screenshots');
    lines.push('');
    for (let i = 0; i < screenshotUrls.length; i++) {
      lines.push(`![Screenshot ${i + 1}](${screenshotUrls[i]})`);
    }
    lines.push('');
  }

  if (req.diagnostics) {
    lines.push('<details><summary>Diagnostics</summary>');
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('| --- | --- |');
    const d = req.diagnostics;
    const row = (label: string, value: string | number | null | undefined): void => {
      if (value === null || value === undefined || value === '') return;
      lines.push(`| ${label} | \`${escapeTableCell(String(value))}\` |`);
    };
    row('App version', d.appVersion);
    row('Build number', d.buildNumber);
    row('Update ID', d.updateId);
    row('Platform', d.platform);
    row('OS', [d.osName, d.osVersion].filter(Boolean).join(' ') || null);
    row('Device', d.deviceModel);
    row('Brand', d.deviceBrand);
    row('Manufacturer', d.deviceManufacturer);
    row('Year class', d.deviceYearClass);
    row('Locale', d.locale);
    row('Time zone', d.timeZone);
    if (d.connection) {
      const c = d.connection;
      row('Connection', c.status);
      row('Conn error', c.errorCode);
      row('Conn hint', c.hint);
      row('Server version', c.serverVersion);
      if (c.reconnectGeneration !== undefined) row('Reconnect gen', c.reconnectGeneration);
      if (c.pinningEnabled !== undefined) row('Pinning', c.pinningEnabled ? 'enabled' : 'disabled');
      if (c.pinMismatch) row('Pin mismatch', 'yes');
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  if (req.recentLogs) {
    const scrubbed = scrubLogsServer(req.recentLogs);
    lines.push('<details><summary>Recent logs (scrubbed)</summary>');
    lines.push('');
    lines.push('```');
    lines.push(scrubbed);
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  if (req.contact) {
    lines.push(`> Contact: ${escapeMarkdownInline(req.contact)}`);
    lines.push('');
  }

  lines.push('<sub>Submitted via the in-app feedback form.</sub>');
  return lines.join('\n');
}

/**
 * Re-run LEAK_PATTERNS over the log string on the server as a second defence
 * layer. Truncate to 32 KiB after scrubbing to prevent very long logs from
 * inflating the issue body.
 */
export function scrubLogsServer(logs: string): string {
  let out = logs;
  for (const re of LEAK_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, '[redacted]');
  }
  if (out.length > RECENT_LOGS_MAX) {
    out = out.slice(0, RECENT_LOGS_MAX) + '\n…[truncated]';
  }
  return out;
}

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
}

function escapeMarkdownInline(s: string): string {
  return s.replace(/[<>`]/g, (c) => `\\${c}`);
}
