import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Copy, Plus } from 'lucide-react-native';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ConnectionState, ServerProfile, ThemeColors } from '@/types';
import { truncateMiddle } from '@/utils/gatewayUrl';
import { ServerProfileRow, type ProfileConnectionVisual } from './ServerProfileRow';

type Props = {
  colors: ThemeColors;
  serverProfiles: ServerProfile[];
  connectionState: ConnectionState;
  connectionDot: (isActive: boolean) => ProfileConnectionVisual;
  activeProfile: ServerProfile | null;
  deviceId: string | null;
  onSelectProfile: (id: string) => void;
  onDeleteProfile: (id: string) => void;
  onTestConnection: () => void;
  onCopyId: () => void;
  onAddServer: () => void;
  labelForConnection: (s: ConnectionState) => string;
};

function pairingLabel(s: ConnectionState): string {
  if (s.status === 'pairing_required') {
    return 'Pairing required';
  }
  if (s.status === 'connected') {
    return 'Paired';
  }
  return 'Not paired';
}

export function SettingsServerBlock({
  colors,
  serverProfiles,
  connectionState,
  connectionDot,
  activeProfile,
  deviceId,
  onSelectProfile,
  onDeleteProfile,
  onTestConnection,
  onCopyId,
  onAddServer,
  labelForConnection,
}: Props): React.JSX.Element {
  return (
    <>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Server profiles</Text>
      {serverProfiles.length === 0 ? (
        <Text style={{ color: colors.mutedForeground, fontSize: FontSize.sm }}>No saved servers yet.</Text>
      ) : (
        <View style={styles.gapSm}>
          {serverProfiles.map((p) => (
            <ServerProfileRow
              key={p.id}
              profile={p}
              isActive={p.isActive}
              connectionVisual={connectionDot(p.isActive)}
              colors={colors}
              onSelect={() => {
                onSelectProfile(p.id);
              }}
              onDelete={() => {
                onDeleteProfile(p.id);
              }}
            />
          ))}
        </View>
      )}
      <Pressable
        onPress={onAddServer}
        style={({ pressed }) => [styles.addBtn, { borderColor: colors.border }, pressed && { opacity: 0.9 }]}
      >
        <Plus size={16} color={colors.primary} />
        <Text style={{ color: colors.primary, fontSize: FontSize.sm, fontWeight: '600' }}>Add server</Text>
      </Pressable>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: Spacing.lg }]}>Current</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.row}>
          <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, width: 120 }}>Status</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.miniDot,
                {
                  backgroundColor:
                    connectionState.status === 'connected'
                      ? colors.success
                      : connectionState.status === 'connecting' || connectionState.status === 'pairing_required'
                        ? colors.warning
                        : connectionState.status === 'error'
                          ? colors.destructive
                          : colors.mutedForeground,
                },
              ]}
            />
            <Text style={{ color: colors.cardForeground, fontSize: FontSize.sm, fontWeight: '600' }}>
              {labelForConnection(connectionState)}
            </Text>
          </View>
        </View>
        <View style={styles.row}>
          <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, width: 120 }}>URL</Text>
          <Text style={{ color: colors.cardForeground, fontSize: FontSize.sm, flex: 1 }} numberOfLines={2}>
            {activeProfile ? truncateMiddle(activeProfile.url, 40) : '—'}
          </Text>
        </View>
        <Pressable
          onPress={onTestConnection}
          style={({ pressed }) => [styles.outlineBtn, { borderColor: colors.border }, pressed && { opacity: 0.9 }]}
        >
          <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '600' }}>Test connection</Text>
        </Pressable>
        <View style={styles.row}>
          <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, width: 120 }}>Pairing</Text>
          <Text style={{ color: colors.cardForeground, fontSize: FontSize.sm }}>{pairingLabel(connectionState)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, width: 120 }}>Device ID</Text>
          <Text style={{ color: colors.cardForeground, fontSize: FontSize.sm, flex: 1 }} numberOfLines={1}>
            {deviceId ? truncateMiddle(deviceId, 18) : '—'}
          </Text>
          <Pressable onPress={onCopyId} disabled={!deviceId} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
            <Copy size={16} color={deviceId ? colors.primary : colors.mutedForeground} />
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: Spacing.sm, textTransform: 'uppercase' },
  gapSm: { gap: Spacing.sm },
  addBtn: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
  },
  card: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniDot: { width: 8, height: 8, borderRadius: 4 },
  outlineBtn: { borderWidth: 1, borderRadius: BorderRadius.md, paddingVertical: 10, alignItems: 'center' },
});
