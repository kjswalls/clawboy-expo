import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { APP_VERSION, PROTOCOL_VERSION } from '@/lib/appMeta';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ThemeMode, ThemeColors } from '@/types';

type Props = {
  colors: ThemeColors;
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  onForgetDevice: () => void;
};

export function SettingsAppearanceAndAbout({ colors, theme, setTheme, onForgetDevice }: Props): React.JSX.Element {
  return (
    <>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: Spacing.lg }]}>Appearance</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.rowBetween}>
          <Text style={{ color: colors.cardForeground, fontSize: FontSize.sm }}>Dark theme</Text>
          <Switch
            value={theme === 'dark'}
            onValueChange={(v) => {
              setTheme(v ? 'dark' : 'light');
            }}
            trackColor={{ false: colors.muted, true: colors.primary }}
            thumbColor={theme === 'dark' ? colors.primaryForeground : colors.background}
          />
        </View>
      </View>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: Spacing.lg }]}>About</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: Spacing.sm }]}>
        <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs }}>ClawBoy v{APP_VERSION}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs }}>Protocol v{PROTOCOL_VERSION}</Text>
        <Pressable
          onPress={onForgetDevice}
          style={({ pressed }) => [styles.danger, { borderColor: colors.destructive }, pressed && { opacity: 0.9 }]}
        >
          <Text style={{ color: colors.destructive, fontSize: FontSize.sm, fontWeight: '600' }}>Forget device</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: Spacing.sm, textTransform: 'uppercase' },
  card: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  danger: { borderWidth: 1, borderRadius: BorderRadius.md, paddingVertical: 10, alignItems: 'center' },
});
