import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, ChevronRight, Moon, Sun } from 'lucide-react-native';
import { APP_VERSION } from '@/lib/appMeta';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors, ThemeMode } from '@/types';

// ── General Section ────────────────────────────────────────────────────────────

type GeneralProps = {
  colors: ThemeColors;
};

export function SettingsGeneralSection({ colors }: GeneralProps): React.JSX.Element {
  return (
    <View style={{ marginBottom: Spacing.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>General</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
      </View>
    </View>
  );
}

// ── Appearance Section ─────────────────────────────────────────────────────────

type AppearanceProps = {
  colors: ThemeColors;
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
};

export function SettingsAppearanceSection({ colors, theme, setTheme }: AppearanceProps): React.JSX.Element {
  const isDark = theme === 'dark';
  return (
    <View style={{ marginBottom: Spacing.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Appearance</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable
          onPress={() => setTheme(isDark ? 'light' : 'dark')}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
        >
          {isDark
            ? <Moon size={16} color={colors.mutedForeground} />
            : <Sun size={16} color={colors.mutedForeground} />}
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>Theme</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 1 }}>
              Switch between light and dark mode
            </Text>
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs }}>
            {isDark ? 'Dark' : 'Light'}
          </Text>
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
  return (
    <View style={styles.footer}>
      <Pressable
        style={({ pressed }) => [
          styles.bugBtn,
          { borderColor: `${colors.foreground}30` },
          pressed && { opacity: 0.7 },
        ]}
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
