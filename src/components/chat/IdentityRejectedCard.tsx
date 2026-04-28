import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { KeyRound } from 'lucide-react-native';
import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { clearDeviceIdentity } from '@/lib/device-identity';

interface IdentityRejectedCardProps {
  /** Called when the user chooses to re-pair with the existing keypair. */
  onRePair: () => void;
  /** Called after the device identity has been successfully cleared, ready for a fresh pair. */
  onIdentityCleared: () => void;
}

export function IdentityRejectedCard({
  onRePair,
  onIdentityCleared,
}: IdentityRejectedCardProps): React.JSX.Element {
  const { colors } = useThemeContext();

  const handleRotateIdentity = (): void => {
    Alert.alert(
      'Generate new device identity?',
      'Use this only if you have lost the gateway-side record of this device. The gateway will see this as a brand-new device and must approve it again. Your existing device entry on the gateway will not be removed automatically.\n\nThis cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate new identity',
          style: 'destructive',
          onPress: () => {
            void clearDeviceIdentity().then(() => {
              onIdentityCleared();
            });
          },
        },
      ]
    );
  };

  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      style={[styles.card, { backgroundColor: `${colors.destructive}10`, borderColor: `${colors.destructive}35` }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${colors.destructive}20` }]}>
        <KeyRound size={22} color={colors.destructive} />
      </View>

      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Device identity not recognized
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          Your gateway rejected this device's identity signature. This can happen if the gateway's pairing records were reset or the device entry was removed.
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 6 }]}>
          Approve the device again on your gateway, then tap Re-pair. If the gateway no longer has a record of this device, you can generate a fresh identity.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onRePair}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primary },
            pressed && styles.btnPressed,
          ]}
          accessibilityLabel="Re-pair this device"
          accessibilityRole="button"
        >
          <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Re-pair</Text>
        </Pressable>

        <Pressable
          onPress={handleRotateIdentity}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { borderColor: `${colors.destructive}60` },
            pressed && styles.btnPressed,
          ]}
          accessibilityLabel="Generate a new device identity"
          accessibilityRole="button"
        >
          <Text style={[styles.secondaryBtnText, { color: colors.destructive }]}>
            New device identity…
          </Text>
        </Pressable>
      </View>
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
    gap: 2,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: 2,
  },
  body: {
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  primaryBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.md,
  },
  secondaryBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  btnPressed: { opacity: 0.75 },
  primaryBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  secondaryBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
