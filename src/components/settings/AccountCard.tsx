import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { User } from 'lucide-react-native';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';

type Props = {
  colors: ThemeColors;
};

/**
 * Placeholder account card matching the v0 reference design.
 * Not wired to a real auth system yet.
 */
export function AccountCard({ colors }: Props): React.JSX.Element {
  return (
    <View style={[styles.outer, { borderColor: `${colors.primary}28`, backgroundColor: `${colors.primary}0C` }]}>
      <View style={[styles.inner, { backgroundColor: colors.card }]}>
        <View style={[styles.avatar, { backgroundColor: `${colors.primary}30` }]}>
          <User size={18} color={colors.primary} />
        </View>
        <View style={styles.info}>
          <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
            ClawBoy User
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs }}>
            user@clawboy.app
          </Text>
        </View>
      </View>
      <View style={styles.footer}>
        <Text style={{ color: `${colors.primary}CC`, fontSize: FontSize.xs }}>Free plan</Text>
        <Pressable
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          accessibilityLabel="Edit profile"
        >
          <Text style={{ color: colors.primary, fontSize: FontSize.xs, fontWeight: '500' }}>
            Edit profile
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    padding: 4,
    paddingBottom: 8,
    marginBottom: Spacing.xl,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
});
