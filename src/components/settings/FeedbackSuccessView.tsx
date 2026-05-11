import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

type Props = {
  issueNumber: number;
  onClose: () => void;
};

export function FeedbackSuccessView({ issueNumber, onClose }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <View style={[styles.icon, { backgroundColor: `${colors.success}20` }]}>
        <CheckCircle2 size={36} color={colors.success} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{t('feedback.successTitle')}</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {t('feedback.successBody', { number: issueNumber })}
      </Text>
      <View style={styles.btnRow}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('feedback.successDone')}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.secondary, borderColor: colors.foreground },
            pressed && { opacity: 0.82 },
          ]}
        >
          <Text style={{ color: colors.foreground, fontSize: FontSize.xs, fontWeight: '500' }}>
            {t('feedback.successDone')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  title: { fontSize: FontSize.lg, fontWeight: '600' },
  subtitle: { fontSize: FontSize.sm, textAlign: 'center' },
  btnRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
  },
});
