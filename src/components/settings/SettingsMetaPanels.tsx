import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, ChevronRight, Globe, Info, Moon, Palette, ShieldAlert, Smartphone, Sun, Trash2, Video } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import type { LanguagePreference } from '@/contexts/LanguageContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { DarkVariant, LightVariant, ThemeColors, ThemeMode } from '@/types';
import { SegmentedIconPill } from './SegmentedIconPill';
import { ThemeVariantDropdown } from './ThemeVariantDropdown';
import { useMediaCacheReplay } from '@/hooks/useMediaCacheReplay';
import { clearMediaCache, getMediaCacheUsageBytes } from '@/lib/media/downloadMedia';
import { clearAllCachedSessions, getChatCacheUsageBytes } from '@/lib/chatCache/store';
import { AboutScreen } from './AboutScreen';
import { CompactSettingsSwitch } from './CompactSettingsSwitch';
import { FeedbackSheet } from './FeedbackSheet';
import { useCommandConfirmations } from '@/hooks/useCommandConfirmations';
import { APP_VERSION } from '@/lib/appMeta';

const SHOW_NOTIFICATIONS_ROW = false;

// ── General Section ────────────────────────────────────────────────────────────

type GeneralProps = {
  colors: ThemeColors;
};

export function SettingsGeneralSection({ colors }: GeneralProps): React.JSX.Element {
  const [showAbout, setShowAbout] = useState(false);
  const { confirmDestructiveCommands, setConfirmDestructiveCommands } = useCommandConfirmations();
  const { t } = useTranslation();
  const { language, setLanguage, resolvedLanguage } = useLanguage();

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
    <View style={{ marginBottom: Spacing.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('settings.general.title')}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.row}>
          <Globe size={16} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
              {t('settings.general.language.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
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
          onPress={() => setShowAbout(true)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          accessibilityLabel={t('settings.general.about.accessLabel')}
          accessibilityRole="button"
        >
          <Info size={16} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
              {t('settings.general.about.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
              {t('settings.general.about.subtitle')}
            </Text>
          </View>
          <ChevronRight size={16} color={colors.mutedForeground} />
        </Pressable>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Pressable
          onPress={() => setConfirmDestructiveCommands(!confirmDestructiveCommands)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          accessibilityRole="switch"
          accessibilityState={{ checked: confirmDestructiveCommands }}
          accessibilityLabel={t('settings.general.confirmCommands.row')}
        >
          <ShieldAlert size={16} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
              {t('settings.general.confirmCommands.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
              {t('settings.general.confirmCommands.subtitle')}
            </Text>
          </View>
          <CompactSettingsSwitch value={confirmDestructiveCommands} />
        </Pressable>
        {SHOW_NOTIFICATIONS_ROW && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
              accessibilityLabel="Notifications"
            >
              <Bell size={16} color={colors.mutedForeground} />
              <View style={styles.flex}>
                <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
                  Notifications
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
                  Manage alerts and push notifications
                </Text>
              </View>
              <ChevronRight size={16} color={colors.mutedForeground} />
            </Pressable>
          </>
        )}
      </View>

      <AboutScreen visible={showAbout} onClose={() => setShowAbout(false)} />
    </View>
  );
}

// ── Appearance Section ─────────────────────────────────────────────────────────

type AppearanceProps = {
  colors: ThemeColors;
  themeMode: ThemeMode;
  setThemeMode: (t: ThemeMode) => void;
  darkVariant: DarkVariant;
  setDarkVariant: (v: DarkVariant) => void;
  lightVariant: LightVariant;
  setLightVariant: (v: LightVariant) => void;
  resolvedScheme: 'light' | 'dark';
};

type ThemeVariantId = DarkVariant | LightVariant;

const DARK_VARIANT_IDS: DarkVariant[] = ['dark', 'darkBlue', 'oneDarkPro', 'tokyoNight', 'cowgirlDark'];
const LIGHT_VARIANT_IDS: LightVariant[] = ['default', 'githubLight', 'solarizedLight', 'oneLight', 'parasol', 'cowgirlLight'];

/** Maps a variant id to the prefix used in settings.appearance.themes.* translation keys. */
const VARIANT_I18N_KEY: Record<string, string> = {
  dark:          'clawboyDark',
  darkBlue:      'afterMidnight',
  oneDarkPro:    'oneDarkPro',
  tokyoNight:    'tokyoNight',
  cowgirlDark:   'cowgirlDark',
  default:       'clawboyLight',
  githubLight:   'githubLight',
  solarizedLight:'solarizedLight',
  oneLight:      'oneLight',
  parasol:       'parasol',
  cowgirlLight:  'cowgirlLight',
};

function isDarkVariant(id: string): id is DarkVariant {
  return ['dark', 'darkBlue', 'oneDarkPro', 'tokyoNight', 'cowgirlDark'].includes(id);
}

function isLightVariant(id: string): id is LightVariant {
  return ['default', 'githubLight', 'solarizedLight', 'oneLight', 'parasol', 'cowgirlLight'].includes(id);
}

function ThemeModeIcon({ themeMode, size, color }: { themeMode: ThemeMode; size: number; color: string }): React.JSX.Element {
  if (themeMode === 'light') return <Sun size={size} color={color} />;
  if (themeMode === 'system') return <Smartphone size={size} color={color} />;
  return <Moon size={size} color={color} />;
}

export function SettingsAppearanceSection({
  colors,
  themeMode,
  setThemeMode,
  darkVariant,
  setDarkVariant,
  lightVariant,
  setLightVariant,
  resolvedScheme,
}: AppearanceProps): React.JSX.Element {
  const { t } = useTranslation();

  const variantIds = resolvedScheme === 'dark' ? DARK_VARIANT_IDS : LIGHT_VARIANT_IDS;
  const currentVariantId: ThemeVariantId = resolvedScheme === 'dark' ? darkVariant : lightVariant;

  const variantLabel = (id: string): string =>
    t(`settings.appearance.themes.${VARIANT_I18N_KEY[id] ?? id}_label`, { defaultValue: id });
  const variantFlavor = (id: string): string =>
    t(`settings.appearance.themes.${VARIANT_I18N_KEY[id] ?? id}_flavor`, { defaultValue: '' });

  const modeOptions = [
    { value: 'system' as ThemeMode, label: t('settings.appearance.mode.optionSystem'), Icon: Smartphone },
    { value: 'light'  as ThemeMode, label: t('settings.appearance.mode.optionLight'),  Icon: Sun },
    { value: 'dark'   as ThemeMode, label: t('settings.appearance.mode.optionDark'),   Icon: Moon },
  ];

  const themeModeSubtitle = (): string => {
    if (themeMode === 'system') return t('settings.appearance.mode.system', { scheme: resolvedScheme });
    if (themeMode === 'light') return t('settings.appearance.mode.light');
    return t('settings.appearance.mode.dark');
  };

  return (
    <View style={{ marginBottom: Spacing.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('settings.appearance.title')}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Mode picker (System / Light / Dark) */}
        <View style={styles.row}>
          <ThemeModeIcon themeMode={themeMode} size={16} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
              {t('settings.appearance.mode.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
              {themeModeSubtitle()}
            </Text>
          </View>
          <SegmentedIconPill
            value={themeMode}
            options={modeOptions}
            onChange={setThemeMode}
            colors={colors}
          />
        </View>

        {/* Theme variant picker — always visible, options driven by resolved scheme */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.row}>
          <Palette size={16} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
              {t('settings.appearance.theme.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
              {variantFlavor(currentVariantId)}
            </Text>
          </View>
          <ThemeVariantDropdown
            value={currentVariantId}
            options={variantIds.map((id) => ({ id, label: variantLabel(id) }))}
            onChange={(id) => {
              if (resolvedScheme === 'dark' && isDarkVariant(id)) {
                setDarkVariant(id);
              } else if (resolvedScheme === 'light' && isLightVariant(id)) {
                setLightVariant(id);
              }
            }}
            colors={colors}
          />
        </View>

      </View>
    </View>
  );
}

// ── Media Section ──────────────────────────────────────────────────────────────

type MediaProps = {
  colors: ThemeColors;
};

export function SettingsMediaSection({ colors }: MediaProps): React.JSX.Element {
  const { t } = useTranslation();
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
    <View style={{ marginBottom: Spacing.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('settings.media.title')}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Cache toggle */}
        <Pressable
          onPress={() => setCacheReplay(!cacheReplay)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          accessibilityRole="switch"
          accessibilityState={{ checked: cacheReplay }}
        >
          <Video size={16} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
              {t('settings.media.cacheVideos.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
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
          <Trash2 size={16} color={colors.destructive} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
              {clearingMedia ? t('settings.media.clearMedia.clearing') : t('settings.media.clearMedia.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
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
          <Trash2 size={16} color={colors.destructive} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
              {clearingChat ? t('settings.media.clearChat.clearing') : t('settings.media.clearChat.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
              {t('settings.media.clearChat.subtitle')}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────────

type FooterProps = {
  colors: ThemeColors;
};

export function SettingsFooter({ colors }: FooterProps): React.JSX.Element {
  const { t } = useTranslation();
  const [showFeedback, setShowFeedback] = useState(false);

  return (
    <View style={styles.footer}>
      <Pressable
        onPress={() => setShowFeedback(true)}
        style={({ pressed }) => [
          styles.bugBtn,
          { borderColor: `${colors.foreground}30` },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('settings.footer.reportBug')}
      >
        <Text style={{ color: colors.foreground, fontSize: FontSize.xs, fontWeight: '500' }}>
          {t('settings.footer.reportBug')}
        </Text>
      </Pressable>
      <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 8 }}>
        ClawBoy v{APP_VERSION}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 2 }}>
        {t('settings.footer.builtWith')}
      </Text>

      <FeedbackSheet visible={showFeedback} onClose={() => setShowFeedback(false)} />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: 12 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
  footer: {
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
    gap: 0,
  },
  bugBtn: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: Spacing.md,
  },
});
