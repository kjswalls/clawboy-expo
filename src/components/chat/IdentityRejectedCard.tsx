import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { KeyRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

  const handleRotateIdentity = (): void => {
    Alert.alert(
      t('chat.identity.rotateAlertTitle'),
      t('chat.identity.rotateAlertBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('chat.identity.rotateAlertGenerate'),
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
          {t('chat.identity.notRecognizedTitle')}
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          {t('chat.identity.notRecognizedBody1')}
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 6 }]}>
          {t('chat.identity.notRecognizedBody2')}
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
          accessibilityLabel={t('chat.identity.repairLabel')}
          accessibilityRole="button"
        >
          <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>{t('chat.identity.repairBtn')}</Text>
        </Pressable>

        <Pressable
          onPress={handleRotateIdentity}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { borderColor: `${colors.destructive}60` },
            pressed && styles.btnPressed,
          ]}
          accessibilityLabel={t('chat.identity.newIdentityLabel')}
          accessibilityRole="button"
        >
          <Text style={[styles.secondaryBtnText, { color: colors.destructive }]}>
            {t('chat.identity.newIdentityBtn')}
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
