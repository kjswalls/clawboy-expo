import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useTranslation } from 'react-i18next';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTokens } from '@/hooks/useTokens';
import { useExperiments } from '@/contexts/ExperimentsContext';
import { CompactSettingsSwitch } from './CompactSettingsSwitch';
import { DictationProbeModal } from './DictationProbeModal';

interface ToggleRowProps {
  title: string;
  description: string;
  value: boolean;
  locked: boolean;
  lockedLabel: string;
  onToggle: (next: boolean) => void;
}

function ToggleRow({ title, description, value, locked, lockedLabel, onToggle }: ToggleRowProps): React.JSX.Element {
  const { colors } = useTheme();
  const tk = useTokens();

  return (
    <Pressable
      onPress={() => { if (!locked) onToggle(!value); }}
      style={({ pressed }) => [
        styles.row,
        { paddingHorizontal: tk.sp.md, paddingVertical: tk.sp.sm, minHeight: tk.minTouch, opacity: pressed && !locked ? 0.75 : 1 },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: locked }}
      accessibilityLabel={title}
    >
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text style={{ color: locked ? colors.mutedForeground : colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
            {title}
          </Text>
          {locked ? (
            <View style={[styles.badge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs }}>{lockedLabel}</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 2 }}>
          {description}
        </Text>
      </View>
      <CompactSettingsSwitch value={value} />
    </Pressable>
  );
}

export function ExperimentsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const tk = useTokens();
  const {
    skipPasteWrapper,
    useIntrinsicHeight,
    stableProps,
    logDictation,
    skipPasteWrapperLocked,
    useIntrinsicHeightLocked,
    stablePropsLocked,
    logDictationLocked,
    setSkipPasteWrapper,
    setUseIntrinsicHeight,
    setStableProps,
    setLogDictation,
  } = useExperiments();

  const [pendingRestart, setPendingRestart] = useState(false);
  const [probeModalVisible, setProbeModalVisible] = useState(false);

  const handleSkipToggle = (next: boolean): void => {
    setSkipPasteWrapper(next);
    setPendingRestart(true);
  };

  const handleIntrinsicToggle = (next: boolean): void => {
    setUseIntrinsicHeight(next);
    setPendingRestart(true);
  };

  const handleStablePropsToggle = (next: boolean): void => {
    setStableProps(next);
    setPendingRestart(true);
  };

  const handleLogDictationToggle = (next: boolean): void => {
    setLogDictation(next);
  };

  const handleRestart = (): void => {
    void Updates.reloadAsync();
  };

  return (
    <View>
      <Text style={[styles.sectionDescription, { color: colors.mutedForeground, fontSize: tk.fs.xs }]}>
        {t('settings.experiments.description')}
      </Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ToggleRow
          title={t('settings.experiments.skipPasteWrapper.label')}
          description={t('settings.experiments.skipPasteWrapper.description')}
          value={skipPasteWrapper}
          locked={skipPasteWrapperLocked}
          lockedLabel={t('settings.experiments.lockedByEnv')}
          onToggle={handleSkipToggle}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <ToggleRow
          title={t('settings.experiments.useIntrinsicHeight.label')}
          description={t('settings.experiments.useIntrinsicHeight.description')}
          value={useIntrinsicHeight}
          locked={useIntrinsicHeightLocked}
          lockedLabel={t('settings.experiments.lockedByEnv')}
          onToggle={handleIntrinsicToggle}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <ToggleRow
          title={t('settings.experiments.stableProps.label')}
          description={t('settings.experiments.stableProps.description')}
          value={stableProps}
          locked={stablePropsLocked}
          lockedLabel={t('settings.experiments.lockedByEnv')}
          onToggle={handleStablePropsToggle}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <ToggleRow
          title={t('settings.experiments.logDictation.label')}
          description={t('settings.experiments.logDictation.description')}
          value={logDictation}
          locked={logDictationLocked}
          lockedLabel={t('settings.experiments.lockedByEnv')}
          onToggle={handleLogDictationToggle}
        />
      </View>

      {logDictation ? (
        <Pressable
          onPress={() => setProbeModalVisible(true)}
          style={({ pressed }) => [
            styles.probeRow,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
          ]}
          accessibilityRole="button"
        >
          <Text style={{ color: colors.foreground, fontSize: tk.fs.sm }}>
            {t('settings.experiments.dictationProbe.row')}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.sm }}>›</Text>
        </Pressable>
      ) : null}

      {pendingRestart ? (
        <View style={[styles.restartBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.restartHint, { color: colors.mutedForeground, fontSize: tk.fs.xs }]}>
            {t('settings.experiments.restartHint')}
          </Text>
          <Pressable
            onPress={handleRestart}
            style={({ pressed }) => [styles.restartBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('settings.experiments.restartNow')}
          >
            <Text style={{ color: colors.primaryForeground, fontSize: tk.fs.sm, fontWeight: '600' }}>
              {t('settings.experiments.restartNow')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <DictationProbeModal
        visible={probeModalVisible}
        onClose={() => setProbeModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionDescription: {
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  flex: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.md,
  },
  probeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.xl,
  },
  restartBanner: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  restartHint: {
    lineHeight: 18,
  },
  restartBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
});
