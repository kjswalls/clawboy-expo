import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, Spacing } from '@/constants/theme';
import { useTranslation } from 'react-i18next';

type Props = {
  title: string;
  children: React.ReactNode;
};

export function SettingsSubScreen({ title, children }: Props): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => { if (router.canGoBack()) router.back(); }}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}
          accessibilityLabel={t('common.goBack')}
          accessibilityRole="button"
        >
          <ArrowLeft size={18} color={colors.mutedForeground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        <View style={styles.back} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom + Spacing.lg, 40) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.sm, fontWeight: '500' },
  scroll: { paddingHorizontal: Spacing.md, paddingTop: Spacing.lg },
});
