import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { SpringCheckCircle } from '../components/OnboardingAnimations';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';

export interface SuccessStepProps {
  colors: ThemeColors;
  onGoToChat: () => void;
}

export function SuccessStep({ colors, onGoToChat }: SuccessStepProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Animated.View entering={FadeInUp.duration(400)} style={styles.centerContent}>
      <SpringCheckCircle colors={colors} />
      <Text style={[styles.h1, { color: colors.foreground }]}>
        {t('onboarding.success.title')}
      </Text>
      <Text style={[styles.p, { color: colors.mutedForeground, textAlign: 'center' }]}>
        {t('onboarding.success.body')}
      </Text>

      <Pressable
        onPress={onGoToChat}
        style={({ pressed }) => [
          styles.secondaryBtn,
          { borderColor: colors.border, marginTop: Spacing.xl, opacity: pressed ? 0.7 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.success.openNow')}
      >
        <Text style={{ color: colors.mutedForeground, fontSize: FontSize.sm, fontWeight: '500' }}>
          {t('onboarding.success.openNow')}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  centerContent: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  h1: {
    fontSize: FontSize['2xl'],
    fontWeight: '700',
    lineHeight: 32,
    marginBottom: Spacing.sm,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  p: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
    marginTop: Spacing.md,
  },
  secondaryBtn: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
});
