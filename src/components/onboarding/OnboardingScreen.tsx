import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConnection } from '@/contexts/ConnectionContext';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useTheme } from '@/hooks/useTheme';
import { formatDeviceFingerprint, getOrCreateDeviceIdentity } from '@/lib/device-identity';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { parseGatewayWsUrl } from '@/utils/gatewayUrl';
import type { ThemeColors } from '@/types';
import { AddServerSheet, type AddServerSheetRef } from '@/components/settings/AddServerSheet';

type Step = 'welcome' | 'connecting' | 'pairing' | 'success';

export function OnboardingScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { serverProfiles, getAuthTokenForProfile, activeProfile, updateProfileSecurity } = useServerConfig();
  const { connect, connectionState, gatewayUrl } = useConnection();
  const { host: gatewayHost, isInsecure: isInsecureScheme } = parseGatewayWsUrl(gatewayUrl);
  const sheetRef = useRef<AddServerSheetRef>(null);

  const [step, setStep] = useState<Step>('welcome');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  // One-shot mount check: don't re-run when profiles change during the save flow.
  const didInitialRedirectRef = useRef(false);

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
        const t = await getAuthTokenForProfile(activeProfile.id);
        if (t) {
          connect(activeProfile.url, t);
        }
      })();
    }, 5_000);
    return () => {
      clearInterval(h);
    };
  }, [activeProfile, connect, getAuthTokenForProfile, step]);

  const onAfterSave = useCallback(
    async (profile: { id: string; url: string }): Promise<void> => {
      setStep('connecting');
      const t = await getAuthTokenForProfile(profile.id);
      if (t) {
        connect(profile.url, t);
      }
    },
    [connect, getAuthTokenForProfile]
  );

  const handleTryAgain = useCallback((): void => {
    if (!activeProfile) {
      // No profile yet — let the user re-enter credentials.
      setStep('welcome');
      sheetRef.current?.presentNew();
      return;
    }
    void (async () => {
      const t = await getAuthTokenForProfile(activeProfile.id);
      if (t) {
        connect(activeProfile.url, t);
      }
    })();
  }, [activeProfile, connect, getAuthTokenForProfile]);

  const goToChat = useCallback((): void => {
    router.replace('/');
  }, [router]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      {step === 'welcome' || step === 'connecting' ? (
        <Animated.View entering={FadeIn.duration(200)} style={styles.centerContent}>
          <View style={[styles.logo, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={{ fontSize: 32, color: colors.primary, fontWeight: '800' }}>CB</Text>
          </View>
          <Text style={[styles.h1, { color: colors.foreground }]}>Welcome to ClawBoy</Text>
          <Text style={[styles.p, { color: colors.mutedForeground }]}>
            Connect to your OpenClaw server to get started. Your token stays in SecureStore and never in plain
            app storage.
          </Text>
          <Pressable
            onPress={() => {
              sheetRef.current?.presentNew();
            }}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Text style={{ color: colors.primaryForeground, fontSize: FontSize.md, fontWeight: '700' }}>Get started</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {step === 'pairing' ? (
        <View style={styles.centerContent}>
          <Text style={[styles.h1, { color: colors.foreground, textAlign: 'center' }]}>Device pairing</Text>
          <Text style={[styles.p, { color: colors.mutedForeground, textAlign: 'center' }]}>
            Approve this device on your OpenClaw server. This screen updates automatically.
          </Text>

          {(gatewayHost || deviceId) ? (
            <View style={[styles.verifyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.verifyHeading, { color: colors.mutedForeground }]}>
                VERIFY ON YOUR GATEWAY
              </Text>
              {gatewayHost ? (
                <PairingInfoRow label="Gateway" value={gatewayHost} colors={colors} />
              ) : null}
              {gatewayHost ? (
                <PairingInfoRow
                  label="Security"
                  value={isInsecureScheme ? 'ws:// — unencrypted' : 'wss:// — encrypted'}
                  valueColor={isInsecureScheme ? colors.destructive : colors.success}
                  colors={colors}
                />
              ) : null}
              {deviceId ? (
                <PairingInfoRow
                  label="Device key"
                  value={formatDeviceFingerprint(deviceId)}
                  mono
                  colors={colors}
                />
              ) : null}
              {activeProfile?.security?.firstSeenSpkiSha256 ? (
                <PairingInfoRow
                  label="Gateway cert"
                  value={activeProfile.security.firstSeenSpkiSha256}
                  mono
                  colors={colors}
                />
              ) : (
                <PairingInfoRow label="Cert pin" value="Available after pinning enabled" muted colors={colors} />
              )}
            </View>
          ) : null}

          {activeProfile?.security?.firstSeenSpkiSha256 &&
            !activeProfile.security.pinnedSpkiSha256?.length ? (
            <View style={styles.certPinHint}>
              <Text style={[styles.certPinHintText, { color: colors.mutedForeground }]}>
                You can lock this connection to your server&apos;s certificate after setup — Settings → Pinned Keys.
              </Text>
              <Pressable
                onPress={() => {
                  const spki = activeProfile!.security!.firstSeenSpkiSha256!;
                  const current = activeProfile!.security?.pinnedSpkiSha256 ?? [];
                  const next = current.includes(spki) ? current : [...current, spki];
                  void updateProfileSecurity(activeProfile!.id, { pinnedSpkiSha256: next });
                }}
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                accessibilityLabel="Pin the gateway certificate key now"
                accessibilityRole="button"
              >
                <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, textDecorationLine: 'underline' }}>
                  Pin it now
                </Text>
              </Pressable>
            </View>
          ) : null}

          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: Spacing.lg }} />
          <Pressable
            onPress={handleTryAgain}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.sm, fontWeight: '500' }}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 'success' ? (
        <Animated.View entering={FadeIn.duration(200)} style={styles.centerContent}>
          <View style={[styles.checkCircle, { backgroundColor: colors.muted, borderColor: colors.success }]}>
            <Check size={40} color={colors.success} />
          </View>
          <Text style={[styles.h1, { color: colors.foreground }]}>You&apos;re all set!</Text>
          <Text style={[styles.p, { color: colors.mutedForeground, textAlign: 'center' }]}>Opening chat…</Text>
          <Pressable
            onPress={goToChat}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: colors.border, marginTop: Spacing.xl, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.sm, fontWeight: '500' }}>Open now</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {step === 'success' ? <SuccessRedirect router={router} /> : null}

      <AddServerSheet
        ref={sheetRef}
        onAfterSave={(p) => { void onAfterSave(p); }}
      />
    </SafeAreaView>
  );
}

interface PairingInfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
  valueColor?: string;
  colors: ThemeColors;
}

function PairingInfoRow({ label, value, mono, muted, valueColor, colors }: PairingInfoRowProps): React.JSX.Element {
  const textColor = valueColor ?? (muted ? colors.mutedForeground : colors.foreground);
  return (
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
  );
}

const pirStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, paddingVertical: 2 },
  label: { fontSize: FontSize.xs, fontWeight: '500', flexShrink: 0 },
  value: { fontSize: FontSize.xs, flex: 1, textAlign: 'right' },
  mono: { fontFamily: 'monospace', fontSize: 10 },
});

function SuccessRedirect({ router }: { router: { replace: (path: string) => void } }): null {
  useEffect(() => {
    const t = setTimeout(() => {
      router.replace('/');
    }, 800);
    return () => {
      clearTimeout(t);
    };
  }, [router]);
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centerContent: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  h1: {
    fontSize: FontSize['2xl'],
    fontWeight: '800',
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
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  primaryBtn: {
    marginTop: Spacing.xl,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  secondaryBtn: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  checkCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    gap: 4,
  },
  verifyHeading: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
});
