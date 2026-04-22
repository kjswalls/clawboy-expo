import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Bot } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useConnection } from '@/contexts/ConnectionContext';
import { useAgents } from '@/hooks/useAgents';
import { useModels } from '@/hooks/useModels';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useTheme } from '@/hooks/useTheme';
import { clearDeviceIdentity, getOrCreateDeviceIdentity } from '@/lib/device-identity';
import { FontSize, Spacing } from '@/constants/theme';
import type { ConnectionState } from '@/types';
import { AddServerSheet, type AddServerSheetRef } from './AddServerSheet';
import { AgentPickerModal, ModelPickerModal } from './SettingsPickers';
import { SettingsServerBlock } from './SettingsServerBlock';
import { SettingsAppearanceAndAbout } from './SettingsMetaPanels';
import type { ProfileConnectionVisual } from './ServerProfileRow';

function connectionDotVisual(isActive: boolean, s: ConnectionState): ProfileConnectionVisual {
  if (!isActive) {
    return 'inactive';
  }
  if (s.status === 'connecting') {
    return 'connecting';
  }
  if (s.status === 'connected') {
    return 'connected';
  }
  if (s.status === 'error') {
    return 'error';
  }
  if (s.status === 'pairing_required') {
    return 'connecting';
  }
  return 'disconnected';
}

function labelForConnection(s: ConnectionState): string {
  if (s.status === 'connecting') {
    return 'Connecting';
  }
  if (s.status === 'connected') {
    return 'Connected';
  }
  if (s.status === 'pairing_required') {
    return 'Pairing required';
  }
  if (s.status === 'error') {
    return 'Error';
  }
  return 'Disconnected';
}

const DOTS = ['#A855F7', '#3B82F6', '#22C55E', '#EAB308'] as const;
function ModelDot({ id }: { id: string }): React.JSX.Element {
  let n = 0;
  for (let i = 0; i < id.length; i++) {
    n = (n + id.charCodeAt(i)!) % 997;
  }
  return <View style={[styles.modelDot, { backgroundColor: DOTS[n % DOTS.length]! }]} />;
}

export function SettingsScreen(): React.JSX.Element {
  const router = useRouter();
  const { theme, setTheme, colors } = useTheme();
  const { connectionState, connect, disconnect } = useConnection();
  const { serverProfiles, activeProfile, setActiveProfile, removeProfile, getAuthTokenForProfile } =
    useServerConfig();
  const { agents, currentAgent, setCurrentAgent, refreshAgents } = useAgents();
  const { models, currentModel, setCurrentModel, refreshModels } = useModels();

  const addSheetRef = useRef<AddServerSheetRef>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);

  useEffect(() => {
    void getOrCreateDeviceIdentity().then((id) => {
      setDeviceId(id?.id ?? null);
    });
  }, []);

  const onTestConnection = useCallback(async () => {
    if (!activeProfile) {
      return;
    }
    const token = await getAuthTokenForProfile(activeProfile.id);
    if (!token) {
      Alert.alert('Missing token', 'No auth token is stored for this server.');
      return;
    }
    connect(activeProfile.url, token);
  }, [activeProfile, connect, getAuthTokenForProfile]);

  const onSelectProfile = useCallback(
    async (id: string) => {
      await setActiveProfile(id);
      const p = serverProfiles.find((x) => x.id === id);
      if (!p) {
        return;
      }
      const token = await getAuthTokenForProfile(p.id);
      if (token) {
        connect(p.url, token);
      }
    },
    [connect, getAuthTokenForProfile, serverProfiles, setActiveProfile]
  );

  const onForgetDevice = useCallback((): void => {
    Alert.alert(
      'Forget this device',
      'Clears the device keypair. You will need to approve the device again on the gateway.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await clearDeviceIdentity();
              disconnect();
              setDeviceId(null);
              void getOrCreateDeviceIdentity().then((i) => setDeviceId(i?.id ?? null));
            })();
          },
        },
      ]
    );
  }, [disconnect]);

  const onCopyId = useCallback((): void => {
    if (deviceId) {
      void Clipboard.setStringAsync(deviceId);
    }
  }, [deviceId]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <Animated.View entering={FadeIn.duration(150)} style={styles.header}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/');
            }
          }}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.75 }]}
        >
          <ArrowLeft size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
        <View style={styles.back} />
      </Animated.View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SettingsServerBlock
          colors={colors}
          serverProfiles={serverProfiles}
          connectionState={connectionState}
          connectionDot={(isActive) => {
            return connectionDotVisual(isActive, connectionState);
          }}
          activeProfile={activeProfile}
          deviceId={deviceId}
          onSelectProfile={(id) => {
            void onSelectProfile(id);
          }}
          onDeleteProfile={(id) => {
            void removeProfile(id);
          }}
          onTestConnection={onTestConnection}
          onCopyId={onCopyId}
          onAddServer={() => {
            addSheetRef.current?.present();
          }}
          labelForConnection={labelForConnection}
        />
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Agent</Text>
        <Pressable
          onPress={() => {
            void refreshAgents();
            setAgentOpen(true);
          }}
          style={({ pressed }) => [
            styles.selector,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed && { opacity: 0.95 },
          ]}
        >
          <Bot size={18} color={colors.primary} />
          <Text style={{ color: colors.cardForeground, fontSize: FontSize.sm, fontWeight: '600', flex: 1 }} numberOfLines={1}>
            {currentAgent?.name ?? 'Select an agent'}
          </Text>
          <Text style={{ color: '#888', fontSize: 18 }}>›</Text>
        </Pressable>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: Spacing.lg }]}>Model</Text>
        <Pressable
          onPress={() => {
            void refreshModels();
            setModelOpen(true);
          }}
          style={({ pressed }) => [
            styles.selector,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed && { opacity: 0.95 },
          ]}
        >
          {currentModel ? <ModelDot id={currentModel} /> : <View style={styles.dotPlaceholder} />}
          <Text style={{ color: colors.cardForeground, fontSize: FontSize.sm, fontWeight: '600', flex: 1 }} numberOfLines={1}>
            {currentModel
              ? models.find((m) => m.id === currentModel)?.name ?? currentModel
              : 'Select a model'}
          </Text>
          <Text style={{ color: '#888', fontSize: 18 }}>›</Text>
        </Pressable>
        <SettingsAppearanceAndAbout
          colors={colors}
          theme={theme}
          setTheme={setTheme}
          onForgetDevice={onForgetDevice}
        />
      </ScrollView>

      <AddServerSheet
        ref={addSheetRef}
        onAfterSave={(p) => {
          void (async () => {
            const t = await getAuthTokenForProfile(p.id);
            if (t) {
              connect(p.url, t);
            }
          })();
        }}
      />
      <AgentPickerModal
        visible={agentOpen}
        onClose={() => {
          setAgentOpen(false);
        }}
        colors={colors}
        agents={agents}
        currentId={currentAgent?.id}
        onSelect={(id) => {
          setCurrentAgent(id);
        }}
      />
      <ModelPickerModal
        visible={modelOpen}
        onClose={() => {
          setModelOpen(false);
        }}
        colors={colors}
        models={models}
        currentId={currentModel}
        onSelect={(id) => {
          setCurrentModel(id);
        }}
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
    paddingBottom: Spacing.md,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.lg, fontWeight: '700' },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: Spacing.sm, textTransform: 'uppercase' },
  selector: {
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  modelDot: { width: 8, height: 8, borderRadius: 4 },
  dotPlaceholder: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#333' },
});
