import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BrandAnimatedLogo } from '@/components/common/BrandAnimatedLogo';
import { CodeBlock } from '@/components/chat/CodeBlock';
import { useRouter } from 'expo-router';
import { Check, LogIn } from 'lucide-react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConnection } from '@/contexts/ConnectionContext';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useTheme } from '@/hooks/useTheme';
import { useAccount } from '@/hooks/useAccount';
import { useServerProfileSync } from '@/contexts/ServerProfileSyncContext';
import { formatDeviceFingerprint, getOrCreateDeviceIdentity } from '@/lib/device-identity';
import { truncateMiddle } from '@/utils/gatewayUrl';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { parseGatewayWsUrl } from '@/utils/gatewayUrl';
import type { ThemeColors } from '@/types';
import type { ServerPointer } from '@/lib/supabase/serverPointers';
import type { TFunction } from 'i18next';
import { AddServerSheet, type AddServerSheetRef } from '@/components/settings/AddServerSheet';
import { SignInSheet, type SignInSheetRef } from '@/components/settings/SignInSheet';
import { useTranslation } from 'react-i18next';
import { hexToRgba } from '@/utils/color';

type Step = 'welcome' | 'connecting' | 'pairing' | 'success';

// ─────────────────────────────────────────────────────────────────────────────
// ScalePressable — wraps a Pressable in a Reanimated scale spring
// ─────────────────────────────────────────────────────────────────────────────

interface ScalePressableProps {
  onPress: () => void;
  style?: object;
  children: React.ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link' | 'none';
}

function ScalePressable({ onPress, style, children, disabled, accessibilityLabel, accessibilityRole }: ScalePressableProps): React.JSX.Element {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      onPressIn={() => { scale.value = withTiming(0.97, { duration: 80 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 300 }); }}
    >
      <Animated.View style={[style, animStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

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
// OnboardingScreen
// ─────────────────────────────────────────────────────────────────────────────

export function OnboardingScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { height: screenHeight } = useWindowDimensions();
  const { serverProfiles, getAuthTokenForProfile, activeProfile, updateProfileSecurity, enableDemoProfile } = useServerConfig();
  const { connect, connectionState, gatewayUrl } = useConnection();
  const { host: gatewayHost, isInsecure: isInsecureScheme } = parseGatewayWsUrl(gatewayUrl);
  const { status: accountStatus } = useAccount();
  const { remotePointers, isFetchingPointers, refreshRemotePointers } = useServerProfileSync();
  const sheetRef = useRef<AddServerSheetRef>(null);
  const signInSheetRef = useRef<SignInSheetRef>(null);

  const [step, setStep] = useState<Step>('welcome');
  const [deviceId, setDeviceId] = useState<string | null>(null);
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
      setStep('success');
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
      setStep('success');
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

  const showHero = step === 'welcome' || step === 'connecting';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>

      {/* ── Ambient top fade ─────────────────────────────────── */}
      <LinearGradient
        colors={[hexToRgba(colors.primary, 0.06), 'transparent']}
        style={[styles.topFade, { height: screenHeight * 0.40 }]}
        pointerEvents="none"
      />

      {/* ── Hero halo (welcome + connecting + success) ────────── */}
      {(showHero || step === 'success') ? (
        <View style={styles.haloWrap} pointerEvents="none">
          <LinearGradient
            colors={[hexToRgba(colors.primary, 0.12), 'transparent']}
            style={styles.halo}
          />
        </View>
      ) : null}

      {/* ── Welcome / Connecting ─────────────────────────────── */}
      {showHero ? (
        <Animated.View entering={FadeInUp.duration(400)} style={styles.centerContent}>
          {accountStatus === 'signed-in' && (remotePointers.length > 0 || isFetchingPointers) ? (
            <RestoreList
              remotePointers={remotePointers}
              isFetching={isFetchingPointers}
              colors={colors}
              t={t}
              onSetup={(url, name) => sheetRef.current?.presentNew({ url, name })}
            />
          ) : (
            <>
              {/* Hero logo (bundled MP4) */}
              <View style={[styles.heroLogoWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <BrandAnimatedLogo
                  style={styles.heroLogoImage}
                  accessibilityLabel={t('onboarding.welcome.logoAccessibility')}
                />
              </View>

              <Text style={[styles.h1, { color: colors.foreground }]}>{t('onboarding.welcome.title')}</Text>
              <Text style={[styles.p, { color: colors.mutedForeground }]}>
                {t('onboarding.welcome.body')}
              </Text>

              {/* Primary CTA — tinted primary fill */}
              <ScalePressable
                onPress={() => { sheetRef.current?.presentNew(); }}
                style={[
                  styles.primaryBtn,
                  {
                    backgroundColor: `${colors.primary}18`,
                    borderWidth: 1,
                    borderColor: `${colors.primary}40`,
                  },
                ]}
                accessibilityRole="button"
              >
                <Text style={{ color: colors.primary, fontSize: FontSize.md, fontWeight: '700' }}>
                  {t('onboarding.welcome.getStarted')}
                </Text>
              </ScalePressable>

              {/* Demo ghost pill + caption */}
              <View style={styles.demoBtnWrap}>
                <Pressable
                  onPress={handleTryDemo}
                  disabled={demoPending}
                  style={({ pressed }) => [
                    styles.demoBtn,
                    {
                      borderColor: hexToRgba(colors.border, 0.6),
                      opacity: pressed || demoPending ? 0.5 : 1,
                    },
                  ]}
                  accessibilityLabel={t('onboarding.welcome.tryDemo')}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.mutedForeground, fontSize: FontSize.sm, fontWeight: '500' }}>
                    {t('onboarding.welcome.tryDemo')}
                  </Text>
                </Pressable>
                <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: Spacing.xs }}>
                  {t('onboarding.welcome.tryDemoSub')}
                </Text>
              </View>

              {/* Bottom link / recovery row */}
              {accountStatus !== 'signed-in' ? (
                <Pressable
                  onPress={() => signInSheetRef.current?.present()}
                  style={({ pressed }) => [styles.signInLink, pressed && { opacity: 0.6 }]}
                  accessibilityLabel={t('onboarding.welcome.signInLink')}
                  accessibilityRole="button"
                >
                  <LogIn size={12} color={colors.mutedForeground} />
                  <Text style={[styles.signInLinkText, { color: colors.mutedForeground }]}>
                    {t('onboarding.welcome.signInLink')}
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.noGatewaysRow}>
                  <Text style={[styles.noGatewaysText, { color: colors.mutedForeground }]}>
                    {t('onboarding.restore.noGatewaysHint')}
                  </Text>
                  <Pressable
                    onPress={() => { void refreshRemotePointers(); }}
                    style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                    accessibilityLabel={t('onboarding.restore.refresh')}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.refreshLink, { color: colors.primary }]}>
                      {t('onboarding.restore.refresh')}
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
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
              <ActivityIndicator size="small" color={colors.primary} />
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
          <Text style={[styles.p, { color: colors.mutedForeground, textAlign: 'center' }]}>{t('onboarding.success.body')}</Text>
          <Pressable
            onPress={goToChat}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: colors.border, marginTop: Spacing.xl, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.sm, fontWeight: '500' }}>{t('onboarding.success.openNow')}</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {step === 'success' ? <SuccessRedirect router={router} /> : null}

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
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: Spacing.lg }} />
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
    fontWeight: '800',
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
// SuccessRedirect
// ─────────────────────────────────────────────────────────────────────────────

function SuccessRedirect({ router }: { router: { replace: (path: string) => void } }): null {
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/');
    }, 800);
    return () => {
      clearTimeout(timer);
    };
  }, [router]);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const HALO_SIZE = 300;

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Ambient backdrop
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  haloWrap: {
    position: 'absolute',
    top: '15%',
    alignSelf: 'center',
    width: HALO_SIZE,
    height: HALO_SIZE,
  },
  halo: {
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
  },
  // Layout
  centerContent: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  h1: {
    fontSize: FontSize['2xl'],
    fontWeight: '800',
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
  // Hero logo
  heroLogoWrap: {
    width: 180,
    height: 180,
    borderRadius: 44,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
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
    paddingHorizontal: 28,
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
  demoBtnWrap: {
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  demoBtn: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
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
  // Sign-in / recovery links
  signInLink: {
    marginTop: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  signInLinkText: {
    fontSize: FontSize.xs,
    textDecorationLine: 'underline',
  },
  noGatewaysRow: {
    marginTop: Spacing.lg,
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  noGatewaysText: {
    fontSize: FontSize.xs,
    textAlign: 'center',
  },
  refreshLink: {
    fontSize: FontSize.xs,
    textDecorationLine: 'underline',
  },
});
