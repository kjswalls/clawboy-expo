import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ArrowLeft } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConnection } from '@/contexts/ConnectionContext';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, Spacing } from '@/constants/theme';
import type { ConnectionState, ServerProfile } from '@/types';
import { DEMO_PROFILE_ID } from '@/types';
import { AddServerSheet, type AddServerSheetRef } from './AddServerSheet';
import { GatewayLogsModal, type GatewayLogsModalRef } from './GatewayLogsModal';
import { PinnedKeysScreen } from './PinnedKeysScreen';
import { AccountSection } from './AccountSection';
import { SettingsServerBlock } from './SettingsServerBlock';
import {
  SettingsAppearanceSection,
  SettingsFooter,
  SettingsGeneralSection,
  SettingsMediaSection,
} from './SettingsMetaPanels';
import { SettingsTtsSection } from './SettingsTtsSection';
import type { ProfileConnectionVisual } from './ServerProfileRow';

function connectionDotVisual(isActive: boolean, s: ConnectionState): ProfileConnectionVisual {
  if (!isActive) return 'inactive';
  if (s.status === 'connected') return 'connected';
  if (s.status === 'connecting' || s.status === 'pairing_required') return 'connecting';
  if (s.status === 'error') return 'error';
  return 'disconnected';
}

function useLabelForConnection() {
  const { t } = useTranslation();
  return (s: ConnectionState): string => {
    if (s.status === 'connected') return t('settings.connection.connected');
    if (s.status === 'connecting') return t('settings.connection.connecting');
    if (s.status === 'pairing_required') return t('settings.connection.pairingRequired');
    if (s.status === 'error') return t('settings.connection.error');
    return t('settings.connection.disconnected');
  };
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
        <Text style={{ fontSize: FontSize.sm, fontWeight: '600', color: '#fff' }}>{t('common.tryAgain')}</Text>
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
  const { themeMode, setThemeMode, darkVariant, setDarkVariant, lightVariant, setLightVariant, resolvedScheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { connectionState, connect } = useConnection();
  const { serverProfiles, activeProfile, setActiveProfile, removeProfile, getAuthTokenForProfile, updateProfileSecurity, disableDemoProfile } =
    useServerConfig();

  const isDemo = activeProfile?.id === DEMO_PROFILE_ID;
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
  const labelForConnection = useLabelForConnection();

  const addSheetRef = useRef<AddServerSheetRef>(null);
  const logsModalRef = useRef<GatewayLogsModalRef>(null);
  const [pendingEditProfile, setPendingEditProfile] = useState<ServerProfile | null>(null);
  const [showPinnedKeys, setShowPinnedKeys] = useState(false);

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
          onShowLogs={() => { logsModalRef.current?.present(); }}
          onShowPinnedKeys={activeProfile && !isDemo ? () => setShowPinnedKeys(true) : undefined}
          labelForConnection={labelForConnection}
          onExitDemo={isDemo ? handleExitDemo : undefined}
          onRetryConnect={handleRetryConnect}
        />

        <View style={{ height: Spacing.xl }} />

        <SettingsGeneralSection colors={colors} />

        <SettingsAppearanceSection
          colors={colors}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          darkVariant={darkVariant}
          setDarkVariant={setDarkVariant}
          lightVariant={lightVariant}
          setLightVariant={setLightVariant}
          resolvedScheme={resolvedScheme}
        />

        <SettingsTtsSection colors={colors} />

        <SettingsMediaSection colors={colors} />

        <SettingsFooter colors={colors} />
      </ScrollView>

      <AddServerSheet
        ref={addSheetRef}
        onAfterSave={onAfterSave}
      />

      <GatewayLogsModal ref={logsModalRef} />

      {activeProfile ? (
        <PinnedKeysScreen
          visible={showPinnedKeys}
          profile={activeProfile}
          onClose={() => setShowPinnedKeys(false)}
          onUpdatePins={async (profileId, newPins) => {
            await updateProfileSecurity(profileId, { pinnedSpkiSha256: newPins });
          }}
        />
      ) : null}
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
