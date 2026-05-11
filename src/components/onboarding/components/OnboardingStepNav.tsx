import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';

const USER_STEPS = ['welcome', 'achievements', 'success'] as const;

export interface OnboardingStepNavProps {
  userIdx: number;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  colors: ThemeColors;
  bottom: number;
}

export function OnboardingStepNav({
  userIdx,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  colors,
  bottom,
}: OnboardingStepNavProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (userIdx < 0) return null;

  return (
    <View style={[styles.bar, { bottom }]} pointerEvents="box-none">
      {canGoBack ? (
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.arrow, pressed && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.nav.back')}
          pointerEvents="auto"
        >
          <ChevronLeft size={20} color={colors.mutedForeground} />
        </Pressable>
      ) : (
        <View style={styles.arrow} />
      )}

      <View
        style={styles.dots}
        accessible
        accessibilityRole="progressbar"
        accessibilityValue={{ text: t('onboarding.nav.stepIndicator', { current: userIdx + 1, total: USER_STEPS.length }) }}
      >
        {USER_STEPS.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i === userIdx ? colors.foreground : colors.mutedForeground,
                opacity: i === userIdx ? 1 : 0.3,
              },
            ]}
          />
        ))}
      </View>

      {canGoForward ? (
        <Pressable
          onPress={onForward}
          style={({ pressed }) => [styles.arrow, pressed && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.nav.forward')}
          pointerEvents="auto"
        >
          <ChevronRight size={20} color={colors.mutedForeground} />
        </Pressable>
      ) : (
        <View style={styles.arrow} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
  },
  arrow: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
