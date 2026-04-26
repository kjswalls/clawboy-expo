import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ShieldAlert } from 'lucide-react-native';
import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

interface PairingRequiredCardProps {
  deviceIdPrefix?: string;
  onOpenSettings: () => void;
}

export function PairingRequiredCard({
  deviceIdPrefix,
  onOpenSettings,
}: PairingRequiredCardProps): React.JSX.Element {
  const { colors } = useThemeContext();

  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      style={[styles.card, { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}40` }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${colors.warning}26` }]}>
        <ShieldAlert size={22} color={colors.warningText} />
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Device approval needed
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          This device needs to be approved on your OpenClaw server before you can chat.
          {deviceIdPrefix ? `\n\nDevice ID: ${deviceIdPrefix}…` : ''}
        </Text>
      </View>
      <Pressable
        onPress={onOpenSettings}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: colors.warningText },
          pressed && styles.btnPressed,
        ]}
        accessibilityLabel="Open Settings to approve device"
        accessibilityRole="button"
      >
        <Text style={styles.btnText}>Open Settings</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    gap: 4,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  body: {
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  btn: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.md,
  },
  btnPressed: { opacity: 0.8 },
  btnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: '#fff',
  },
});
