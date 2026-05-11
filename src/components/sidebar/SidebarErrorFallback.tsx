import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

interface SidebarErrorFallbackProps {
  colors: { foreground: string; mutedForeground: string; secondary: string; primary: string; border: string };
  onReset: () => void;
  onClose: () => void;
}

export function SidebarErrorFallback({ colors, onReset, onClose }: SidebarErrorFallbackProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.foreground }]}>
        {t('sidebar.error.title')}
      </Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        {t('sidebar.error.body')}
      </Text>
      <Pressable
        onPress={onReset}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: colors.primary },
          pressed && styles.btnPressed,
        ]}
        accessibilityLabel={t('sidebar.error.retryLabel')}
        accessibilityRole="button"
      >
        <Text style={styles.btnText}>{t('sidebar.error.retry')}</Text>
      </Pressable>
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [pressed && styles.btnPressed]}
        accessibilityLabel={t('sidebar.error.closeLabel')}
        accessibilityRole="button"
      >
        <Text style={[styles.close, { color: colors.mutedForeground }]}>{t('common.close')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  body: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  btn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
  },
  btnPressed: { opacity: 0.8 } as const,
  btnText: { fontSize: FontSize.xs, fontWeight: '600' as const, color: '#fff' },
  close: { fontSize: FontSize.xs },
});
