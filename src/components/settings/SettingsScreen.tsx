import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ArrowLeft, FlaskConical } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConnection } from '@/contexts/ConnectionContext';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, Spacing } from '@/constants/theme';
import type { ConnectionState, ServerProfile } from '@/types';
import { isDemoProfile } from '@/types';
import { AddServerSheet, type AddServerSheetRef } from './AddServerSheet';
import { AccountSection } from './AccountSection';
import { SettingsServerBlock, type ConnectionInfo } from './SettingsServerBlock';
import { SettingsDebugSection } from './sections/SettingsDebugSection';
import { SettingsFooter } from './sections/SettingsFooter';
import { SettingsGeneralSection } from './sections/SettingsGeneralSection';
import { SettingsInterfaceSection } from './sections/SettingsInterfaceSection';
import { SettingsDataMediaSection } from './sections/SettingsDataMediaSection';
import { SettingsLinkRow, SettingsLinkCard } from './SettingsLinkRow';
import { useExperiments } from '@/contexts/ExperimentsContext';
import type { ProfileConnectionVisual } from './ServerProfileRow';

function connectionDotVisual(isActive: boolean, s: ConnectionState): ProfileConnectionVisual {
  if (!isActive) return 'inactive';
  if (s.status === 'connected') return 'connected';
  if (s.status === 'connecting' || s.status === 'pairing_required') return 'connecting';
  if (s.status === 'error') return 'error';
  return 'disconnected';
}

function useConnectionInfo() {
  const { t } = useTranslation();
  return (s: ConnectionState): ConnectionInfo => {
    if (s.status === 'connected') return { label: t('settings.connection.connected') };
    if (s.status === 'connecting') return { label: t('settings.connection.connecting') };
    if (s.status === 'pairing_required') return { label: t('settings.connection.pairingRequired') };
    if (s.status === 'error') {
      if (s.error === 'auth_failed') return { label: t('settings.connection.errorAuth'), detail: s.message };
      if (s.error === 'cert_error') return { label: t('settings.connection.errorCert'), detail: s.message };
      if (s.error === 'timeout') return { label: t('settings.connection.errorTimeout'), detail: s.message };
      if (s.error === 'network') {
        if (s.hint === 'no_internet') return { label: t('settings.connection.errorNoInternet') };
        if (s.hint === 'check_tailscale') return { label: t('settings.connection.errorTailnet'), detail: s.message };
        return { label: t('settings.connection.errorNetwork'), detail: s.message };
      }
      return { label: t('settings.connection.error'), detail: s.message };
    }
    return { label: t('settings.connection.disconnected') };
  };
}

function SettingsExperimentsCard(): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();
  const { skipPasteWrapper, useIntrinsicHeight } = useExperiments();

  const onFlags = [skipPasteWrapper && 'skipPaste', useIntrinsicHeight && 'intrinsicH'].filter(Boolean);
  const experimentsSubtitle = onFlags.length > 0
    ? t('settings.nav.experiments.subtitleOn', { count: onFlags.length })
    : t('settings.nav.experiments.subtitleOff');

  return (
    <SettingsLinkCard>
      <SettingsLinkRow
        icon={FlaskConical}
        title={t('settings.nav.experiments.row')}
        subtitle={experimentsSubtitle}
        onPress={() => router.push('/settings/experiments')}
        isFirst
        isLast
      />
    </SettingsLinkCard>
  );
}

export function SettingsScreen(): React.JSX.Element {
  const router = useRouter();
  return (
    <ErrorBoundary
      fallback={(_err, reset) => <SettingsErrorFallback onReset={reset} onBack={() => { if (router.canGoBack()) router.back(); }} />}
    >
      <SettingsScreenInner />
    </ErrorBoundary>
  );
}

function SettingsErrorFallback({ onReset, onBack }: { onReset: () => void; onBack: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <SafeAreaView style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, backgroundColor: colors.background, gap: Spacing.md }]}>
      <Text style={{ fontSize: FontSize.md, fontWeight: '600', color: colors.foreground, textAlign: 'center' }}>
        {t('settings.unavailable')}
      </Text>
      <Text style={{ fontSize: FontSize.sm, color: colors.mutedForeground, textAlign: 'center', lineHeight: 20 }}>
        {t('settings.failedToRender')}
      </Text>
      <Pressable
        onPress={onReset}
        style={({ pressed }) => [{ paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: colors.primary, borderRadius: 8, opacity: pressed ? 0.8 : 1 }]}
        accessibilityLabel={t('common.tryAgain')}
        accessibilityRole="button"
      >
        <Text style={{ fontSize: FontSize.sm, fontWeight: '600', color: colors.primaryForeground }}>{t('common.tryAgain')}</Text>
      </Pressable>
      <Pressable onPress={onBack} accessibilityLabel={t('common.goBack')} accessibilityRole="button">
        <Text style={{ fontSize: FontSize.sm, color: colors.mutedForeground }}>{t('common.goBack')}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function SettingsScreenInner(): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { connectionState, connect } = useConnection();
  const { serverProfiles, activeProfile, setActiveProfile, removeProfile, getAuthTokenForProfile, disableDemoProfile } =
    useServerConfig();

  const isDemo = isDemoProfile(activeProfile);
  const isPairing = connectionState.status === 'pairing_required';

  // Poll gateway every 5s while waiting for device approval (mirrors onboarding logic).
  useEffect(() => {
    if (!isPairing || !activeProfile) return;
    const interval = setInterval(() => {
      void (async () => {
        const token = await getAuthTokenForProfile(activeProfile.id);
        if (token) connect(activeProfile.url, token);
      })();
    }, 5_000);
    return () => { clearInterval(interval); };
  }, [isPairing, activeProfile, connect, getAuthTokenForProfile]);

  const handleRetryConnect = useCallback((): void => {
    if (!activeProfile) return;
    void (async () => {
      const token = await getAuthTokenForProfile(activeProfile.id);
      if (token) connect(activeProfile.url, token);
    })();
  }, [activeProfile, connect, getAuthTokenForProfile]);

  const handleExitDemo = useCallback((): void => {
    void (async () => {
      await disableDemoProfile();
      router.replace('/onboarding');
    })();
  }, [disableDemoProfile, router]);
  const connectionInfo = useConnectionInfo();

  const addSheetRef = useRef<AddServerSheetRef>(null);
  const [pendingEditProfile, setPendingEditProfile] = useState<ServerProfile | null>(null);

  // Open edit sheet after state update so ref has the latest profile.
  useEffect(() => {
    if (!pendingEditProfile) return;
    addSheetRef.current?.presentEdit(pendingEditProfile);
    setPendingEditProfile(null);
  }, [pendingEditProfile]);

  const onSelectProfile = useCallback(
    async (id: string): Promise<void> => {
      await setActiveProfile(id);
      const p = serverProfiles.find((x) => x.id === id);
      if (!p) return;
      const token = await getAuthTokenForProfile(p.id);
      if (token) connect(p.url, token);
    },
    [connect, getAuthTokenForProfile, serverProfiles, setActiveProfile]
  );

  const onAfterSave = useCallback(
    (saved: { id: string; url: string }): void => {
      void (async () => {
        const token = await getAuthTokenForProfile(saved.id);
        if (token) connect(saved.url, token);
      })();
    },
    [connect, getAuthTokenForProfile]
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <Animated.View entering={FadeIn.duration(150)} style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/');
          }}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}
          accessibilityLabel={t('common.goBack')}
        >
          <ArrowLeft size={18} color={colors.mutedForeground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>{t('settings.title')}</Text>
        <View style={styles.back} />
      </Animated.View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom + Spacing.lg, 40) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <AccountSection />

        <SettingsServerBlock
          colors={colors}
          serverProfiles={serverProfiles}
          activeProfile={activeProfile}
          connectionState={connectionState}
          connectionDot={(isActive) => connectionDotVisual(isActive, connectionState)}
          onSelectProfile={(id) => { void onSelectProfile(id); }}
          onDeleteProfile={(id) => { void removeProfile(id); }}
          onEditProfile={(profile) => { setPendingEditProfile(profile); }}
          onAddServer={() => { addSheetRef.current?.presentNew(); }}
          onShowLogs={() => { router.push('/settings/gateway-logs'); }}
          onShowPinnedKeys={activeProfile && !isDemo ? () => router.push({ pathname: '/settings/pinned-keys', params: { profileId: activeProfile.id } }) : undefined}
          connectionInfo={connectionInfo}
          onExitDemo={isDemo ? handleExitDemo : undefined}
          onRetryConnect={handleRetryConnect}
        />

        <View style={{ height: Spacing.xl }} />

        <SettingsGeneralSection colors={colors} />

        <SettingsInterfaceSection colors={colors} />

        <SettingsDataMediaSection colors={colors} />

        <SettingsExperimentsCard />

        <SettingsDebugSection colors={colors} />

        <SettingsFooter colors={colors} />
      </ScrollView>

      <AddServerSheet
        ref={addSheetRef}
        onAfterSave={onAfterSave}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.sm, fontWeight: '500' },
  scroll: { paddingHorizontal: Spacing.md, paddingTop: Spacing.lg },
});
