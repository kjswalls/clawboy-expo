import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ArrowLeft } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConnection } from '@/contexts/ConnectionContext';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, Spacing } from '@/constants/theme';
import type { ConnectionState, ServerProfile } from '@/types';
import { AddServerSheet, type AddServerSheetRef } from './AddServerSheet';
import { GatewayLogsModal, type GatewayLogsModalRef } from './GatewayLogsModal';
import { AccountSection } from './AccountSection';
import { SettingsServerBlock } from './SettingsServerBlock';
import {
  SettingsAppearanceSection,
  SettingsFooter,
  SettingsGeneralSection,
  SettingsMediaSection,
} from './SettingsMetaPanels';
import type { ProfileConnectionVisual } from './ServerProfileRow';

function connectionDotVisual(isActive: boolean, s: ConnectionState): ProfileConnectionVisual {
  if (!isActive) return 'inactive';
  if (s.status === 'connected') return 'connected';
  if (s.status === 'connecting' || s.status === 'pairing_required') return 'connecting';
  if (s.status === 'error') return 'error';
  return 'disconnected';
}

function labelForConnection(s: ConnectionState): string {
  if (s.status === 'connected') return 'Connected';
  if (s.status === 'connecting') return 'Connecting';
  if (s.status === 'pairing_required') return 'Pairing required';
  if (s.status === 'error') return 'Error';
  return 'Disconnected';
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
  return (
    <SafeAreaView style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, backgroundColor: colors.background, gap: Spacing.md }]}>
      <Text style={{ fontSize: FontSize.md, fontWeight: '600', color: colors.foreground, textAlign: 'center' }}>
        Settings unavailable
      </Text>
      <Text style={{ fontSize: FontSize.sm, color: colors.mutedForeground, textAlign: 'center', lineHeight: 20 }}>
        This screen failed to render.
      </Text>
      <Pressable
        onPress={onReset}
        style={({ pressed }) => [{ paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: colors.primary, borderRadius: 8, opacity: pressed ? 0.8 : 1 }]}
        accessibilityLabel="Try again"
        accessibilityRole="button"
      >
        <Text style={{ fontSize: FontSize.sm, fontWeight: '600', color: '#fff' }}>Try again</Text>
      </Pressable>
      <Pressable onPress={onBack} accessibilityLabel="Go back" accessibilityRole="button">
        <Text style={{ fontSize: FontSize.sm, color: colors.mutedForeground }}>Go back</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function SettingsScreenInner(): React.JSX.Element {
  const router = useRouter();
  const { themeMode, setThemeMode, darkVariant, setDarkVariant, lightVariant, setLightVariant, resolvedScheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { connectionState, connect, disconnect } = useConnection();
  const { serverProfiles, activeProfile, setActiveProfile, removeProfile, getAuthTokenForProfile } =
    useServerConfig();

  const addSheetRef = useRef<AddServerSheetRef>(null);
  const logsModalRef = useRef<GatewayLogsModalRef>(null);
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
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={18} color={colors.mutedForeground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
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
          labelForConnection={labelForConnection}
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

        <SettingsMediaSection colors={colors} />

        <SettingsFooter colors={colors} />
      </ScrollView>

      <AddServerSheet
        ref={addSheetRef}
        onAfterSave={onAfterSave}
      />

      <GatewayLogsModal ref={logsModalRef} />
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
