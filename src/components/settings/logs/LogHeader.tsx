import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, Pause, Play, Share2 } from 'lucide-react-native';
import { FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';

interface LogHeaderProps {
  topInset: number;
  statusText: string;
  onBack: () => void;
  onShare: () => void;
  paused: boolean;
  onTogglePause: () => void;
  colors: ThemeColors;
  t: ReturnType<typeof import('react-i18next').useTranslation>['t'];
}

export function LogHeader({
  topInset,
  statusText,
  onBack,
  onShare,
  paused,
  onTogglePause,
  colors,
  t,
}: LogHeaderProps): React.JSX.Element {
  return (
    <View
      style={[
        headerStyles.header,
        { paddingTop: topInset + 8, borderBottomColor: colors.border },
      ]}
    >
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [headerStyles.iconBtn, pressed && { opacity: 0.6 }]}
        accessibilityLabel={t('gatewayLogs.close')}
      >
        <ChevronLeft size={22} color={colors.foreground} />
      </Pressable>

      <View style={headerStyles.headerCenter}>
        <Text style={[headerStyles.headerTitle, { color: colors.foreground }]}>
          {t('gatewayLogs.title')}
        </Text>
        <Text style={[headerStyles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
          {statusText}
        </Text>
      </View>

      <View style={headerStyles.headerActions}>
        <Pressable
          onPress={onShare}
          style={({ pressed }) => [headerStyles.iconBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel={t('gatewayLogs.shareLogs')}
        >
          <Share2 size={18} color={colors.mutedForeground} />
        </Pressable>
        <Pressable
          onPress={onTogglePause}
          style={({ pressed }) => [headerStyles.iconBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel={paused ? t('gatewayLogs.resumeLiveTail') : t('gatewayLogs.pauseLiveTail')}
        >
          {paused
            ? <Play size={18} color={colors.primary} />
            : <Pause size={18} color={colors.mutedForeground} />
          }
        </Pressable>
      </View>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  headerSub: {
    fontSize: FontSize.xs,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
