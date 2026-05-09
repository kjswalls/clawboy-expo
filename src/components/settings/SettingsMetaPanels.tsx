import React, { useMemo, useState } from 'react';
import { Alert, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, Bug, ChevronRight, Globe, Info, Maximize2, Minimize2, Moon, Palette, ShieldAlert, Smartphone, Square, Sun, Trash2, Type, Video, X } from 'lucide-react-native';
import { BrandLoader } from '@/components/common/BrandLoader';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import type { LanguagePreference } from '@/contexts/LanguageContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { useTokens } from '@/hooks/useTokens';
import type { TokenSet } from '@/hooks/useTokens';
import type { DarkVariant, LightVariant, ThemeColors, ThemeMode, UiDensity } from '@/types';
import { SegmentedIconPill } from './SegmentedIconPill';
import { ThemeVariantDropdown } from './ThemeVariantDropdown';
import { useMediaCacheReplay } from '@/hooks/useMediaCacheReplay';
import { clearMediaCache, getMediaCacheUsageBytes } from '@/lib/media/downloadMedia';
import { clearAllCachedSessions, getChatCacheUsageBytes } from '@/lib/chatCache/store';
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
  const router = useRouter();
  const { confirmDestructiveCommands, setConfirmDestructiveCommands } = useCommandConfirmations();
  const { t } = useTranslation();
  const { language, setLanguage, resolvedLanguage } = useLanguage();
  const tk = useTokens();
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const styles = useMemo(() => createPanelStyles(tk), [tk]);

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
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('settings.general.title')}</Text>
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
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Pressable
          onPress={() => setConfirmDestructiveCommands(!confirmDestructiveCommands)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          accessibilityRole="switch"
          accessibilityState={{ checked: confirmDestructiveCommands }}
          accessibilityLabel={t('settings.general.confirmCommands.row')}
        >
          <ShieldAlert size={tk.iconSm} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {t('settings.general.confirmCommands.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
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
              <Bell size={tk.iconSm} color={colors.mutedForeground} />
              <View style={styles.flex}>
                <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
                  Notifications
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
                  Manage alerts and push notifications
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
  density: UiDensity;
  setDensity: (d: UiDensity) => void;
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
  density,
  setDensity,
}: AppearanceProps): React.JSX.Element {
  const { t } = useTranslation();
  const tk = useTokens();
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const styles = useMemo(() => createPanelStyles(tk), [tk]);

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

  const densityOptions = [
    { value: 'compact'     as UiDensity, label: t('settings.appearance.density.optionCompact'),     Icon: Minimize2 },
    { value: 'comfortable' as UiDensity, label: t('settings.appearance.density.optionComfortable'), Icon: Square },
    { value: 'spacious'    as UiDensity, label: t('settings.appearance.density.optionSpacious'),    Icon: Maximize2 },
  ];

  const themeModeSubtitle = (): string => {
    if (themeMode === 'system') return t('settings.appearance.mode.system', { scheme: resolvedScheme });
    if (themeMode === 'light') return t('settings.appearance.mode.light');
    return t('settings.appearance.mode.dark');
  };

  const densitySubtitle = (): string => {
    if (density === 'compact') return t('settings.appearance.density.subtitleCompact');
    if (density === 'spacious') return t('settings.appearance.density.subtitleSpacious');
    return t('settings.appearance.density.subtitleComfortable');
  };

  return (
    <View style={{ marginBottom: tk.sp.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('settings.appearance.title')}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Mode picker (System / Light / Dark) */}
        <View style={styles.row}>
          <ThemeModeIcon themeMode={themeMode} size={tk.iconSm} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {t('settings.appearance.mode.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
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
          <Palette size={tk.iconSm} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {t('settings.appearance.theme.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
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

        {/* UI Density picker */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.row}>
          <Type size={tk.iconSm} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {t('settings.appearance.density.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
              {densitySubtitle()}
            </Text>
          </View>
          <SegmentedIconPill
            value={density}
            options={densityOptions}
            onChange={setDensity}
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
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('settings.media.title')}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Cache toggle */}
        <Pressable
          onPress={() => setCacheReplay(!cacheReplay)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          accessibilityRole="switch"
          accessibilityState={{ checked: cacheReplay }}
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

// ── Footer ─────────────────────────────────────────────────────────────────────

type FooterProps = {
  colors: ThemeColors;
};

export function SettingsFooter({ colors }: FooterProps): React.JSX.Element {
  const { t } = useTranslation();
  const tk = useTokens();
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const styles = useMemo(() => createPanelStyles(tk), [tk]);
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
        <Text style={{ color: colors.foreground, fontSize: tk.fs.xs, fontWeight: '500' }}>
          {t('settings.footer.reportBug')}
        </Text>
      </Pressable>
      <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 8 }}>
        ClawBoy v{APP_VERSION}
      </Text>
      <Pressable
        onPress={() => Linking.openURL('https://sundaysoftworks.com')}
        accessibilityRole="link"
        accessibilityLabel="Sunday Softworks website"
        style={({ pressed }) => ({ marginTop: 2, borderBottomWidth: 2, borderBottomColor: colors.accent, opacity: pressed ? 0.7 : 1, alignSelf: 'center' })}
      >
        <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs }}>
          {t('settings.footer.builtWith')}
        </Text>
      </Pressable>

      <FeedbackSheet visible={showFeedback} onClose={() => setShowFeedback(false)} />
    </View>
  );
}

// ── Debug Section (dev builds only) ───────────────────────────────────────────

export function SettingsDebugSection({ colors }: { colors: ThemeColors }): React.JSX.Element | null {
  if (!__DEV__) return null;

  const tk = useTokens(); // eslint-disable-line react-hooks/rules-of-hooks
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const styles = useMemo(() => createPanelStyles(tk), [tk]); // eslint-disable-line react-hooks/rules-of-hooks
  const [showLoader, setShowLoader] = useState(false); // eslint-disable-line react-hooks/rules-of-hooks
  const insets = useSafeAreaInsets(); // eslint-disable-line react-hooks/rules-of-hooks

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

// ── Styles ─────────────────────────────────────────────────────────────────────

function createPanelStyles(tk: TokenSet) {
  return StyleSheet.create({
    flex: { flex: 1 },
    sectionTitle: { fontSize: tk.fs.sm, fontWeight: '600' as const, marginBottom: 12 },
    card: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: BorderRadius.xl,
      overflow: 'hidden' as const,
    },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: tk.sp.sm,
      paddingHorizontal: tk.sp.md,
      paddingVertical: tk.sp.sm,
      minHeight: tk.minTouch,
    },
    divider: { height: StyleSheet.hairlineWidth, marginHorizontal: tk.sp.md },
    footer: {
      alignItems: 'center' as const,
      paddingVertical: tk.sp['2xl'],
      gap: 0,
    },
    bugBtn: {
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      paddingHorizontal: tk.sp.md,
      paddingVertical: 7,
      marginBottom: tk.sp.md,
    },
  });
}

