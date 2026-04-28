import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Key, Plus, ScrollText, Server, Settings, Wifi } from 'lucide-react-native';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ConnectionState, ServerProfile, ThemeColors } from '@/types';
import { ServerProfileRow, type ProfileConnectionVisual } from './ServerProfileRow';

type Props = {
  colors: ThemeColors;
  serverProfiles: ServerProfile[];
  activeProfile: ServerProfile | null;
  connectionState: ConnectionState;
  connectionDot: (isActive: boolean) => ProfileConnectionVisual;
  onSelectProfile: (id: string) => void;
  onDeleteProfile: (id: string) => void;
  onEditProfile: (profile: ServerProfile) => void;
  onAddServer: () => void;
  onShowLogs: () => void;
  onShowPinnedKeys?: () => void;
  labelForConnection: (s: ConnectionState) => string;
};

function statusTextColor(state: ConnectionState, colors: ThemeColors): string {
  if (state.status === 'connected') return colors.success;
  if (state.status === 'connecting' || state.status === 'pairing_required') return colors.warning;
  if (state.status === 'error') return colors.destructive;
  return colors.mutedForeground;
}

export function SettingsServerBlock({
  colors,
  serverProfiles,
  activeProfile,
  connectionState,
  connectionDot,
  onSelectProfile,
  onDeleteProfile,
  onEditProfile,
  onAddServer,
  onShowLogs,
  onShowPinnedKeys,
  labelForConnection,
}: Props): React.JSX.Element {
  const textColor = statusTextColor(connectionState, colors);

  return (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Connection</Text>

      {/* Current server card */}
      {activeProfile ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.serverRow}>
            <View style={[styles.serverIcon, { backgroundColor: colors.secondary }]}>
              <Server size={18} color={colors.mutedForeground} />
            </View>
            <View style={styles.flex}>
              <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
                {activeProfile.name}
              </Text>
              <View style={styles.urlRow}>
                <Wifi size={11} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, flex: 1 }} numberOfLines={1}>
                  {activeProfile.url.replace(/^wss?:\/\//, '')}
                </Text>
              </View>
            </View>
            <View style={styles.statusGroup}>
              <View style={[styles.statusDot, { backgroundColor: textColor }]} />
              <Text style={{ color: textColor, fontSize: FontSize.xs, fontWeight: '500' }}>
                {labelForConnection(connectionState)}
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.actionRow}>
            <Pressable
              onPress={() => onEditProfile(activeProfile)}
              style={({ pressed }) => [
                styles.pillBtn,
                { borderColor: `${colors.foreground}30` },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel="Edit connection"
            >
              <Settings size={11} color={colors.foreground} />
              <Text style={[styles.pillLabel, { color: colors.foreground }]}>
                Edit connection
              </Text>
            </Pressable>
            <Pressable
              onPress={onShowLogs}
              style={({ pressed }) => [
                styles.pillBtn,
                { borderColor: `${colors.foreground}30` },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel="Gateway logs"
            >
              <ScrollText size={11} color={colors.foreground} />
              <Text style={[styles.pillLabel, { color: colors.foreground }]}>
                Gateway logs
              </Text>
            </Pressable>
            {onShowPinnedKeys ? (
              <Pressable
                onPress={onShowPinnedKeys}
                style={({ pressed }) => [
                  styles.pillBtn,
                  { borderColor: `${colors.foreground}30` },
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityLabel="Manage pinned keys"
              >
                <Key size={11} color={colors.foreground} />
                <Text style={[styles.pillLabel, { color: colors.foreground }]}>
                  Pinned keys
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Server profiles sub-section */}
      <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>Server profiles</Text>

      {serverProfiles.length === 0 ? (
        <Text style={{ color: colors.mutedForeground, fontSize: FontSize.sm, marginBottom: Spacing.sm }}>
          No saved servers yet.
        </Text>
      ) : (
        <View style={[styles.profilesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {serverProfiles.map((p, i) => (
            <React.Fragment key={p.id}>
              {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
              <ServerProfileRow
                profile={p}
                isActive={p.isActive}
                connectionVisual={connectionDot(p.isActive)}
                colors={colors}
                grouped
                onSelect={() => { onSelectProfile(p.id); }}
                onDelete={() => { onDeleteProfile(p.id); }}
                onEdit={() => { onEditProfile(p); }}
              />
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Add server button */}
      <Pressable
        onPress={onAddServer}
        style={({ pressed }) => [
          styles.addBtn,
          { backgroundColor: colors.secondary, borderColor: colors.border },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Plus size={13} color={colors.primary} />
        <Text style={{ color: colors.foreground, fontSize: FontSize.xs, fontWeight: '500' }}>
          Add server profile
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: 12 },
  subLabel: { fontSize: FontSize.xs, fontWeight: '500', marginTop: Spacing.md, marginBottom: 8 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    marginBottom: 4,
    overflow: 'hidden',
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  serverIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urlRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  statusGroup: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  divider: { height: StyleSheet.hairlineWidth },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'nowrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  profilesCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
});
