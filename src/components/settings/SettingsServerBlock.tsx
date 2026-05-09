import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlaskConical, Key, Plus, RefreshCw, ScrollText, Server, Settings, Wifi } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ConnectionState, ServerProfile, ThemeColors } from '@/types';
import { isDemoProfile, DEMO_PROFILE_ID } from '@/types';
import { ServerProfileRow, type ProfileConnectionVisual } from './ServerProfileRow';
import { SettingsPairingCard } from './SettingsPairingCard';

export interface ConnectionInfo {
  label: string;
  detail?: string;
}

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
  connectionInfo: (s: ConnectionState) => ConnectionInfo;
  /** Called when the user taps "Exit demo & add server". Demo-profile only. */
  onExitDemo?: () => void;
  onRetryConnect?: () => void;
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
  connectionInfo,
  onExitDemo,
  onRetryConnect,
}: Props): React.JSX.Element {
  const textColor = statusTextColor(connectionState, colors);
  const { t } = useTranslation();
  const { label: connectionLabel, detail: connectionDetail } = connectionInfo(connectionState);
  const isError = connectionState.status === 'error';
  const isRetrying = connectionState.status === 'connecting';

  const isDemo = isDemoProfile(activeProfile);
  const isPairing = connectionState.status === 'pairing_required';

  return (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('settings.server.sectionTitle')}</Text>

      {/* Demo profile card */}
      {isDemo ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.serverRow}>
            <View style={[styles.serverIcon, { backgroundColor: colors.secondary }]}>
              <FlaskConical size={18} color={colors.mutedForeground} />
            </View>
            <View style={styles.flex}>
              <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
                {t('onboarding.demo.profileName')}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
                {t('onboarding.demo.profileSub')}
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.actionRow}>
            {onExitDemo ? (
              <Pressable
                onPress={onExitDemo}
                style={({ pressed }) => [
                  styles.pillBtn,
                  { borderColor: `${colors.destructive}50` },
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityLabel={t('onboarding.demo.exitDemo')}
              >
                <Settings size={11} color={colors.destructive} />
                <Text style={[styles.pillLabel, { color: colors.destructive }]}>
                  {t('onboarding.demo.exitDemo')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Current (real) server card */}
      {activeProfile && !isDemo ? (
        <>
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
                {connectionLabel}
              </Text>
            </View>
          </View>

          {isError ? (
            <View style={[styles.errorBlock, { backgroundColor: `${colors.destructive}0C`, borderTopColor: colors.border }]}>
              {connectionDetail ? (
                <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, lineHeight: 16 }}>
                  {connectionDetail}
                </Text>
              ) : null}
              {onRetryConnect ? (
                <Pressable
                  onPress={isRetrying ? undefined : onRetryConnect}
                  disabled={isRetrying}
                  style={({ pressed }) => [
                    styles.retryBtn,
                    { borderColor: `${colors.destructive}50`, backgroundColor: `${colors.destructive}14` },
                    pressed && !isRetrying ? { opacity: 0.7 } : null,
                    isRetrying ? { opacity: 0.45 } : null,
                  ]}
                  accessibilityLabel={t('settings.connection.retryNow')}
                  accessibilityRole="button"
                >
                  <RefreshCw size={11} color={colors.destructive} />
                  <Text style={[styles.retryLabel, { color: colors.destructive }]}>
                    {isRetrying ? t('settings.connection.connecting') : t('settings.connection.retryNow')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={[styles.actionRow, isPairing ? styles.actionRowDimmed : undefined]} pointerEvents={isPairing ? 'none' : 'auto'}>
            <Pressable
              onPress={() => onEditProfile(activeProfile)}
              style={({ pressed }) => [
                styles.pillBtn,
                { borderColor: `${colors.foreground}30` },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel={t('settings.server.editConnection')}
            >
              <Settings size={11} color={colors.foreground} />
              <Text style={[styles.pillLabel, { color: colors.foreground }]}>
                {t('settings.server.editConnection')}
              </Text>
            </Pressable>
            <Pressable
              onPress={onShowLogs}
              style={({ pressed }) => [
                styles.pillBtn,
                { borderColor: `${colors.foreground}30` },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel={t('settings.server.gatewayLogs')}
            >
              <ScrollText size={11} color={colors.foreground} />
              <Text style={[styles.pillLabel, { color: colors.foreground }]}>
                {t('settings.server.gatewayLogs')}
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
                accessibilityLabel={t('settings.server.pinnedKeys')}
              >
                <Key size={11} color={colors.foreground} />
                <Text style={[styles.pillLabel, { color: colors.foreground }]}>
                  {t('settings.server.pinnedKeys')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Pairing card — shown below the Current Connection card when approval is pending */}
        {isPairing ? (
          <SettingsPairingCard onRetry={onRetryConnect} />
        ) : null}
        </>
      ) : null}

      {/* Server profiles + add button: hidden in demo mode */}
      {!isDemo ? (
        <>
          <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>{t('settings.server.profilesLabel')}</Text>

          {serverProfiles.filter((p) => p.id !== DEMO_PROFILE_ID).length === 0 ? (
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.sm, marginBottom: Spacing.sm }}>
              {t('settings.server.noSaved')}
            </Text>
          ) : (
            <View style={[styles.profilesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {serverProfiles.filter((p) => p.id !== DEMO_PROFILE_ID).map((p, i) => (
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
              {t('settings.server.addServer')}
            </Text>
          </Pressable>
        </>
      ) : null}
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
  actionRowDimmed: {
    opacity: 0.45,
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
  errorBlock: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  retryLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
});
