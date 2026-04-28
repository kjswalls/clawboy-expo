import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, ChevronRight, Info, Moon, Palette, ShieldAlert, Smartphone, Sun, Trash2, Video } from 'lucide-react-native';
import { APP_VERSION } from '@/lib/appMeta';
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

const SHOW_NOTIFICATIONS_ROW = false;

// ── General Section ────────────────────────────────────────────────────────────

type GeneralProps = {
  colors: ThemeColors;
};

export function SettingsGeneralSection({ colors }: GeneralProps): React.JSX.Element {
  const [showAbout, setShowAbout] = useState(false);
  const { confirmDestructiveCommands, setConfirmDestructiveCommands } = useCommandConfirmations();

  return (
    <View style={{ marginBottom: Spacing.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>General</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable
          onPress={() => setShowAbout(true)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          accessibilityLabel="About ClawBoy"
          accessibilityRole="button"
        >
          <Info size={16} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
              About
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
              Updates, privacy and security, and changelog
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
          accessibilityLabel="Confirm /reset and /compact"
        >
          <ShieldAlert size={16} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
              Confirm /reset and /compact
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
              Show a confirmation before clearing or compacting the session from the toolbar below the input
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

const MODE_OPTIONS = [
  { value: 'system' as ThemeMode, label: 'System',    Icon: Smartphone },
  { value: 'light'  as ThemeMode, label: 'Light',     Icon: Sun },
  { value: 'dark'   as ThemeMode, label: 'Dark',      Icon: Moon },
];

type ThemeVariantId = DarkVariant | LightVariant;

interface ThemeVariantInfo {
  id: ThemeVariantId;
  label: string;
  flavor: string;
}

const DARK_THEME_VARIANTS: ThemeVariantInfo[] = [
  { id: 'dark',        label: 'ClawBoy Dark',    flavor: 'aka "On the Luna"' },
  { id: 'darkBlue',    label: 'After Midnight', flavor: '"Nothing good happens..."' },
  { id: 'oneDarkPro',  label: 'One Dark Pro',   flavor: "Remember Atom?" },
  { id: 'tokyoNight',  label: 'Tokyo Night',    flavor: 'Domo arigato, Mr. Roboto' },
];

const LIGHT_THEME_VARIANTS: ThemeVariantInfo[] = [
  { id: 'default',        label: 'ClawBoy Light',    flavor: 'aka "twitch.tv/ludwig"' },
  { id: 'githubLight',    label: 'GitHub Light',    flavor: 'Fork me on GitHub' },
  { id: 'solarizedLight', label: 'Solarized Light', flavor: '🪴' },
  { id: 'oneLight',       label: 'One Light',       flavor: 'Remember Atom?' },
  { id: 'parasol',        label: 'Parasol',         flavor: 'Drip drop!' },
];

function themeModeSubtitle(themeMode: ThemeMode, resolvedScheme: 'light' | 'dark'): string {
  if (themeMode === 'system') return `Use system (${resolvedScheme})`;
  if (themeMode === 'light') return 'Light';
  return 'Dark';
}

function isDarkVariant(id: string): id is DarkVariant {
  return ['dark', 'darkBlue', 'oneDarkPro', 'tokyoNight'].includes(id);
}

function isLightVariant(id: string): id is LightVariant {
  return ['default', 'githubLight', 'solarizedLight', 'oneLight', 'parasol'].includes(id);
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
  const variants = resolvedScheme === 'dark' ? DARK_THEME_VARIANTS : LIGHT_THEME_VARIANTS;
  const currentVariantId: ThemeVariantId = resolvedScheme === 'dark' ? darkVariant : lightVariant;
  // Catalogs are always non-empty, so the fallback is guaranteed.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const selectedVariant = variants.find((v) => v.id === currentVariantId) ?? variants[0]!;

  return (
    <View style={{ marginBottom: Spacing.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Appearance</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Mode picker (System / Light / Dark) */}
        <View style={styles.row}>
          <ThemeModeIcon themeMode={themeMode} size={16} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
              Mode
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
              {themeModeSubtitle(themeMode, resolvedScheme)}
            </Text>
          </View>
          <SegmentedIconPill
            value={themeMode}
            options={MODE_OPTIONS}
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
              Theme
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
              {selectedVariant.flavor}
            </Text>
          </View>
          <ThemeVariantDropdown
            value={currentVariantId}
            options={variants.map(({ id, label }) => ({ id, label }))}
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
  const [cacheReplay, setCacheReplay] = useMediaCacheReplay();
  const [clearingMedia, setClearingMedia] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);

  const performClearMedia = async (bytesBefore: number): Promise<void> => {
    setClearingMedia(true);
    try {
      await clearMediaCache();
      const mb = Math.round(bytesBefore / (1024 * 1024));
      Alert.alert(
        'Media cleared',
        mb > 0 ? `Freed approximately ${mb} MB.` : 'No cached media to remove.',
      );
    } catch {
      Alert.alert('Error', 'Could not clear media cache. Please try again.');
    } finally {
      setClearingMedia(false);
    }
  };

  const handleClearMedia = async (): Promise<void> => {
    const bytesBefore = await getMediaCacheUsageBytes();
    const mb = Math.round(bytesBefore / (1024 * 1024));
    const message = mb > 0
      ? `This will free approximately ${mb} MB of cached video and audio. They will re-download when viewed again.`
      : 'No cached media on disk. Nothing will be removed.';
    Alert.alert(
      'Clear downloaded media?',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => { void performClearMedia(bytesBefore); } },
      ],
    );
  };

  const performClearChat = async (bytesBefore: number): Promise<void> => {
    setClearingChat(true);
    try {
      await clearAllCachedSessions();
      const kb = Math.round(bytesBefore / 1024);
      Alert.alert(
        'Chat cache cleared',
        kb > 0 ? `Freed approximately ${kb} KB.` : 'No chat cache to remove.',
      );
    } catch {
      Alert.alert('Error', 'Could not clear chat cache. Please try again.');
    } finally {
      setClearingChat(false);
    }
  };

  const handleClearChat = async (): Promise<void> => {
    const bytesBefore = await getChatCacheUsageBytes();
    const kb = Math.round(bytesBefore / 1024);
    const message = bytesBefore > 0
      ? `This will delete approximately ${kb} KB of cached chat history and any unsaved drafts. Active conversations are unaffected — history will reload from your gateway on next connect.`
      : 'No chat cache on disk. Nothing will be removed.';
    Alert.alert(
      'Clear chat cache?',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => { void performClearChat(bytesBefore); } },
      ],
    );
  };

  return (
    <View style={{ marginBottom: Spacing.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>On-Device Storage</Text>
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
              Cache videos for replay
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
              {cacheReplay
                ? 'Videos are saved locally and replay instantly'
                : 'Videos re-download each time (no persistent footprint)'}
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
          accessibilityLabel="Clear downloaded media"
        >
          <Trash2 size={16} color={colors.destructive} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
              {clearingMedia ? 'Clearing…' : 'Clear downloaded media'}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
              Removes all cached video and audio files
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
          accessibilityLabel="Clear chat cache"
        >
          <Trash2 size={16} color={colors.destructive} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
              {clearingChat ? 'Clearing…' : 'Clear chat cache'}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
              Removes the encrypted message tail used for cold-start display
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
        accessibilityLabel="Report a bug or request a feature"
      >
        <Text style={{ color: colors.foreground, fontSize: FontSize.xs, fontWeight: '500' }}>
          Report a bug / Request a feature
        </Text>
      </Pressable>
      <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 8 }}>
        ClawBoy v{APP_VERSION}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 2 }}>
        Built with care
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
