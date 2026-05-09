import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BrandField } from '@/components/common/BrandField';
import { BrandLoader } from '@/components/common/BrandLoader';
import { BrandLogo } from '@/components/common/BrandLogo';
import { CodeBlock } from '@/components/chat/CodeBlock';
import { useRouter } from 'expo-router';
import { ArrowRight, Check, ChevronLeft, ChevronRight, User, Zap } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConnection } from '@/contexts/ConnectionContext';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useTheme } from '@/hooks/useTheme';
import { useAccount } from '@/hooks/useAccount';
import { useServerProfileSync } from '@/contexts/ServerProfileSyncContext';
import { formatDeviceFingerprint, getOrCreateDeviceIdentity } from '@/lib/device-identity';
import { truncateMiddle } from '@/utils/gatewayUrl';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import { parseGatewayWsUrl } from '@/utils/gatewayUrl';
import type { ThemeColors } from '@/types';
import type { ServerPointer } from '@/lib/supabase/serverPointers';
import type { TFunction } from 'i18next';
import { AddServerSheet, type AddServerSheetRef } from '@/components/settings/AddServerSheet';
import { SignInSheet, type SignInSheetRef } from '@/components/settings/SignInSheet';
import { useTranslation } from 'react-i18next';
import { AchievementsOptInStep } from './AchievementsOptInStep';
import { useBadgeState } from '@/badges/hooks';
import { emitGumaTapped } from '@/badges/events';

type Step = 'welcome' | 'connecting' | 'pairing' | 'success' | 'achievements';

const USER_STEPS: Step[] = ['welcome', 'achievements', 'success'];

// ─────────────────────────────────────────────────────────────────────────────
// SpringCheckCircle — appears with a one-shot scale spring
// ─────────────────────────────────────────────────────────────────────────────

interface SpringCheckCircleProps {
  colors: ThemeColors;
}

function SpringCheckCircle({ colors }: SpringCheckCircleProps): React.JSX.Element {
  const scale = useSharedValue(0.7);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
  }, [scale]);

  return (
    <Animated.View
      style={[
        styles.checkCircle,
        { backgroundColor: colors.muted, borderColor: colors.success },
        animStyle,
      ]}
    >
      <Check size={40} color={colors.success} />
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HeroLogoSpring — scale-spring entry wrapper for the hero logo
// ─────────────────────────────────────────────────────────────────────────────

function HeroLogoSpring({ children }: { children: React.ReactNode }): React.JSX.Element {
  const scale = useSharedValue(0.86);
  const opacity = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  useEffect(() => {
    opacity.value = withDelay(80, withTiming(1, { duration: 300 }));
    scale.value = withDelay(80, withSpring(1, { damping: 11, stiffness: 180 }));
  }, [scale, opacity]);

  return <Animated.View style={animStyle}>{children}</Animated.View>;
}

// ─────────────────────────────────────────────────────────────────────────────
// OnboardingScreen
// ─────────────────────────────────────────────────────────────────────────────

export function OnboardingScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { serverProfiles, getAuthTokenForProfile, activeProfile, updateProfileSecurity, enableDemoProfile } = useServerConfig();
  const { connect, connectionState, gatewayUrl } = useConnection();
  const { host: gatewayHost, isInsecure: isInsecureScheme } = parseGatewayWsUrl(gatewayUrl);
  const { status: accountStatus } = useAccount();
  const { remotePointers, isFetchingPointers, refreshRemotePointers } = useServerProfileSync();
  const sheetRef = useRef<AddServerSheetRef>(null);
  const signInSheetRef = useRef<SignInSheetRef>(null);

  const [step, setStep] = useState<Step>('welcome');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const { state: badgeState, enable: enableBadges } = useBadgeState();
  // One-shot mount check: don't re-run when profiles change during the save flow.
  const didInitialRedirectRef = useRef(false);
  // Track previous accountStatus so we can detect the signed-out → signed-in transition
  // while the onboarding screen is mounted (e.g. user taps Sign In on this screen).
  const prevAccountStatusRef = useRef<string>(accountStatus);

  // If already configured when the user lands here, skip straight to chat (once).
  useEffect(() => {
    if (didInitialRedirectRef.current) {
      return;
    }
    didInitialRedirectRef.current = true;
    if (serverProfiles.length > 0) {
      router.replace('/');
    }
  }, [router, serverProfiles.length]);

  useEffect(() => {
    void getOrCreateDeviceIdentity().then((i) => setDeviceId(i?.id ?? null));
  }, []);

  // When the user signs in via the SignInSheet on this screen, ensure the
  // remote pointers are fetched even if the context's sign-in effect missed
  // the edge (e.g. if status was already 'signed-in' on mount with no prior
  // fetch, or if onAuthStateChange fired before the context subscribed).
  useEffect(() => {
    const prev = prevAccountStatusRef.current;
    prevAccountStatusRef.current = accountStatus;
    if (accountStatus === 'signed-in' && prev !== 'signed-in') {
      void refreshRemotePointers();
    }
  }, [accountStatus, refreshRemotePointers]);

  // Advance state machine once a connection or pairing result arrives.
  useEffect(() => {
    if (step !== 'connecting') {
      return;
    }
    if (connectionState.status === 'connected') {
      setStep(nextIsAchievementsRef.current ? 'achievements' : 'success');
      return;
    }
    if (connectionState.status === 'pairing_required') {
      setStep('pairing');
      return;
    }
    // If the post-save reconnect fails, surface the sheet again so the user can fix credentials.
    if (connectionState.status === 'error') {
      setStep('welcome');
      sheetRef.current?.presentNew();
    }
  }, [connectionState, step]);

  useEffect(() => {
    if (step !== 'pairing') {
      return;
    }
    if (connectionState.status === 'connected') {
      setStep(nextIsAchievementsRef.current ? 'achievements' : 'success');
    }
  }, [connectionState.status, step]);

  // Poll gateway while waiting for device approval.
  useEffect(() => {
    if (step !== 'pairing' || !activeProfile) {
      return;
    }
    const h = setInterval(() => {
      void (async () => {
        const tok = await getAuthTokenForProfile(activeProfile.id);
        if (tok) {
          connect(activeProfile.url, tok);
        }
      })();
    }, 5_000);
    return () => {
      clearInterval(h);
    };
  }, [activeProfile, connect, getAuthTokenForProfile, step]);

  const [demoPending, setDemoPending] = useState(false);

  const handleTryDemo = useCallback((): void => {
    if (demoPending) return;
    setDemoPending(true);
    void (async () => {
      await enableDemoProfile();
      router.replace('/');
    })();
  }, [demoPending, enableDemoProfile, router]);

  const onAfterSave = useCallback(
    async (profile: { id: string; url: string }): Promise<void> => {
      suppressAutoAdvanceRef.current = false;
      setStep('connecting');
      const tok = await getAuthTokenForProfile(profile.id);
      if (tok) {
        connect(profile.url, tok);
      }
    },
    [connect, getAuthTokenForProfile]
  );

  const handleTryAgain = useCallback((): void => {
    if (!activeProfile) {
      setStep('welcome');
      sheetRef.current?.presentNew();
      return;
    }
    void (async () => {
      const tok = await getAuthTokenForProfile(activeProfile.id);
      if (tok) {
        connect(activeProfile.url, tok);
      }
    })();
  }, [activeProfile, connect, getAuthTokenForProfile]);

  const goToChat = useCallback((): void => {
    router.replace('/');
  }, [router]);

  // Ref so the auto-advance effect always calls the latest goToChat without
  // re-triggering the effect when step/router changes.
  const goToChatRef = useRef(goToChat);
  goToChatRef.current = goToChat;

  // True when the achievements opt-in step comes next (badges not yet enabled).
  const nextIsAchievements = !(badgeState !== null && badgeState.enabledAt !== null);
  const nextIsAchievementsRef = useRef(nextIsAchievements);
  nextIsAchievementsRef.current = nextIsAchievements;

  // When true the next 'success' step mount skips the 800ms auto-advance
  // (used when navigating back from achievements → success).
  const skipNextAutoAdvanceRef = useRef(false);
  // When true the 800ms auto-advance is suppressed while AddServerSheet is open.
  const suppressAutoAdvanceRef = useRef(false);

  // Auto-advance from success → chat after 800ms.
  useEffect(() => {
    if (step !== 'success') return;
    if (skipNextAutoAdvanceRef.current) {
      skipNextAutoAdvanceRef.current = false;
      return;
    }
    if (suppressAutoAdvanceRef.current) return;
    const timer = setTimeout(() => {
      goToChatRef.current();
    }, 800);
    return () => clearTimeout(timer);
  }, [step]);

  // Step-indicator navigation
  const userIdx = USER_STEPS.indexOf(step);
  const canGoBack = step === 'success' || (step === 'achievements' && activeProfile !== null);
  const canGoForward = step === 'achievements';

  const handleBack = useCallback((): void => {
    if (step === 'success') {
      skipNextAutoAdvanceRef.current = true;
      setStep('achievements');
    } else if (step === 'achievements' && activeProfile) {
      suppressAutoAdvanceRef.current = true;
      sheetRef.current?.presentEdit(activeProfile);
    }
  }, [step, activeProfile]);

  const handleForward = useCallback((): void => {
    if (step === 'achievements') {
      setStep('success');
    }
  }, [step]);

  const showHero = step === 'welcome';
  const showBrandField = showHero || step === 'achievements' || step === 'success';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>

      {/* ── BrandField backdrop (top half, fades to transparent) ─── */}
      {showBrandField ? (
        <Animated.View
          entering={FadeIn.duration(700)}
          style={styles.fieldLayer}
          pointerEvents="none"
        >
          <MaskedView
            style={StyleSheet.absoluteFill}
            maskElement={
              <LinearGradient
                colors={['white', 'white', 'transparent']}
                locations={[0, 0.55, 1]}
                style={StyleSheet.absoluteFill}
              />
            }
          >
            <BrandField />
          </MaskedView>
        </Animated.View>
      ) : null}

      {/* ── Connecting ───────────────────────────────────────── */}
      {step === 'connecting' ? (
        <Animated.View entering={FadeIn.duration(300)} style={styles.centerContent}>
          <BrandLoader
            variant="large"
            label={t('onboarding.connecting.label')}
          />
        </Animated.View>
      ) : null}

      {/* ── Welcome ──────────────────────────────────────────── */}
      {showHero ? (
        <View style={styles.centerContent}>
          {accountStatus === 'signed-in' && (remotePointers.length > 0 || isFetchingPointers) ? (
            <Animated.View entering={FadeInUp.duration(400)} style={{ width: '100%' }}>
              <RestoreList
                remotePointers={remotePointers}
                isFetching={isFetchingPointers}
                colors={colors}
                t={t}
                onSetup={(url, name) => sheetRef.current?.presentNew({ url, name })}
              />
            </Animated.View>
          ) : (
            <>
              {/* Hero logo */}
              <View style={styles.logoContainer}>
                {/* Logo — scale-spring entry, no frame */}
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
                    sheetRef.current?.presentNew();
                  }}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: colors.secondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexDirection: 'row', gap: 6, justifyContent: 'center' },
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
                  onPress={handleTryDemo}
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
      ) : null}

      {/* ── Welcome bottom footer (sign-in anchor) ────────────── */}
      {showHero && accountStatus !== 'signed-in' ? (
        <Animated.View
          entering={FadeIn.delay(500).duration(360)}
          style={[styles.bottomFooter, { bottom: insets.bottom + Spacing.lg }]}
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
              onPress={() => signInSheetRef.current?.present()}
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
      ) : showHero && accountStatus === 'signed-in' ? (
        <Animated.View
          entering={FadeIn.delay(500).duration(360)}
          style={[styles.bottomFooter, { bottom: insets.bottom + Spacing.lg }]}
        >
          <View style={styles.signInRow}>
            <Text style={[styles.signInCaption, { color: colors.mutedForeground }]}>
              {remotePointers.length > 0
                ? t('onboarding.restore.foundGatewaysHint')
                : t('onboarding.restore.noGatewaysHint')}
            </Text>
            <Pressable
              onPress={() => { void refreshRemotePointers(); }}
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
      ) : null}

      {/* ── Pairing ──────────────────────────────────────────── */}
      {step === 'pairing' ? (
        <Animated.View entering={FadeIn.duration(300)} style={styles.centerContent}>
          <Text style={[styles.h1, { color: colors.foreground, textAlign: 'center' }]}>{t('onboarding.pairing.title')}</Text>
          <Text style={[styles.p, { color: colors.mutedForeground, textAlign: 'center' }]}>
            {t('onboarding.pairing.body')}
          </Text>

          {/* Approve + waiting — unified card */}
          <View style={[styles.approveCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.approveCaption, { color: colors.mutedForeground }]}>
              {t('onboarding.pairing.approveOnServer')}
            </Text>
            <CodeBlock
              code={'openclaw devices approve\nopenclaw devices approve <requestId>'}
              language="bash"
              fontSize={FontSize.xs}
            />
            <View style={styles.waitingRow}>
              <BrandLoader variant="small" />
              <Text style={[styles.waitingText, { color: colors.mutedForeground }]}>
                {t('onboarding.pairing.waiting')}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={handleTryAgain}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.sm, fontWeight: '500' }}>{t('onboarding.pairing.tryAgain')}</Text>
          </Pressable>

          {(gatewayHost || deviceId) ? (
            <View style={[styles.verifyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.verifyHeading, { color: colors.mutedForeground }]}>
                {t('onboarding.pairing.verifyHeading')}
              </Text>
              {gatewayHost ? (
                <PairingInfoRow label={t('onboarding.pairing.labelGateway')} value={gatewayHost} colors={colors} />
              ) : null}
              {gatewayHost ? (
                <PairingInfoRow
                  label={t('onboarding.pairing.labelSecurity')}
                  value={isInsecureScheme ? t('onboarding.pairing.securityInsecure') : t('onboarding.pairing.securitySecure')}
                  valueColor={isInsecureScheme ? colors.destructive : colors.success}
                  colors={colors}
                />
              ) : null}
              {deviceId ? (
                <PairingInfoRow
                  label={t('onboarding.pairing.labelDeviceKey')}
                  value={formatDeviceFingerprint(deviceId)}
                  mono
                  hint={t('onboarding.pairing.deviceKeyHint')}
                  colors={colors}
                />
              ) : null}
              {activeProfile?.security?.firstSeenSpkiSha256 ? (
                <PairingInfoRow
                  label={t('onboarding.pairing.labelGatewayCert')}
                  value={activeProfile.security.firstSeenSpkiSha256}
                  mono
                  hint={t('onboarding.pairing.gatewayCertHint')}
                  colors={colors}
                />
              ) : (
                <PairingInfoRow label={t('onboarding.pairing.labelCertPin')} value={t('onboarding.pairing.certPinAvailable')} muted colors={colors} />
              )}
            </View>
          ) : null}

          {activeProfile?.security?.firstSeenSpkiSha256 &&
            !activeProfile.security.pinnedSpkiSha256?.length ? (
            <View style={styles.certPinHint}>
              <Text style={[styles.certPinHintText, { color: colors.mutedForeground }]}>
                {t('onboarding.pairing.certPinHint')}
              </Text>
              <Pressable
                onPress={() => {
                  const spki = activeProfile!.security!.firstSeenSpkiSha256!;
                  const current = activeProfile!.security?.pinnedSpkiSha256 ?? [];
                  const next = current.includes(spki) ? current : [...current, spki];
                  void updateProfileSecurity(activeProfile!.id, { pinnedSpkiSha256: next });
                }}
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                accessibilityLabel={t('onboarding.pairing.pinNowLabel')}
                accessibilityRole="button"
              >
                <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, textDecorationLine: 'underline' }}>
                  {t('onboarding.pairing.pinNow')}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      {/* ── Success ──────────────────────────────────────────── */}
      {step === 'success' ? (
        <Animated.View entering={FadeInUp.duration(400)} style={styles.centerContent}>
          <SpringCheckCircle colors={colors} />
          <Text style={[styles.h1, { color: colors.foreground }]}>{t('onboarding.success.title')}</Text>
          <Text style={[styles.p, { color: colors.mutedForeground, textAlign: 'center' }]}>
            {t('onboarding.success.body')}
          </Text>

          <Pressable
            onPress={goToChat}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: colors.border, marginTop: Spacing.xl, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.sm, fontWeight: '500' }}>
              {t('onboarding.success.openNow')}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {/* ── Achievements opt-in ───────────────────────────────── */}
      {step === 'achievements' ? (
        <Animated.View entering={FadeInUp.duration(350)} style={styles.centerContent}>
          <AchievementsOptInStep
            colors={colors}
            isEnabled={badgeState !== null && badgeState.enabledAt !== null}
            onEnable={() => { void enableBadges(); }}
            onComplete={() => { setStep('success'); }}
          />
        </Animated.View>
      ) : null}

      {/* Step indicator — visible on user-driven steps (welcome, success, achievements) */}
      <OnboardingStepNav
        userIdx={userIdx}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={handleBack}
        onForward={handleForward}
        colors={colors}
        t={t}
        bottom={insets.bottom + Spacing.lg + (showHero ? 56 : 0)}
      />

      <AddServerSheet
        ref={sheetRef}
        onAfterSave={(p) => { void onAfterSave(p); }}
      />
      <SignInSheet ref={signInSheetRef} />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PairingInfoRow
// ─────────────────────────────────────────────────────────────────────────────

interface PairingInfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
  valueColor?: string;
  hint?: string;
  colors: ThemeColors;
}

function PairingInfoRow({ label, value, mono, muted, valueColor, hint, colors }: PairingInfoRowProps): React.JSX.Element {
  const textColor = valueColor ?? (muted ? colors.mutedForeground : colors.foreground);
  return (
    <View style={pirStyles.wrap}>
      <View style={pirStyles.row}>
        <Text style={[pirStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
        <Text
          style={[pirStyles.value, { color: textColor }, mono ? pirStyles.mono : undefined]}
          numberOfLines={mono ? 2 : 1}
          ellipsizeMode="middle"
        >
          {value}
        </Text>
      </View>
      {hint ? (
        <Text style={[pirStyles.hint, { color: colors.mutedForeground }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const pirStyles = StyleSheet.create({
  wrap: { paddingVertical: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  label: { fontSize: FontSize.xs, fontWeight: '500', flexShrink: 0 },
  value: { fontSize: FontSize.xs, flex: 1, textAlign: 'right' },
  mono: { fontFamily: 'monospace', fontSize: 10 },
  hint: { fontSize: 10, textAlign: 'right', marginTop: 1, opacity: 0.7 },
});

// ─────────────────────────────────────────────────────────────────────────────
// RestoreList — shown on welcome step when signed-in with remote-only gateways
// ─────────────────────────────────────────────────────────────────────────────

interface RestoreListProps {
  remotePointers: ServerPointer[];
  isFetching: boolean;
  colors: ThemeColors;
  t: TFunction;
  onSetup: (url: string, name: string) => void;
}

function RestoreList({ remotePointers, isFetching, colors, t, onSetup }: RestoreListProps): React.JSX.Element {
  return (
    <View style={restoreStyles.root}>
      <Text style={[restoreStyles.title, { color: colors.foreground }]}>
        {t('onboarding.restore.title')}
      </Text>
      <Text style={[restoreStyles.subtitle, { color: colors.mutedForeground }]}>
        {t('onboarding.restore.subtitle')}
      </Text>

      {isFetching ? (
        <View style={{ marginTop: Spacing.lg, alignItems: 'center' }}>
          <BrandLoader variant="small" />
        </View>
      ) : remotePointers.length === 0 ? (
        <Text style={[restoreStyles.empty, { color: colors.mutedForeground }]}>
          {t('onboarding.restore.empty')}
        </Text>
      ) : (
        <ScrollView
          style={restoreStyles.list}
          contentContainerStyle={restoreStyles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {remotePointers.slice(0, 6).map((ptr, i) => (
            <Animated.View
              key={ptr.id}
              entering={FadeInUp.delay(i * 60).duration(300)}
              style={[restoreStyles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={restoreStyles.rowText}>
                <Text style={[restoreStyles.rowLabel, { color: colors.foreground }]} numberOfLines={1}>
                  {ptr.label}
                </Text>
                <Text style={[restoreStyles.rowUrl, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {truncateMiddle(ptr.url, 40)}
                </Text>
              </View>
              <Pressable
                onPress={() => onSetup(ptr.url, ptr.label)}
                style={({ pressed }) => [
                  restoreStyles.setupBtn,
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
                <Text style={[restoreStyles.setupBtnText, { color: colors.primary }]}>
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

const restoreStyles = StyleSheet.create({
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

// ─────────────────────────────────────────────────────────────────────────────
// OnboardingStepNav — 3-dot indicator + back/forward arrows
// ─────────────────────────────────────────────────────────────────────────────

interface OnboardingStepNavProps {
  userIdx: number;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  colors: ThemeColors;
  bottom: number;
  t: TFunction;
}

function OnboardingStepNav({
  userIdx,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  colors,
  bottom,
  t,
}: OnboardingStepNavProps): React.JSX.Element | null {
  if (userIdx < 0) return null;

  return (
    <View style={[navStyles.bar, { bottom }]} pointerEvents="box-none">
      {canGoBack ? (
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [navStyles.arrow, pressed && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.nav.back')}
          pointerEvents="auto"
        >
          <ChevronLeft size={20} color={colors.mutedForeground} />
        </Pressable>
      ) : (
        <View style={navStyles.arrow} />
      )}

      <View style={navStyles.dots}>
        {USER_STEPS.map((_, i) => (
          <View
            key={i}
            style={[
              navStyles.dot,
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
          style={({ pressed }) => [navStyles.arrow, pressed && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.nav.forward')}
          pointerEvents="auto"
        >
          <ChevronRight size={20} color={colors.mutedForeground} />
        </Pressable>
      ) : (
        <View style={navStyles.arrow} />
      )}
    </View>
  );
}

const navStyles = StyleSheet.create({
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

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  // BrandField tiled backdrop — covers top 55% of the screen behind all content
  fieldLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
  },
  // Layout
  centerContent: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80, // leave room for the absolute bottom footer
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
  // Hero logo container
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
    // Brand-tinted shadow — color set inline from colors.primary
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  heroLogoImage: {
    width: '100%',
    height: '100%',
  },
  // Buttons
  primaryBtn: {
    marginTop: Spacing.xl,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    minWidth: 220,
  },
  secondaryBtn: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  // Demo ghost link
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
  // Success check
  checkCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  // Pairing
  approveCard: {
    width: '100%',
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  approveCaption: {
    fontSize: FontSize.xs,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  waitingText: {
    fontSize: FontSize.xs,
  },
  certPinHint: {
    marginTop: Spacing.md,
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  certPinHintText: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  verifyCard: {
    width: '100%',
    marginTop: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    gap: 4,
  },
  verifyHeading: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  // Bottom footer — absolute, anchored above safe area
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
