import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Trash2, Video } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTokens } from '@/hooks/useTokens';
import type { ThemeColors } from '@/types';
import { useMediaCacheReplay } from '@/hooks/useMediaCacheReplay';
import { clearMediaCache, getMediaCacheUsageBytes } from '@/lib/media/downloadMedia';
import { clearAllCachedSessions, getChatCacheUsageBytes } from '@/lib/chatCache/store';
import { CompactSettingsSwitch } from '../CompactSettingsSwitch';
import { createPanelStyles } from './panelStyles';

type MediaProps = {
  colors: ThemeColors;
};

export function SettingsMediaSection({ colors }: MediaProps): React.JSX.Element {
  const { t } = useTranslation();
  const tk = useTokens();
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const styles = useMemo(() => createPanelStyles(tk), [tk]);
  const [cacheReplay, setCacheReplay] = useMediaCacheReplay();
  const [clearingMedia, setClearingMedia] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);

  const performClearMedia = async (bytesBefore: number): Promise<void> => {
    setClearingMedia(true);
    try {
      await clearMediaCache();
      const mb = Math.round(bytesBefore / (1024 * 1024));
      Alert.alert(
        t('settings.media.clearMedia.successTitle'),
        mb > 0 ? t('settings.media.clearMedia.successMb', { mb }) : t('settings.media.clearMedia.successEmpty'),
      );
    } catch {
      Alert.alert(t('common.error'), t('settings.media.clearMedia.errorBody'));
    } finally {
      setClearingMedia(false);
    }
  };

  const handleClearMedia = async (): Promise<void> => {
    const bytesBefore = await getMediaCacheUsageBytes();
    const mb = Math.round(bytesBefore / (1024 * 1024));
    Alert.alert(
      t('settings.media.clearMedia.alertTitle'),
      mb > 0 ? t('settings.media.clearMedia.alertBodyMb', { mb }) : t('settings.media.clearMedia.alertBodyEmpty'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.clear'), style: 'destructive', onPress: () => { void performClearMedia(bytesBefore); } },
      ],
    );
  };

  const performClearChat = async (bytesBefore: number): Promise<void> => {
    setClearingChat(true);
    try {
      await clearAllCachedSessions();
      const kb = Math.round(bytesBefore / 1024);
      Alert.alert(
        t('settings.media.clearChat.successTitle'),
        kb > 0 ? t('settings.media.clearChat.successKb', { kb }) : t('settings.media.clearChat.successEmpty'),
      );
    } catch {
      Alert.alert(t('common.error'), t('settings.media.clearChat.errorBody'));
    } finally {
      setClearingChat(false);
    }
  };

  const handleClearChat = async (): Promise<void> => {
    const bytesBefore = await getChatCacheUsageBytes();
    const kb = Math.round(bytesBefore / 1024);
    Alert.alert(
      t('settings.media.clearChat.alertTitle'),
      bytesBefore > 0
        ? t('settings.media.clearChat.alertBodyKb', { kb })
        : t('settings.media.clearChat.alertBodyEmpty'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.clear'), style: 'destructive', onPress: () => { void performClearChat(bytesBefore); } },
      ],
    );
  };

  return (
    <View style={{ marginBottom: tk.sp.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{t('settings.media.title')}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Cache toggle */}
        <Pressable
          onPress={() => setCacheReplay(!cacheReplay)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          accessibilityRole="switch"
          accessibilityValue={{ text: cacheReplay ? 'on' : 'off' }}
        >
          <Video size={tk.iconSm} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {t('settings.media.cacheVideos.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
              {cacheReplay
                ? t('settings.media.cacheVideos.on')
                : t('settings.media.cacheVideos.off')}
            </Text>
          </View>
          <CompactSettingsSwitch value={cacheReplay} />
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Clear downloaded media */}
        <Pressable
          onPress={() => { void handleClearMedia(); }}
          disabled={clearingMedia}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.65 }]}
          accessibilityRole="button"
          accessibilityLabel={t('settings.media.clearMedia.row')}
        >
          <Trash2 size={tk.iconSm} color={colors.destructive} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {clearingMedia ? t('settings.media.clearMedia.clearing') : t('settings.media.clearMedia.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
              {t('settings.media.clearMedia.subtitle')}
            </Text>
          </View>
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Clear chat cache */}
        <Pressable
          onPress={() => { void handleClearChat(); }}
          disabled={clearingChat}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.65 }]}
          accessibilityRole="button"
          accessibilityLabel={t('settings.media.clearChat.row')}
        >
          <Trash2 size={tk.iconSm} color={colors.destructive} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {clearingChat ? t('settings.media.clearChat.clearing') : t('settings.media.clearChat.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
              {t('settings.media.clearChat.subtitle')}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
