import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { BrandField } from '@/components/common/BrandField';
import { BrandLoader } from '@/components/common/BrandLoader';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConnection } from '@/contexts/ConnectionContext';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useTheme } from '@/hooks/useTheme';
import { useAccount } from '@/hooks/useAccount';
import { useServerProfileSync } from '@/contexts/ServerProfileSyncContext';
import { getOrCreateDeviceIdentity } from '@/lib/device-identity';
import { Spacing } from '@/constants/theme';
import { parseGatewayWsUrl } from '@/utils/gatewayUrl';
import { AddServerSheet, type AddServerSheetRef } from '@/components/settings/AddServerSheet';
import { SignInSheet, type SignInSheetRef } from '@/components/settings/SignInSheet';
import { useTranslation } from 'react-i18next';
import { AchievementsOptInStep } from './AchievementsOptInStep';
import { useBadgeState } from '@/badges/hooks';
import { WelcomeStep } from './steps/WelcomeStep';
import { PairingStep } from './steps/PairingStep';
import { SuccessStep } from './steps/SuccessStep';
import { OnboardingStepNav } from './components/OnboardingStepNav';

type Step = 'welcome' | 'connecting' | 'pairing' | 'success' | 'achievements';

const USER_STEPS: Step[] = ['welcome', 'achievements', 'success'];

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
  // When true the 800ms auto-advance on 'success' is suppressed. Set in handleBack
  // when the user navigates back from the achievements step to edit their server profile.
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

  const handlePinCert = useCallback((spki: string, current: string[]): void => {
    if (!activeProfile) return;
    const next = current.includes(spki) ? current : [...current, spki];
    void updateProfileSecurity(activeProfile.id, { pinnedSpkiSha256: next });
  }, [activeProfile, updateProfileSecurity]);

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
        <WelcomeStep
          colors={colors}
          insetsBottom={insets.bottom}
          accountStatus={accountStatus}
          remotePointers={remotePointers}
          isFetchingPointers={isFetchingPointers}
          demoPending={demoPending}
          onPresentNew={(opts) => sheetRef.current?.presentNew(opts)}
          onTryDemo={handleTryDemo}
          onSignIn={() => signInSheetRef.current?.present()}
          onRefresh={() => { void refreshRemotePointers(); }}
        />
      ) : null}

      {/* ── Pairing ──────────────────────────────────────────── */}
      {step === 'pairing' ? (
        <PairingStep
          colors={colors}
          gatewayHost={gatewayHost}
          isInsecureScheme={isInsecureScheme}
          deviceId={deviceId}
          activeProfile={activeProfile}
          onTryAgain={handleTryAgain}
          onPinCert={handlePinCert}
        />
      ) : null}

      {/* ── Success ──────────────────────────────────────────── */}
      {step === 'success' ? (
        <SuccessStep colors={colors} onGoToChat={goToChat} />
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
  // Layout wrapper used by Connecting and Achievements steps
  centerContent: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
});
