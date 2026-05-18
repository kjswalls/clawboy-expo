import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Clock, FileText, Inbox } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import { BrandLogo } from '@/components/common/BrandLogo';

interface EmptyChatStateProps {
  onSuggestionPress: (text: string) => void;
}

const PILL_DELAYS = [300, 340, 380, 420];

export function EmptyChatState({ onSuggestionPress }: EmptyChatStateProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const { t } = useTranslation();

  const SUGGESTIONS = [
    { Icon: FileText, key: 'projects', text: t('chat.emptyState.suggestions.projects') },
    { Icon: Inbox, key: 'briefing', text: t('chat.emptyState.suggestions.briefing') },
    { Icon: Clock, key: 'catchup', text: t('chat.emptyState.suggestions.catchup') },
  ];

  return (
    <View style={styles.wrap}>
      <Animated.View
        entering={FadeInUp.duration(280)}
        style={[styles.heroLogoWrap, { shadowColor: colors.primary }]}
      >
        <BrandLogo
          style={styles.heroLogoImage}
          accessibilityLabel={t('chat.emptyState.logoAccessibility')}
        />
      </Animated.View>

      <Animated.Text
        entering={FadeInUp.delay(160).duration(280)}
        style={[styles.heading, { color: colors.foreground }]}
      >
        {t('chat.emptyState.heading')}
      </Animated.Text>
      <Animated.Text
        entering={FadeInUp.delay(220).duration(280)}
        style={[styles.sub, { color: colors.mutedForeground }]}
      >
        {t('chat.emptyState.sub')}
      </Animated.Text>

      <View style={styles.chips}>
        {SUGGESTIONS.map((s, i) => (
          <Animated.View
            key={s.key}
            entering={FadeInUp.delay(PILL_DELAYS[i] ?? 420).duration(280)}
          >
            <Pressable
              onPress={() => onSuggestionPress(s.text)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              accessibilityLabel={t('chat.emptyState.suggestionA11y', { text: s.text })}
              accessibilityRole="button"
            >
              <s.Icon size={14} color={colors.mutedForeground} />
              <Text style={[styles.chipText, { color: colors.foreground }]}>
                {s.text}
              </Text>
            </Pressable>
          </Animated.View>
        ))}
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
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  heroLogoWrap: {
    width: 144,
    height: 144,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
    marginTop: -Spacing.md,
    marginBottom: -Spacing.md,
  },
  heroLogoImage: {
    width: '100%',
    height: '100%',
  },
  heading: {
    fontSize: FontSize['2xl'],
    fontWeight: '700',
    lineHeight: 32,
    textAlign: 'center',
  },
  sub: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
    marginTop: Spacing.md,
  },
  chips: {
    width: '100%',
    maxWidth: 360,
    gap: 6,
    marginTop: Spacing.lg,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: '400',
    flex: 1,
  },
});
