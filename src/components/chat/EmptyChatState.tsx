import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Code, FileText, Lightbulb, Sparkles } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

interface EmptyChatStateProps {
  onSuggestionPress: (text: string) => void;
}

export function EmptyChatState({ onSuggestionPress }: EmptyChatStateProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const { t } = useTranslation();

  const SUGGESTIONS = [
    { Icon: Code, key: 'code', text: t('chat.emptyState.suggestions.code') },
    { Icon: FileText, key: 'summarize', text: t('chat.emptyState.suggestions.summarize') },
    { Icon: Lightbulb, key: 'brainstorm', text: t('chat.emptyState.suggestions.brainstorm') },
    { Icon: Sparkles, key: 'help', text: t('chat.emptyState.suggestions.help') },
  ];

  return (
    <Animated.View
      entering={FadeInUp.duration(260)}
      style={styles.wrap}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}18` }]}>
        <Sparkles size={28} color={colors.primary} />
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
            accessibilityLabel={`Suggestion: ${s.text}`}
            accessibilityRole="button"
          >
            <View style={[styles.chipIcon, { backgroundColor: colors.muted }]}>
              <s.Icon size={14} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.chipText, { color: colors.foreground }]} numberOfLines={1}>
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
    paddingVertical: Spacing['2xl'],
    gap: Spacing.md,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
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
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
  },
  chipIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: FontSize.sm,
    flex: 1,
  },
});
