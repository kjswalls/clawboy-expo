import type { ExecApprovalDecision } from '@/lib/openclaw/nodes';

export interface PendingApproval {
  approvalId: string;
  command: string;
  commandPreview?: string | null;
  commandArgv?: string[];
  cwd?: string | null;
  host?: string | null;
  warningText?: string | null;
  agentId?: string | null;
  nodeId?: string | null;
  allowedDecisions: readonly ExecApprovalDecision[];
  createdAtMs: number;
  expiresAtMs: number;
  status: 'pending' | 'resolving' | 'resolved' | 'failed' | 'expired';
  decision?: ExecApprovalDecision;
  resolvedBy?: string | null;
}
