import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { ArrowRight, User, Zap } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from '@/components/common/BrandLogo';
import { RestoreList } from '../components/RestoreList';
import { HeroLogoSpring } from '../components/OnboardingAnimations';
import { emitGumaTapped } from '@/badges/events';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import type { ServerPointer } from '@/lib/supabase/serverPointers';

export interface WelcomeStepProps {
  colors: ThemeColors;
  /** Bottom safe area inset used to anchor the absolute footer. */
  insetsBottom: number;
  accountStatus: 'unknown' | 'signed-in' | 'signed-out';
  remotePointers: ServerPointer[];
  isFetchingPointers: boolean;
  demoPending: boolean;
  onPresentNew: (opts?: { url: string; name: string }) => void;
  onTryDemo: () => void;
  onSignIn: () => void;
  onRefresh: () => void;
}

export function WelcomeStep({
  colors,
  insetsBottom,
  accountStatus,
  remotePointers,
  isFetchingPointers,
  demoPending,
  onPresentNew,
  onTryDemo,
  onSignIn,
  onRefresh,
}: WelcomeStepProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      {/* ── Main hero content ── */}
      <View style={styles.centerContent}>
        {accountStatus === 'signed-in' && (remotePointers.length > 0 || isFetchingPointers) ? (
          <Animated.View entering={FadeInUp.duration(400)} style={{ width: '100%' }}>
            <RestoreList
              remotePointers={remotePointers}
              isFetching={isFetchingPointers}
              colors={colors}
              onSetup={(url, name) => onPresentNew({ url, name })}
            />
          </Animated.View>
        ) : (
          <>
            {/* Hero logo */}
            <View style={styles.logoContainer}>
              <HeroLogoSpring>
                <Pressable
                  onPress={() => { emitGumaTapped(); }}
                  style={[styles.heroLogoWrap, { shadowColor: colors.primary }]}
                  accessibilityLabel={t('onboarding.welcome.logoAccessibility')}
                  accessibilityRole="image"
                >
                  <BrandLogo
                    style={styles.heroLogoImage}
                    accessibilityLabel={t('onboarding.welcome.logoAccessibility')}
                  />
                </Pressable>
              </HeroLogoSpring>
            </View>

            <Animated.Text
              entering={FadeInUp.delay(160).duration(280)}
              style={[styles.h1, { color: colors.foreground }]}
            >
              {t('onboarding.welcome.title')}
            </Animated.Text>
            <Animated.Text
              entering={FadeInUp.delay(220).duration(280)}
              style={[styles.p, { color: colors.mutedForeground }]}
            >
              {t('onboarding.welcome.body')}
            </Animated.Text>

            <Animated.View entering={FadeInUp.delay(300).duration(280)}>
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  onPresentNew();
                }}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: colors.secondary,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.border,
                    flexDirection: 'row',
                    gap: 6,
                    justifyContent: 'center',
                  },
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
              >
                <Zap size={14} color={colors.primary} />
                <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: FontWeight.semibold }}>
                  {t('onboarding.welcome.getStarted')}
                </Text>
              </Pressable>
            </Animated.View>

            {/* Demo — ghost link with caption */}
            <Animated.View entering={FadeInUp.delay(380).duration(280)} style={styles.demoLinkWrap}>
              <Pressable
                onPress={onTryDemo}
                disabled={demoPending}
                style={({ pressed }) => [
                  styles.demoLink,
                  { opacity: pressed || demoPending ? 0.5 : 1 },
                ]}
                accessibilityLabel={t('onboarding.welcome.tryDemo')}
                accessibilityRole="button"
              >
                <Text style={{ color: colors.mutedForeground, fontSize: FontSize.sm, fontWeight: '500' }}>
                  {t('onboarding.welcome.tryDemo')}
                </Text>
                <ArrowRight size={13} color={colors.mutedForeground} />
              </Pressable>
              <Text style={[styles.demoCaption, { color: colors.mutedForeground }]}>
                {t('onboarding.welcome.tryDemoCaption')}
              </Text>
            </Animated.View>
          </>
        )}
      </View>

      {/* ── Bottom footer — absolute, anchored above safe area ── */}
      {accountStatus !== 'signed-in' ? (
        <Animated.View
          entering={FadeIn.delay(500).duration(360)}
          style={[styles.bottomFooter, { bottom: insetsBottom + Spacing.lg }]}
        >
          <View style={styles.securityBadge} pointerEvents="none">
            <User size={11} color={colors.mutedForeground} style={{ opacity: 0.6 }} />
            <Text style={[styles.securityText, { color: colors.mutedForeground }]}>
              {t('onboarding.welcome.securityCaption')}
            </Text>
          </View>
          <View style={styles.signInRow}>
            <Text style={[styles.signInCaption, { color: colors.mutedForeground }]}>
              {t('onboarding.welcome.signInCaption')}
            </Text>
            <Pressable
              onPress={onSignIn}
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
              accessibilityLabel={t('onboarding.welcome.signInLink')}
              accessibilityRole="button"
            >
              <Text style={[styles.signInAction, { color: colors.primary }]}>
                {t('onboarding.welcome.signInAction')}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : (
        <Animated.View
          entering={FadeIn.delay(500).duration(360)}
          style={[styles.bottomFooter, { bottom: insetsBottom + Spacing.lg }]}
        >
          <View style={styles.signInRow}>
            <Text style={[styles.signInCaption, { color: colors.mutedForeground }]}>
              {remotePointers.length > 0
                ? t('onboarding.restore.foundGatewaysHint')
                : t('onboarding.restore.noGatewaysHint')}
            </Text>
            <Pressable
              onPress={onRefresh}
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
              accessibilityLabel={t('onboarding.restore.refresh')}
              accessibilityRole="button"
            >
              <Text style={[styles.signInAction, { color: colors.primary }]}>
                {t('onboarding.restore.refresh')}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </>
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
  logoContainer: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  heroLogoWrap: {
    width: 180,
    height: 180,
    borderRadius: 44,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  heroLogoImage: {
    width: '100%',
    height: '100%',
  },
  primaryBtn: {
    marginTop: Spacing.xl,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    minWidth: 220,
  },
  demoLinkWrap: {
    marginTop: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  demoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  demoCaption: {
    fontSize: 11,
    textAlign: 'center',
    opacity: 0.7,
  },
  bottomFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    opacity: 0.6,
  },
  securityText: {
    fontSize: 11,
    fontWeight: '500',
  },
  signInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  signInCaption: {
    fontSize: FontSize.xs,
  },
  signInAction: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
