import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useConnection } from '@/contexts/ConnectionContext';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, Spacing } from '@/constants/theme';
import type { ConnectionState, ServerProfile } from '@/types';
import { AddServerSheet, type AddServerSheetRef } from './AddServerSheet';
import { AccountCard } from './AccountCard';
import { SettingsServerBlock } from './SettingsServerBlock';
import {
  SettingsAppearanceSection,
  SettingsFooter,
  SettingsGeneralSection,
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
  const { theme, setTheme, colors } = useTheme();
  const { connectionState, connect, disconnect } = useConnection();
  const { serverProfiles, activeProfile, setActiveProfile, removeProfile, getAuthTokenForProfile } =
    useServerConfig();

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
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={18} color={colors.mutedForeground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
        <View style={styles.back} />
      </Animated.View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <AccountCard colors={colors} />

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
          labelForConnection={labelForConnection}
        />

        <View style={{ height: Spacing.xl }} />

        <SettingsGeneralSection colors={colors} />

        <SettingsAppearanceSection
          colors={colors}
          theme={theme}
          setTheme={setTheme}
        />

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
  scroll: { paddingHorizontal: Spacing.md, paddingTop: Spacing.lg, paddingBottom: 40 },
});
