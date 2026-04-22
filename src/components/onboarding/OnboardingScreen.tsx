import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Check, Loader2 } from 'lucide-react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConnection } from '@/contexts/ConnectionContext';
import { useGatewayConnectionTest } from '@/hooks/useGatewayConnectionTest';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useTheme } from '@/hooks/useTheme';
import { getOrCreateDeviceIdentity } from '@/lib/device-identity';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { analyzeGatewayUrlInput, truncateMiddle } from '@/utils/gatewayUrl';
import { ConnectionFormFields } from '@/components/settings/ConnectionFormFields';

type Step = 'welcome' | 'connect' | 'pairing' | 'success';

export function OnboardingScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { addProfile, serverProfiles, getAuthTokenForProfile, activeProfile } = useServerConfig();
  const { connect, connectionState } = useConnection();
  const { result, startTest, reset: resetTest } = useGatewayConnectionTest();

  const [step, setStep] = useState<Step>('welcome');
  const [serverUrl, setServerUrl] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (serverProfiles.length > 0 && step === 'welcome') {
      router.replace('/');
    }
  }, [router, serverProfiles.length, step]);

  useEffect(() => {
    void getOrCreateDeviceIdentity().then((i) => setDeviceId(i?.id ?? null));
  }, []);

  const urlAnalysis = analyzeGatewayUrlInput(serverUrl);
  const canTest = Boolean(urlAnalysis.normalizedWsUrl && token.trim().length);
  const testOk = result.kind === 'success' && (result.mode === 'connected' || result.mode === 'pairing_required');
  const canSave = testOk && canTest;

  const onSave = useCallback(async () => {
    if (!canSave) {
      return;
    }
    setSaveError(null);
    const host = urlAnalysis.normalizedWsUrl.replace(/^wss?:\/\//i, '').split('/')[0] || 'server';
    try {
      await addProfile({
        name: host,
        url: urlAnalysis.normalizedWsUrl,
        isActive: true,
        authToken: token,
      });
      const lastUrl = urlAnalysis.normalizedWsUrl;
      const lastToken = token;
      connect(lastUrl, lastToken);
    } catch {
      setSaveError('Could not save this profile.');
    }
  }, [addProfile, canSave, connect, token, urlAnalysis.normalizedWsUrl]);

  // After profile save, route by live connection result.
  useEffect(() => {
    if (step !== 'connect') {
      return;
    }
    if (connectionState.status === 'connected') {
      setStep('success');
      return;
    }
    if (connectionState.status === 'pairing_required') {
      setStep('pairing');
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

  const isTesting = result.kind === 'testing';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      {step === 'welcome' ? (
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
              setStep('connect');
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

      {step === 'connect' ? (
        <Animated.View entering={FadeInUp.duration(180)} style={styles.form}>
          <Text style={[styles.h1, { color: colors.foreground }]}>Connect</Text>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>Use wss:// for encrypted traffic when possible.</Text>
          <ConnectionFormFields
            colors={colors}
            name=""
            onChangeName={() => {}}
            showName={false}
            serverUrl={serverUrl}
            onChangeUrl={(t) => {
              setServerUrl(t);
              resetTest();
            }}
            token={token}
            onChangeToken={(t) => {
              setToken(t);
              resetTest();
            }}
            showToken={showToken}
            onToggleTokenVisible={() => {
              setShowToken((s) => !s);
            }}
            urlPlaceholder="wss://your-server.example.com"
          />
          {(urlAnalysis.isInsecureTransport || urlAnalysis.wasHttpToWs) && serverUrl.trim().length > 0 ? (
            <View style={[styles.panel, { backgroundColor: colors.muted, borderColor: colors.warning }]}>
              <Text style={{ color: colors.warningForeground, fontSize: FontSize.xs, fontWeight: '600' }}>
                {urlAnalysis.wasHttpToWs
                  ? '⚠️ Converted http:// to a WebSocket URL. If you see ws://, your traffic is not encrypted.'
                  : '⚠️ Insecure connection — your data will not be encrypted (ws://).'}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => {
              if (urlAnalysis.normalizedWsUrl) {
                startTest(urlAnalysis.normalizedWsUrl, token);
              }
            }}
            disabled={!canTest || isTesting}
            style={({ pressed }) => [
              styles.outlineBtn,
              { borderColor: colors.border, opacity: !canTest || isTesting ? 0.4 : 1, flexDirection: 'row', gap: 8, justifyContent: 'center' },
              pressed && { opacity: 0.9 },
            ]}
          >
            {isTesting ? <Loader2 size={16} color={colors.primary} /> : null}
            <Text style={{ color: colors.foreground, fontWeight: '600' }}>{isTesting ? 'Testing…' : 'Test connection'}</Text>
          </Pressable>

          {result.kind === 'success' ? (
            <View style={[styles.panel, { borderColor: colors.success }]}>
              {result.mode === 'pairing_required' ? (
                <Text style={{ color: colors.foreground, fontSize: FontSize.sm }}>Server reachable — you may need to approve the device on the gateway after saving.</Text>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Check size={16} color={colors.success} />
                  <Text style={{ color: colors.success, fontWeight: '600' }}>Connected</Text>
                </View>
              )}
            </View>
          ) : null}

          {result.kind === 'error' ? (
            <Text style={{ color: colors.destructive, fontSize: FontSize.sm }}>Connection failed. Check URL and token.</Text>
          ) : null}

          {saveError ? <Text style={{ color: colors.destructive, fontSize: FontSize.sm }}>{saveError}</Text> : null}

          <Pressable
            onPress={onSave}
            disabled={!canSave}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: canSave ? colors.primary : colors.muted, marginTop: Spacing.lg, opacity: canSave && !pressed ? 1 : 0.6 },
            ]}
          >
            <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>Save and continue</Text>
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
            <Text style={{ color: colors.cardForeground, fontSize: FontSize.xs, textAlign: 'center', fontFamily: 'monospace' }}>
              {truncateMiddle(deviceId, 32)}
            </Text>
          ) : null}
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
        </View>
      ) : null}

      {step === 'success' ? (
        <Animated.View entering={FadeIn.duration(200)} style={styles.centerContent}>
          <View style={[styles.checkCircle, { backgroundColor: colors.muted, borderColor: colors.success }]}>
            <Check size={40} color={colors.success} />
          </View>
          <Text style={[styles.h1, { color: colors.foreground }]}>You&apos;re all set!</Text>
          <Text style={[styles.p, { color: colors.mutedForeground, textAlign: 'center' }]}>Opening chat…</Text>
        </Animated.View>
      ) : null}

      {step === 'success' ? <SuccessRedirect router={router} /> : null}
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
  centerContent: { flex: 1, paddingHorizontal: Spacing.xl, alignItems: 'center', justifyContent: 'center' },
  form: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  h1: { fontSize: FontSize['2xl'], fontWeight: '800', marginBottom: Spacing.sm, alignSelf: 'stretch' },
  p: { fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center', maxWidth: 320, marginTop: Spacing.md },
  caption: { fontSize: FontSize.xs, marginBottom: Spacing.lg, alignSelf: 'stretch' },
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
  outlineBtn: {
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingVertical: 12,
  },
  panel: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.md, marginTop: Spacing.md },
  checkCircle: { width: 88, height: 88, borderRadius: 44, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
