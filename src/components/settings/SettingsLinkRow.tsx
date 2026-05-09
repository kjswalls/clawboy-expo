import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useTokens } from '@/hooks/useTokens';
import { BorderRadius, Spacing } from '@/constants/theme';

type Props = {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  onPress: () => void;
  isFirst?: boolean;
  isLast?: boolean;
};

export function SettingsLinkRow({ icon: Icon, title, subtitle, onPress, isFirst, isLast }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const tk = useTokens();

  return (
    <>
      {!isFirst && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, { paddingHorizontal: tk.sp.md, paddingVertical: tk.sp.sm, minHeight: tk.minTouch }, pressed && { opacity: 0.75 }]}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        <Icon size={tk.iconSm} color={colors.mutedForeground} />
        <View style={styles.flex}>
          <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <ChevronRight size={tk.iconSm} color={colors.mutedForeground} />
      </Pressable>
    </>
  );
}

export function SettingsLinkCard({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  flex: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: Spacing.md },
});
