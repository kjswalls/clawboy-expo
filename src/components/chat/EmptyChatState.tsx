import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Clock, FileText, Inbox, ListTodo } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { BrandLogo } from '@/components/common/BrandLogo';

interface EmptyChatStateProps {
  onSuggestionPress: (text: string) => void;
}

export function EmptyChatState({ onSuggestionPress }: EmptyChatStateProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const { t } = useTranslation();

  const SUGGESTIONS = [
    { Icon: FileText, key: 'projects', text: t('chat.emptyState.suggestions.projects') },
    { Icon: Inbox, key: 'briefing', text: t('chat.emptyState.suggestions.briefing') },
    { Icon: Clock, key: 'catchup', text: t('chat.emptyState.suggestions.catchup') },
    { Icon: ListTodo, key: 'tasks', text: t('chat.emptyState.suggestions.tasks') },
  ];

  return (
    <Animated.View
      entering={FadeInUp.duration(260)}
      style={styles.wrap}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}18` }]}>
        <BrandLogo
          style={styles.logoInner}
          accessibilityLabel={t('chat.emptyState.logoAccessibility')}
          color={colors.primary}
        />
      </View>

      <Text style={[styles.heading, { color: colors.foreground }]}>
        {t('chat.emptyState.heading')}
      </Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        {t('chat.emptyState.sub')}
      </Text>

      <View style={styles.chips}>
        {SUGGESTIONS.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => onSuggestionPress(s.text)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: colors.secondary,
                borderColor: pressed ? colors.ring : colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            accessibilityLabel={t('chat.emptyState.suggestionA11y', { text: s.text })}
            accessibilityRole="button"
          >
            <View style={[styles.chipIcon, { backgroundColor: colors.muted }]}>
              <s.Icon size={14} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.chipText, { color: colors.foreground }]}>
              {s.text}
            </Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  logoInner: {
    width: 56,
    height: 56,
  },
  heading: {
    fontSize: FontSize.xl,
    fontWeight: '600',
    textAlign: 'center',
  },
  sub: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
    marginBottom: Spacing.sm,
  },
  chips: {
    width: '100%',
    maxWidth: 360,
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
  },
  chipIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  chipText: {
    fontSize: FontSize.sm,
    flex: 1,
  },
});
