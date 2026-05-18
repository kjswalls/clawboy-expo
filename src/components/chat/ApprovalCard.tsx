import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import type { PendingApproval } from '@/types/approvals';
import type { ExecApprovalDecision } from '@/lib/openclaw/nodes';

interface ApprovalCardProps {
  approvals: PendingApproval[];
  onDecide: (approvalId: string, decision: ExecApprovalDecision) => void;
  isConnected: boolean;
}

export function ApprovalCard({ approvals, onDecide, isConnected }: ApprovalCardProps): React.JSX.Element | null {
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const clamped = Math.min(index, approvals.length - 1);
  const current = approvals[clamped];

  // Auto-advance to next pending when current resolves
  useEffect(() => {
    if (!current || current.status === 'pending' || current.status === 'resolving') return;
    const nextIdx = approvals.findIndex((a, i) => i > clamped && a.status === 'pending');
    if (nextIdx >= 0) setIndex(nextIdx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.status]);

  const isExpired = current ? nowMs > current.expiresAtMs : false;
  const effectiveStatus = isExpired && current?.status === 'pending' ? 'expired' : current?.status;

  const canAct = isConnected && effectiveStatus === 'pending';
  const canRetry = isConnected && effectiveStatus === 'failed';

  const handleDecide = useCallback(
    (decision: ExecApprovalDecision) => {
      if (!current || !canAct) return;
      onDecide(current.approvalId, decision);
    },
    [current, canAct, onDecide]
  );

  if (!current) return null;

  const showAllow = current.allowedDecisions.includes('allow-once');
  const showAllowAlways = current.allowedDecisions.includes('allow-always');

  return (
    <View style={[s.card, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <View style={s.headerLeft}>
          <ShieldAlert size={14} color={colors.mutedForeground} strokeWidth={2} />
          <Text style={[s.headerTitle, { color: colors.mutedForeground }]}>
            Exec approval required
          </Text>
        </View>
        {approvals.length > 1 ? (
          <View style={s.headerRight}>
            <Text style={[s.counter, { color: colors.mutedForeground }]}>
              {clamped + 1} of {approvals.length}
            </Text>
            <View style={s.navButtons}>
              <Pressable
                onPress={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={clamped === 0}
                accessibilityRole="button"
                accessibilityLabel="Previous approval"
                style={({ pressed }) => [s.navBtn, { opacity: clamped === 0 ? 0.3 : pressed ? 0.6 : 1 }]}
              >
                <ChevronUp size={16} color={colors.mutedForeground} strokeWidth={2} />
              </Pressable>
              <Pressable
                onPress={() => setIndex((i) => Math.min(approvals.length - 1, i + 1))}
                disabled={clamped === approvals.length - 1}
                accessibilityRole="button"
                accessibilityLabel="Next approval"
                style={({ pressed }) => [
                  s.navBtn,
                  { opacity: clamped === approvals.length - 1 ? 0.3 : pressed ? 0.6 : 1 },
                ]}
              >
                <ChevronDown size={16} color={colors.mutedForeground} strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      {/* Body */}
      <View style={s.body}>
        <Text style={[s.commandLabel, { color: colors.foreground, fontFamily: 'monospace' }]} numberOfLines={3}>
          {current.commandPreview ?? current.command}
        </Text>
        {current.host ? (
          <Text style={[s.metaLine, { color: colors.mutedForeground }]}>host: {current.host}</Text>
        ) : null}
        {current.cwd ? (
          <Text style={[s.metaLine, { color: colors.mutedForeground }]}>cwd: {current.cwd}</Text>
        ) : null}
        {current.agentId ? (
          <Text style={[s.metaLine, { color: colors.mutedForeground }]}>agent: {current.agentId}</Text>
        ) : null}
        {current.warningText ? (
          <View style={[s.warning, { backgroundColor: colors.destructive + '22', borderColor: colors.destructive }]}>
            <Text style={[s.warningText, { color: colors.destructive }]}>{current.warningText}</Text>
          </View>
        ) : null}
      </View>

      {/* Status overlay for non-pending states */}
      {effectiveStatus !== 'pending' && effectiveStatus !== 'resolving' ? (
        <View style={[s.statusRow, { borderTopColor: colors.border }]}>
          {effectiveStatus === 'resolved' ? (
            <Text style={[s.statusText, { color: colors.mutedForeground }]}>
              {current.resolvedBy
                ? `Resolved on another device (${current.resolvedBy})`
                : `Resolved: ${current.decision ?? ''}`}
            </Text>
          ) : effectiveStatus === 'expired' ? (
            <Text style={[s.statusText, { color: colors.mutedForeground }]}>Request expired</Text>
          ) : effectiveStatus === 'failed' ? (
            <>
              <Text style={[s.statusText, { color: colors.destructive }]}>Failed to send decision</Text>
              <Pressable
                onPress={() => current.decision && canRetry && onDecide(current.approvalId, current.decision)}
                disabled={!canRetry}
                accessibilityRole="button"
                style={({ pressed }) => [s.retryBtn, { borderColor: colors.border, opacity: canRetry ? (pressed ? 0.6 : 1) : 0.4 }]}
              >
                <Text style={[s.retryBtnText, { color: colors.foreground }]}>Retry</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}

      {/* Action buttons */}
      {effectiveStatus === 'pending' || effectiveStatus === 'resolving' ? (
        <View style={[s.actions, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={() => handleDecide('deny')}
            disabled={!canAct}
            accessibilityRole="button"
            accessibilityLabel="Deny"
            style={({ pressed }) => [
              s.actionBtn,
              { borderColor: colors.destructive, opacity: canAct ? (pressed ? 0.7 : 1) : 0.4 },
            ]}
          >
            <Text style={[s.actionBtnText, { color: colors.destructive }]}>Deny</Text>
          </Pressable>
          {showAllow ? (
            <Pressable
              onPress={() => handleDecide('allow-once')}
              disabled={!canAct}
              accessibilityRole="button"
              accessibilityLabel="Allow once"
              style={({ pressed }) => [
                s.actionBtn,
                { borderColor: colors.border, opacity: canAct ? (pressed ? 0.7 : 1) : 0.4 },
              ]}
            >
              <Text style={[s.actionBtnText, { color: colors.foreground }]}>Allow once</Text>
            </Pressable>
          ) : null}
          {showAllowAlways ? (
            <Pressable
              onPress={() => handleDecide('allow-always')}
              disabled={!canAct}
              accessibilityRole="button"
              accessibilityLabel="Allow always"
              style={({ pressed }) => [
                s.actionBtn,
                { backgroundColor: colors.secondary, borderColor: colors.border, opacity: canAct ? (pressed ? 0.92 : 1) : 0.4 },
              ]}
            >
              <Text style={[s.actionBtnText, { color: colors.foreground }]}>Allow always</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius['2xl'],
    paddingVertical: Spacing.xs,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
  counter: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
  navButtons: {
    flexDirection: 'row',
    gap: 2,
  },
  navBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.sm,
  },
  body: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.xs,
    gap: 4,
  },
  commandLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  metaLine: {
    fontSize: FontSize.xs,
  },
  warning: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  warningText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  statusText: {
    fontSize: FontSize.xs,
    flex: 1,
  },
  retryBtn: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  retryBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
});
