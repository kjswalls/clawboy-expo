import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bug, ChevronRight, FlaskConical, ShieldAlert, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useTokens } from '@/hooks/useTokens';
import { FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import { BrandLoader } from '@/components/common/BrandLoader';
import { useConnection } from '@/contexts/ConnectionContext';
import { DemoOpenClawClient } from '@/lib/demo/DemoOpenClawClient';
import { useExperiments } from '@/contexts/ExperimentsContext';
import { DevTokenRow } from './DevTokenRow';
import { createPanelStyles } from './panelStyles';
import type { DeveloperMode } from '@/hooks/useDeveloperMode';

export function SettingsDeveloperSection({
  colors,
  mode,
}: {
  colors: ThemeColors;
  mode: DeveloperMode;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const router = useRouter();
  const tk = useTokens();
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const styles = useMemo(() => createPanelStyles(tk), [tk]);
  const [showLoader, setShowLoader] = useState(false);
  const insets = useSafeAreaInsets();
  const { client } = useConnection();
  const demoClient =
    (client.current as unknown) instanceof DemoOpenClawClient
      ? (client.current as unknown as DemoOpenClawClient)
      : null;
  const { skipPasteWrapper, useIntrinsicHeight } = useExperiments();

  if (!mode.visible) return null;

  const onFlags = [skipPasteWrapper && 'skipPaste', useIntrinsicHeight && 'intrinsicH'].filter(Boolean);
  const experimentsSubtitle = onFlags.length > 0
    ? t('settings.nav.experiments.subtitleOn', { count: onFlags.length })
    : t('settings.nav.experiments.subtitleOff');

  return (
    <View style={{ marginBottom: tk.sp.xl }}>
      {/* Section header */}
      <View style={[devStyles.sectionHeader]}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginBottom: 0 }]}>
          {t('settings.developer.title')}
        </Text>
        <Pressable
          onPress={mode.hide}
          style={({ pressed }) => [devStyles.hideBtn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={t('settings.developer.hide')}
        >
          <Text style={[devStyles.hideBtnText, { color: colors.mutedForeground }]}>
            {t('settings.developer.hide')}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Dev token row — always shown when visible */}
        <DevTokenRow
          colors={colors}
          tokenStatus={mode.tokenStatus}
          onStatusChange={mode.refreshTokenStatus}
        />

        {mode.unlocked && (
          <>
            {/* BrandLoader preview */}
            <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <Pressable
                onPress={() => setShowLoader(true)}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
                accessibilityRole="button"
                accessibilityLabel="BrandLoader preview"
              >
                <Bug size={tk.iconSm} color={colors.mutedForeground} />
                <View style={styles.flex}>
                  <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
                    BrandLoader preview
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
                    Both large and small variants
                  </Text>
                </View>
                <ChevronRight size={tk.iconSm} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Fake exec approval — demo client only */}
            {demoClient ? (
              <Pressable
                onPress={() => demoClient.emitFakeExecApprovalRequested()}
                style={({ pressed }) => [styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { opacity: 0.75 }]}
                accessibilityRole="button"
                accessibilityLabel="Trigger fake exec approval"
              >
                <ShieldAlert size={tk.iconSm} color={colors.mutedForeground} />
                <View style={styles.flex}>
                  <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
                    Trigger fake exec approval
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
                    Emits a demo approval card in the active chat
                  </Text>
                </View>
              </Pressable>
            ) : null}

            {/* Experiments nav row */}
            <Pressable
              onPress={() => router.push('/settings/experiments')}
              style={({ pressed }) => [
                styles.row,
                { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                pressed && { opacity: 0.75 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('settings.nav.experiments.row')}
            >
              <FlaskConical size={tk.iconSm} color={colors.mutedForeground} />
              <View style={styles.flex}>
                <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
                  {t('settings.nav.experiments.row')}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }} numberOfLines={1}>
                  {experimentsSubtitle}
                </Text>
              </View>
              <ChevronRight size={tk.iconSm} color={colors.mutedForeground} />
            </Pressable>
          </>
        )}
      </View>

      {/* BrandLoader modal */}
      <Modal visible={showLoader} animationType="fade" transparent={false} onRequestClose={() => setShowLoader(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <View style={loaderStyles.header}>
            <Text style={[loaderStyles.headerTitle, { color: colors.foreground }]}>BrandLoader Preview</Text>
            <Pressable
              onPress={() => setShowLoader(false)}
              style={({ pressed }) => [loaderStyles.closeBtn, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View style={loaderStyles.section}>
            <Text style={[loaderStyles.label, { color: colors.mutedForeground }]}>variant="large"</Text>
            <View style={[loaderStyles.loaderBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <BrandLoader variant="large" label="Loading…" />
            </View>
          </View>

          <View style={loaderStyles.section}>
            <Text style={[loaderStyles.label, { color: colors.mutedForeground }]}>variant="small"</Text>
            <View style={[loaderStyles.loaderBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <BrandLoader variant="small" />
            </View>
          </View>

          <View style={loaderStyles.section}>
            <Text style={[loaderStyles.label, { color: colors.mutedForeground }]}>Side by side</Text>
            <View style={[loaderStyles.sideBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <BrandLoader variant="large" />
              <BrandLoader variant="small" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const devStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  hideBtn: { paddingVertical: 2, paddingLeft: 12 },
  hideBtnText: { fontSize: FontSize.xs },
});

const loaderStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: FontSize.sm, fontWeight: '600' },
  closeBtn: { padding: 6 },
  section: { paddingHorizontal: Spacing.md, marginBottom: Spacing.xl },
  label: { fontSize: FontSize.xs, fontWeight: '500', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  loaderBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
});
