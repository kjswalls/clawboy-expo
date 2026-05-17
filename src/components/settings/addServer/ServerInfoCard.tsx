import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Server } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { FontSize } from '@/constants/theme';
import type { ServerProfile, ThemeColors } from '@/types';
import { truncateMiddle } from '@/utils/gatewayUrl';
import { addServerStyles as s } from './addServerStyles';

interface ServerInfoCardProps {
  editingProfile: ServerProfile;
  deviceId: string | null;
  onResetDeviceIdentity: () => void;
  colors: ThemeColors;
  t: ReturnType<typeof import('react-i18next').useTranslation>['t'];
}

export function ServerInfoCard({
  editingProfile,
  deviceId,
  onResetDeviceIdentity,
  colors,
  t,
}: ServerInfoCardProps): React.JSX.Element {
  return (
    <View style={[s.serverCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={s.serverRow}>
        <View style={[s.serverIcon, { backgroundColor: colors.secondary }]}>
          <Server size={18} color={colors.mutedForeground} />
        </View>
        <View style={s.flex}>
          <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
            {editingProfile.name}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs }} numberOfLines={1}>
            {editingProfile.url}
          </Text>
        </View>
      </View>

      {deviceId ? (
        <>
          <View style={[s.inCardDivider, { backgroundColor: colors.border }]} />
          <Pressable
            onPress={() => { void Clipboard.setStringAsync(deviceId); }}
            style={({ pressed }) => [s.deviceIdRow, pressed && { opacity: 0.75 }]}
            accessibilityLabel={t('common.copy')}
            accessibilityRole="button"
          >
            <View style={s.flex}>
              <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, fontWeight: '500', marginBottom: 2 }}>
                {t('settings.addServer.deviceId')}
              </Text>
              <Text
                style={{ color: colors.foreground, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
                numberOfLines={1}
              >
                {truncateMiddle(deviceId, 36)}
              </Text>
            </View>
            <Text style={{ color: colors.primary, fontSize: FontSize.xs, flexShrink: 0 }}>
              {t('settings.addServer.copy')}
            </Text>
          </Pressable>
          <View style={[s.inCardDivider, { backgroundColor: colors.border }]} />
          <Pressable
            onPress={onResetDeviceIdentity}
            style={({ pressed }) => [s.deviceIdRow, pressed && { opacity: 0.75 }]}
            accessibilityLabel={t('settings.addServer.forgetDevice')}
          >
            <View style={s.flex}>
              <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
                {t('settings.addServer.forgetDevice')}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 2 }} numberOfLines={2}>
                {t('settings.addServer.forgetDeviceBody')}
              </Text>
            </View>
            <Text style={{ color: colors.destructive, fontSize: FontSize.xs, fontWeight: '600', flexShrink: 0 }}>
              {t('settings.addServer.resetIdentityLabel')}
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}
