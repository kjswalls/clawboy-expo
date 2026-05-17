import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Bell, ChevronRight, Globe, Info, Palette } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import type { LanguagePreference } from '@/contexts/LanguageContext';
import { useTokens } from '@/hooks/useTokens';
import type { ThemeColors } from '@/types';
import { ThemeVariantDropdown } from '../ThemeVariantDropdown';
import { useTheme } from '@/hooks/useTheme';
import { useThemeContext } from '@/contexts/ThemeContext';
import { createPanelStyles } from './panelStyles';

const SHOW_NOTIFICATIONS_ROW = false;

type GeneralProps = {
  colors: ThemeColors;
};

export function SettingsGeneralSection({ colors }: GeneralProps): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();
  const { language, setLanguage, resolvedLanguage } = useLanguage();
  const tk = useTokens();
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const styles = useMemo(() => createPanelStyles(tk), [tk]);
  const { resolvedScheme, density } = useTheme();
  const { themeMode, darkVariant, lightVariant } = useThemeContext();

  const variantI18nKey: Record<string, string> = { dark: 'theMoon', default: 'theSun' };
  const currentVariant = resolvedScheme === 'dark' ? darkVariant : lightVariant;
  const variantLabel = t(`settings.appearance.themes.${variantI18nKey[currentVariant] ?? currentVariant}_label`, { defaultValue: currentVariant });
  const densityLabel = density === 'compact'
    ? t('settings.appearance.density.optionCompact')
    : density === 'spacious'
      ? t('settings.appearance.density.optionSpacious')
      : t('settings.appearance.density.optionComfortable');
  const appearanceSubtitle = themeMode === 'system'
    ? t('settings.nav.appearance.subtitleSystem', { variant: variantLabel, density: densityLabel })
    : themeMode === 'light'
      ? t('settings.nav.appearance.subtitleLight', { variant: variantLabel, density: densityLabel })
      : t('settings.nav.appearance.subtitleDark', { variant: variantLabel, density: densityLabel });

  const languageSubtitle = (): string => {
    if (language === 'system') {
      const langName =
        resolvedLanguage === 'zh-CN'
          ? t('settings.general.language.zh')
          : t('settings.general.language.en');
      return t('settings.general.language.subtitleSystem', { lang: langName });
    }
    if (language === 'zh-CN') return t('settings.general.language.subtitleZh');
    return t('settings.general.language.subtitleEn');
  };

  const languageOptions = useMemo(
    () => [
      { id: 'system', label: t('settings.general.language.system') },
      { id: 'en', label: t('settings.general.language.en') },
      { id: 'zh-CN', label: t('settings.general.language.zh') },
    ],
    [t],
  );

  return (
    <View style={{ marginBottom: tk.sp.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{t('settings.general.title')}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.row}>
          <Globe size={tk.iconSm} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {t('settings.general.language.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
              {languageSubtitle()}
            </Text>
          </View>
          <ThemeVariantDropdown
            value={language}
            options={languageOptions}
            onChange={(id) => {
              setLanguage(id as LanguagePreference);
            }}
            colors={colors}
          />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Pressable
          onPress={() => router.push('/settings/appearance')}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel={t('settings.nav.appearance.row')}
        >
          <Palette size={tk.iconSm} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {t('settings.nav.appearance.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
              {appearanceSubtitle}
            </Text>
          </View>
          <ChevronRight size={tk.iconSm} color={colors.mutedForeground} />
        </Pressable>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Pressable
          onPress={() => router.push('/settings/about')}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          accessibilityLabel={t('settings.general.about.accessLabel')}
          accessibilityRole="button"
        >
          <Info size={tk.iconSm} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {t('settings.general.about.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
              {t('settings.general.about.subtitle')}
            </Text>
          </View>
          <ChevronRight size={tk.iconSm} color={colors.mutedForeground} />
        </Pressable>
        {SHOW_NOTIFICATIONS_ROW && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
              accessibilityLabel={t('settings.general.notifications.title')}
            >
              <Bell size={tk.iconSm} color={colors.mutedForeground} />
              <View style={styles.flex}>
                <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
                  {t('settings.general.notifications.title')}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
                  {t('settings.general.notifications.subtitle')}
                </Text>
              </View>
              <ChevronRight size={tk.iconSm} color={colors.mutedForeground} />
            </Pressable>
          </>
        )}
      </View>

    </View>
  );
}
