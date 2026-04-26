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
import { getOrCreateDeviceIdentity } from '@/lib/device-identity';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { truncateMiddle } from '@/utils/gatewayUrl';
import { AddServerSheet, type AddServerSheetRef } from '@/components/settings/AddServerSheet';

type Step = 'welcome' | 'connecting' | 'pairing' | 'success';

export function OnboardingScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { serverProfiles, getAuthTokenForProfile, activeProfile } = useServerConfig();
  const { connect, connectionState } = useConnection();
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
          {deviceId ? (
            <Text style={{ color: colors.cardForeground, fontSize: FontSize.xs, textAlign: 'center', fontFamily: 'monospace', marginTop: Spacing.sm }}>
              {truncateMiddle(deviceId, 32)}
            </Text>
          ) : null}
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
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
});
