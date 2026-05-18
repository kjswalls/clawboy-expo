import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bug, ChevronRight, ShieldAlert, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '@/hooks/useTokens';
import { FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import { BrandLoader } from '@/components/common/BrandLoader';
import { useConnection } from '@/contexts/ConnectionContext';
import { DemoOpenClawClient } from '@/lib/demo/DemoOpenClawClient';
import { createPanelStyles } from './panelStyles';

export function SettingsDebugSection({ colors }: { colors: ThemeColors }): React.JSX.Element | null {
  if (!__DEV__) return null;

  const tk = useTokens(); // eslint-disable-line react-hooks/rules-of-hooks
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const styles = useMemo(() => createPanelStyles(tk), [tk]); // eslint-disable-line react-hooks/rules-of-hooks
  const [showLoader, setShowLoader] = useState(false); // eslint-disable-line react-hooks/rules-of-hooks
  const insets = useSafeAreaInsets(); // eslint-disable-line react-hooks/rules-of-hooks
  const { client } = useConnection(); // eslint-disable-line react-hooks/rules-of-hooks
  const demoClient = (client.current as unknown) instanceof DemoOpenClawClient ? (client.current as unknown as DemoOpenClawClient) : null;

  return (
    <View style={{ marginBottom: tk.sp.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Debug</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
      </View>

      <Modal visible={showLoader} animationType="fade" transparent={false} onRequestClose={() => setShowLoader(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <View style={debugStyles.header}>
            <Text style={[debugStyles.headerTitle, { color: colors.foreground }]}>BrandLoader Preview</Text>
            <Pressable
              onPress={() => setShowLoader(false)}
              style={({ pressed }) => [debugStyles.closeBtn, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Large variant */}
          <View style={debugStyles.section}>
            <Text style={[debugStyles.label, { color: colors.mutedForeground }]}>variant="large"</Text>
            <View style={[debugStyles.loaderBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <BrandLoader variant="large" label="Loading…" />
            </View>
          </View>

          {/* Small variant */}
          <View style={debugStyles.section}>
            <Text style={[debugStyles.label, { color: colors.mutedForeground }]}>variant="small"</Text>
            <View style={[debugStyles.loaderBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <BrandLoader variant="small" />
            </View>
          </View>

          {/* Both side by side */}
          <View style={debugStyles.section}>
            <Text style={[debugStyles.label, { color: colors.mutedForeground }]}>Side by side</Text>
            <View style={[debugStyles.sideBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <BrandLoader variant="large" />
              <BrandLoader variant="small" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const debugStyles = StyleSheet.create({
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
