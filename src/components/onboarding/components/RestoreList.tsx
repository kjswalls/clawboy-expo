import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { BrandLoader } from '@/components/common/BrandLoader';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { truncateMiddle } from '@/utils/gatewayUrl';
import type { ThemeColors } from '@/types';
import type { ServerPointer } from '@/lib/supabase/serverPointers';

export interface RestoreListProps {
  remotePointers: ServerPointer[];
  isFetching: boolean;
  colors: ThemeColors;
  onSetup: (url: string, name: string) => void;
}

export function RestoreList({ remotePointers, isFetching, colors, onSetup }: RestoreListProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View style={styles.root}>
      <Text style={[styles.title, { color: colors.foreground }]}>
        {t('onboarding.restore.title')}
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {t('onboarding.restore.subtitle')}
      </Text>

      {isFetching ? (
        <View style={{ marginTop: Spacing.lg, alignItems: 'center' }}>
          <BrandLoader variant="small" />
        </View>
      ) : remotePointers.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>
          {t('onboarding.restore.empty')}
        </Text>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {remotePointers.slice(0, 6).map((ptr, i) => (
            <Animated.View
              key={ptr.id}
              entering={FadeInUp.delay(i * 60).duration(300)}
              style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]} numberOfLines={1}>
                  {ptr.label}
                </Text>
                <Text style={[styles.rowUrl, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {truncateMiddle(ptr.url, 40)}
                </Text>
              </View>
              <Pressable
                onPress={() => onSetup(ptr.url, ptr.label)}
                style={({ pressed }) => [
                  styles.setupBtn,
                  {
                    backgroundColor: `${colors.primary}18`,
                    borderWidth: 1,
                    borderColor: `${colors.primary}40`,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                accessibilityLabel={`${t('onboarding.restore.setupBtn')} ${ptr.label}`}
                accessibilityRole="button"
              >
                <Text style={[styles.setupBtnText, { color: colors.primary }]}>
                  {t('onboarding.restore.setupBtn')}
                </Text>
              </Pressable>
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    alignItems: 'stretch',
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  empty: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
  list: {
    maxHeight: 320,
  },
  listContent: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.sm,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  rowUrl: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  setupBtn: {
    borderRadius: BorderRadius.md,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  setupBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
