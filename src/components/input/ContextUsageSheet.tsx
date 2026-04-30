import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { formatTokenCount } from '@/lib/formatTokens';
import { useTranslation } from 'react-i18next';

interface ContextUsageSheetProps {
  visible: boolean;
  onClose: () => void;
  modelName?: string;
  contextWindow?: number;
  contextUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

interface StatRowProps {
  label: string;
  value: string;
  valueColor?: string;
}

function StatRow({ label, value, valueColor }: StatRowProps): React.JSX.Element {
  const { colors } = useThemeContext();
  return (
    <View style={styles.statRow}>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor ?? colors.foreground }]}>{value}</Text>
    </View>
  );
}

export function ContextUsageSheet({
  visible,
  onClose,
  modelName,
  contextWindow,
  contextUsed,
  inputTokens,
  outputTokens,
  totalTokens,
}: ContextUsageSheetProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const pct =
    contextUsed !== undefined && contextWindow !== undefined && contextWindow > 0
      ? Math.round((contextUsed / contextWindow) * 100)
      : null;

  const ctxColor =
    pct === null
      ? colors.foreground
      : pct >= 90
        ? colors.destructive
        : pct >= 75
          ? '#F59E0B'
          : colors.foreground;

  const ctxDisplay = (() => {
    const usedStr = contextUsed !== undefined ? formatTokenCount(contextUsed) : '—';
    const totalStr = contextWindow !== undefined ? formatTokenCount(contextWindow) : '—';
    const pctStr = pct !== null ? ` (${pct}%)` : '';
    return `${usedStr} / ${totalStr}${pctStr}`;
  })();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              marginBottom: Math.max(insets.bottom + 16, 32),
            },
          ]}
          onPress={() => {/* prevent backdrop close */}}
        >
          {/* Header */}
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
              {t('input.contextSheet.title')}
            </Text>
            {modelName ? (
              <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                {modelName}
                {contextWindow ? ` · ${formatTokenCount(contextWindow)} ${t('input.contextSheet.window')}` : ''}
              </Text>
            ) : null}
          </View>

          {/* Stats */}
          <View style={styles.statsBlock}>
            <StatRow label={t('input.contextSheet.contextUsed')} value={ctxDisplay} valueColor={ctxColor} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <StatRow
              label={t('input.contextSheet.inputTokens')}
              value={inputTokens !== undefined ? formatTokenCount(inputTokens) : '—'}
            />
            <StatRow
              label={t('input.contextSheet.outputTokens')}
              value={outputTokens !== undefined ? formatTokenCount(outputTokens) : '—'}
            />
            <StatRow
              label={t('input.contextSheet.totalTokens')}
              value={totalTokens !== undefined ? formatTokenCount(totalTokens) : '—'}
            />
          </View>

          {/* Footer */}
          <Text style={[styles.footer, { color: colors.mutedForeground }]}>
            {t('input.contextSheet.footer')}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.lg,
  },
  sheet: {
    borderRadius: BorderRadius['2xl'],
    borderWidth: 1,
    overflow: 'hidden',
  },
  sheetHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  sheetTitle: {
    fontSize: FontSize.base,
    fontWeight: '600',
  },
  sheetSubtitle: {
    fontSize: FontSize.sm,
  },
  statsBlock: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: 2,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  statLabel: {
    fontSize: FontSize.sm,
  },
  statValue: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    textAlign: 'right',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  footer: {
    fontSize: 11,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    paddingTop: 4,
    lineHeight: 15,
  },
});
