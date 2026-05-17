import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import i18n from '@/i18n';

interface LogFooterProps {
  filteredCount: number;
  totalCount: number;
  levelCounts: { warn: number; error: number; debug: number };
  spanLabel: string | null;
  bufferPct: number;
  maxLines: number;
  path: string | null;
  /** Directory hint shown when path is null and gateway is using the dated default. */
  pathHint: string | null;
  bottomInset: number;
  onPress: () => void;
  colors: ThemeColors;
  t: ReturnType<typeof import('react-i18next').useTranslation>['t'];
}

export function LogFooter({
  filteredCount,
  totalCount,
  levelCounts,
  spanLabel,
  bufferPct,
  maxLines,
  path,
  pathHint,
  bottomInset,
  onPress,
  colors,
  t,
}: LogFooterProps): React.JSX.Element {
  const a11yLabel = (() => {
    const parts: string[] = [];
    const countPart = filteredCount !== totalCount
      ? t('gatewayLogs.access.footerShown', { filtered: filteredCount, total: totalCount })
      : t('gatewayLogs.access.footerLines', { count: totalCount });
    parts.push(countPart);
    if (levelCounts.warn > 0) parts.push(t('gatewayLogs.access.footerWarnings', { count: levelCounts.warn }));
    if (levelCounts.error > 0) parts.push(t('gatewayLogs.access.footerErrors', { count: levelCounts.error }));
    if (spanLabel) parts.push(spanLabel);
    parts.push(
      path
        ? t('gatewayLogs.access.footerPath', { path })
        : pathHint
          ? t('gatewayLogs.access.footerPathHint', { dir: pathHint })
          : t('gatewayLogs.access.footerNoPath')
    );
    return parts.join('. ');
  })();

  return (
    <Pressable
      onPress={onPress}
      disabled={!path}
      style={({ pressed }) => [
        footerStyles.footer,
        { borderTopColor: colors.border, paddingBottom: bottomInset || 8 },
        pressed && path ? { opacity: 0.6 } : undefined,
      ]}
      accessibilityLabel={a11yLabel}
    >
      <Text style={[footerStyles.footerPrimary, { color: colors.foreground }]}>
        {filteredCount !== totalCount
          ? t('gatewayLogs.footer.shownOf', {
              filtered: filteredCount.toLocaleString(i18n.language),
              total: totalCount.toLocaleString(i18n.language),
            })
          : t('gatewayLogs.footer.lines', { count: totalCount.toLocaleString(i18n.language) })}
        {levelCounts.warn > 0 ? (
          <Text>
            <Text style={{ color: colors.mutedForeground }}>{'  ·  '}</Text>
            <Text style={{ color: colors.warning }}>{'● '}</Text>
            <Text>{`${levelCounts.warn} ${t('gatewayLogs.footer.warn')}`}</Text>
          </Text>
        ) : null}
        {levelCounts.error > 0 ? (
          <Text>
            <Text style={{ color: colors.mutedForeground }}>{'  ·  '}</Text>
            <Text style={{ color: colors.destructive }}>{'● '}</Text>
            <Text>{`${levelCounts.error} ${t('gatewayLogs.footer.err')}`}</Text>
          </Text>
        ) : null}
        {levelCounts.debug > 0 ? (
          <Text>
            <Text style={{ color: colors.mutedForeground }}>{'  ·  '}</Text>
            <Text style={{ color: colors.mutedForeground }}>{'● '}</Text>
            <Text>{`${levelCounts.debug} ${t('gatewayLogs.footer.debug')}`}</Text>
          </Text>
        ) : null}
      </Text>

      <Text style={[footerStyles.footerSecondary, { color: colors.mutedForeground }]}>
        {spanLabel ?? '—'}
        {'  ·  '}
        {t('gatewayLogs.footer.buffered', {
          count: totalCount.toLocaleString(i18n.language),
          max: maxLines.toLocaleString(i18n.language),
          pct: bufferPct,
        })}
      </Text>

      <Text
        style={[footerStyles.footerPath, { color: colors.mutedForeground }]}
        numberOfLines={path || pathHint ? 1 : 2}
        ellipsizeMode={path ? 'middle' : 'tail'}
      >
        {path
          ? path
          : pathHint
            ? t('gatewayLogs.footer.pathHint', { dir: pathHint })
            : t('gatewayLogs.footer.noPath')}
      </Text>
    </Pressable>
  );
}

const footerStyles = StyleSheet.create({
  footer: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Spacing.sm,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerPrimary: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
  footerSecondary: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  footerPath: {
    fontSize: FontSize.xs - 1,
    textAlign: 'center',
    opacity: 0.65,
    maxWidth: '100%',
  },
});
