import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight, Video, Volume2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTokens } from '@/hooks/useTokens';
import type { ThemeColors } from '@/types';
import { useTtsPreferences } from '@/hooks/useTtsPreferences';
import { useMediaCacheReplay } from '@/hooks/useMediaCacheReplay';
import { createPanelStyles } from './panelStyles';

type DataMediaProps = {
  colors: ThemeColors;
};

export function SettingsDataMediaSection({ colors }: DataMediaProps): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();
  const tk = useTokens();
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const styles = useMemo(() => createPanelStyles(tk), [tk]);
  const { autoSpeakReplies, preferDeviceTts } = useTtsPreferences();
  const [cacheReplay] = useMediaCacheReplay();

  const voiceSubtitle = !autoSpeakReplies
    ? t('settings.nav.voice.subtitleOff')
    : preferDeviceTts
      ? t('settings.nav.voice.subtitleOnDevice')
      : t('settings.nav.voice.subtitleOnServer', { provider: 'Server' });

  const mediaSubtitle = cacheReplay
    ? t('settings.nav.media.subtitleCacheOn')
    : t('settings.nav.media.subtitleCacheOff');

  return (
    <View style={{ marginBottom: tk.sp.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{t('settings.dataMedia.title')}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable
          onPress={() => router.push('/settings/voice')}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel={t('settings.nav.voice.row')}
        >
          <Volume2 size={tk.iconSm} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {t('settings.nav.voice.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
              {voiceSubtitle}
            </Text>
          </View>
          <ChevronRight size={tk.iconSm} color={colors.mutedForeground} />
        </Pressable>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Pressable
          onPress={() => router.push('/settings/media')}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel={t('settings.nav.media.row')}
        >
          <Video size={tk.iconSm} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {t('settings.nav.media.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
              {mediaSubtitle}
            </Text>
          </View>
          <ChevronRight size={tk.iconSm} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}
