import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Check, ChevronRight, Play, Volume2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import { CompactSettingsSwitch } from './CompactSettingsSwitch';
import { useTtsPreferences } from '@/hooks/useTtsPreferences';
import { useServerTts, type TtsProvider } from '@/hooks/useServerTts';
import { effectivePreferDeviceTts } from '@/hooks/effectivePreferDeviceTts';
import { useConnection } from '@/contexts/ConnectionContext';
import { speakWithDeviceTts } from '@/hooks/useAutoSpeakReply';

// ── Provider picker modal ──────────────────────────────────────────────────────

interface ProviderPickerProps {
  visible: boolean;
  providers: TtsProvider[];
  currentProvider: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  colors: ThemeColors;
}

function ProviderPickerModal({
  visible,
  providers,
  currentProvider,
  onSelect,
  onClose,
  colors,
}: ProviderPickerProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
    >
      <Pressable style={pickerStyles.overlay} onPress={onClose}>
        <Pressable style={[pickerStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[pickerStyles.title, { color: colors.foreground }]}>
            {t('settings.voice.serverProvider.modalTitle')}
          </Text>
          {providers.length === 0 ? (
            <Text style={[pickerStyles.empty, { color: colors.mutedForeground }]}>
              {t('settings.voice.serverProvider.noProviders')}
            </Text>
          ) : (
            <ScrollView style={pickerStyles.list} showsVerticalScrollIndicator={false}>
              {providers.map((p, i) => {
                const isSelected = p.id === currentProvider;
                return (
                  <React.Fragment key={p.id}>
                    {i > 0 && (
                      <View style={[pickerStyles.divider, { backgroundColor: colors.border }]} />
                    )}
                    <Pressable
                      style={({ pressed }) => [pickerStyles.row, pressed && { opacity: 0.7 }]}
                      onPress={() => onSelect(p.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                    >
                      <Text style={[pickerStyles.label, { color: colors.foreground }]}>{p.name}</Text>
                      {isSelected && <Check size={16} color={colors.primary} />}
                    </Pressable>
                  </React.Fragment>
                );
              })}
            </ScrollView>
          )}
          <View style={[pickerStyles.footnote, { borderTopColor: colors.border }]}>
            <Text style={[pickerStyles.footnoteText, { color: colors.mutedForeground }]}>
              {t('settings.voice.serverProvider.footnote')}
            </Text>
          </View>
          <Pressable
            style={[pickerStyles.cancelBtn, { borderTopColor: colors.border }]}
            onPress={onClose}
          >
            <Text style={[pickerStyles.cancelText, { color: colors.mutedForeground }]}>{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Section component ──────────────────────────────────────────────────────────

type SettingsTtsSectionProps = {
  colors: ThemeColors;
};

export function SettingsTtsSection({ colors }: SettingsTtsSectionProps): React.JSX.Element {
  const { t } = useTranslation();
  const { autoSpeakReplies, setAutoSpeakReplies, preferDeviceTts, setPreferDeviceTts } =
    useTtsPreferences();
  const serverTts = useServerTts();
  const { connectionState } = useConnection();

  const noServerVoiceProviders =
    connectionState.status === 'connected' && !serverTts.loading && serverTts.providers.length === 0;
  const effectiveDevice = effectivePreferDeviceTts({
    preferDeviceTts,
    autoSpeakReplies,
    isConnected: connectionState.status === 'connected',
    loading: serverTts.loading,
    providerCount: serverTts.providers.length,
  });

  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleTestVoice = useCallback((): void => {
    setTesting(true);
    if (!preferDeviceTts && serverTts.enabled && serverTts.currentProvider) {
      Alert.alert(
        t('settings.voice.testVoice.alertTitle'),
        t('settings.voice.testVoice.alertBody'),
      );
    }
    speakWithDeviceTts(t('settings.voice.testVoice.testPhrase'));
    setTimeout(() => setTesting(false), 1500);
  }, [preferDeviceTts, serverTts.enabled, serverTts.currentProvider, t]);

  const handleSelectProvider = useCallback(async (id: string): Promise<void> => {
    setProviderPickerOpen(false);
    const providerOk = await serverTts.setProvider(id);
    if (!providerOk) {
      Alert.alert(t('settings.voice.serverProvider.setFailed'));
      return;
    }
    if (!serverTts.enabled) {
      const enableOk = await serverTts.setEnabled(true);
      if (!enableOk) {
        // RPC failed — re-sync from gateway so the UI reflects reality.
        await serverTts.refresh();
        Alert.alert(t('settings.voice.serverProvider.setFailed'));
      }
    }
  }, [serverTts, t]);

  const providerSubtitle = (): string => {
    if (serverTts.disconnected) return t('settings.voice.serverProvider.connectToManage');
    if (serverTts.loading) return t('settings.voice.serverProvider.loading');
    if (serverTts.currentProvider) {
      return serverTts.enabled
        ? t('settings.voice.serverProvider.enabled', { provider: serverTts.currentProvider })
        : t('settings.voice.serverProvider.disabled', { provider: serverTts.currentProvider });
    }
    return t('settings.voice.serverProvider.notConfigured');
  };

  return (
    <View style={{ marginBottom: Spacing.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('settings.voice.title')}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>

        {/* Auto-speak toggle */}
        <Pressable
          onPress={() => setAutoSpeakReplies(!autoSpeakReplies)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          accessibilityRole="switch"
          accessibilityValue={{ text: autoSpeakReplies ? 'on' : 'off' }}
          accessibilityLabel={t('settings.voice.readAloud.row')}
        >
          <Volume2 size={16} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
              {t('settings.voice.readAloud.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
              {autoSpeakReplies
                ? t('settings.voice.readAloud.on')
                : t('settings.voice.readAloud.off')}
            </Text>
          </View>
          <CompactSettingsSwitch value={autoSpeakReplies} />
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Prefer device voice */}
        <Pressable
          onPress={() => {
            if (autoSpeakReplies && !noServerVoiceProviders) setPreferDeviceTts(!preferDeviceTts);
          }}
          style={({ pressed }) => [
            styles.row,
            (!autoSpeakReplies || noServerVoiceProviders) && styles.rowDisabled,
            pressed && autoSpeakReplies && !noServerVoiceProviders && { opacity: 0.75 },
          ]}
          accessibilityRole="switch"
          accessibilityValue={{ text: effectiveDevice ? 'on' : 'off' }}
          accessibilityState={{ disabled: !autoSpeakReplies || noServerVoiceProviders }}
          accessibilityLabel={t('settings.voice.deviceVoice.row')}
        >
          <View style={[styles.iconPlaceholder]} />
          <View style={styles.flex}>
            <Text
              style={{
                color: autoSpeakReplies ? colors.foreground : colors.mutedForeground,
                fontSize: FontSize.sm,
                fontWeight: '500',
              }}
            >
              {t('settings.voice.deviceVoice.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
              {noServerVoiceProviders
                ? t('settings.voice.deviceVoice.noServer')
                : t('settings.voice.deviceVoice.default')}
            </Text>
          </View>
          <CompactSettingsSwitch value={effectiveDevice} />
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Server-side voice provider */}
        <Pressable
          onPress={() => {
            if (!serverTts.disconnected && !serverTts.loading) {
              setProviderPickerOpen(true);
            }
          }}
          style={({ pressed }) => [
            styles.row,
            (serverTts.disconnected || serverTts.loading) && styles.rowDisabled,
            pressed && !serverTts.disconnected && { opacity: 0.75 },
          ]}
          accessibilityLabel={t('settings.voice.serverProvider.row')}
          accessibilityRole="button"
        >
          <View style={[styles.iconPlaceholder]} />
          <View style={styles.flex}>
            <Text
              style={{
                color: serverTts.disconnected ? colors.mutedForeground : colors.foreground,
                fontSize: FontSize.sm,
                fontWeight: '500',
              }}
            >
              {t('settings.voice.serverProvider.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
              {providerSubtitle()}
            </Text>
          </View>
          {serverTts.loading ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <ChevronRight size={16} color={colors.mutedForeground} />
          )}
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Test voice */}
        <Pressable
          onPress={handleTestVoice}
          disabled={testing}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel={t('settings.voice.testVoice.row')}
        >
          <Play size={16} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
              {testing ? t('settings.voice.testVoice.testing') : t('settings.voice.testVoice.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
              {t('settings.voice.testVoice.subtitle')}
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Provider picker modal */}
      <ProviderPickerModal
        visible={providerPickerOpen}
        providers={serverTts.providers}
        currentProvider={serverTts.currentProvider}
        onSelect={(id) => { void handleSelectProvider(id); }}
        onClose={() => setProviderPickerOpen(false)}
        colors={colors}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: 12 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
  iconPlaceholder: { width: 16 },
});

const pickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: 400,
    overflow: 'hidden',
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  label: {
    fontSize: FontSize.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  empty: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: 20,
  },
  footnote: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  footnoteText: {
    fontSize: FontSize.xs,
    lineHeight: 16,
    textAlign: 'center',
  },
  cancelBtn: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
});
