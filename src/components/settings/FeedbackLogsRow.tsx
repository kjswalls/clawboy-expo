import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/useTheme';
import { CompactSettingsSwitch } from './CompactSettingsSwitch';
import { getRecentLogs } from '@/lib/diagnostics/consoleBuffer';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

type Props = {
  includeLogs: boolean;
  onToggleInclude: () => void;
  showPreview: boolean;
  onTogglePreview: () => void;
};

export function FeedbackLogsRow({
  includeLogs,
  onToggleInclude,
  showPreview,
  onTogglePreview,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('feedback.sectionLogs')}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable
          onPress={onToggleInclude}
          style={({ pressed }) => [styles.toggleRow, pressed && { opacity: 0.75 }]}
          accessibilityRole="switch"
          accessibilityState={{ checked: includeLogs }}
        >
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
              {t('feedback.includeLogs')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 2 }}>
              {t('feedback.includeLogsHint')}
            </Text>
          </View>
          <CompactSettingsSwitch value={includeLogs} />
        </Pressable>

        {includeLogs ? (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Pressable
              onPress={onTogglePreview}
              style={({ pressed }) => [styles.toggleRow, pressed && { opacity: 0.75 }]}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, flex: 1 }}>
                {showPreview ? t('feedback.hidePreview') : t('feedback.showPreview')}
              </Text>
              {showPreview ? (
                <ChevronUp size={14} color={colors.mutedForeground} />
              ) : (
                <ChevronDown size={14} color={colors.mutedForeground} />
              )}
            </Pressable>
            {showPreview ? (
              <View style={[styles.previewBox, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.previewText, styles.mono, { color: colors.foreground }]}>
                  {getRecentLogs() || t('feedback.noLogsYet')}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sectionLabel: { fontSize: FontSize.xs, fontWeight: '500', marginBottom: 10, marginTop: Spacing.md },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
  previewBox: {
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 10,
    borderRadius: BorderRadius.md,
  },
  previewText: { fontSize: 11, lineHeight: 16 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
