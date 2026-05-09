import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Pencil, Send } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { ClawboyOptionsPrompt, SurveyConsumedState } from '@/lib/openclaw/interactive';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';

// Hex alpha suffixes for semi-transparent overlays.
// '0A' = ~4 % opacity (pressed ripple), '24' = ~14 % (disabled bg tint).
const PRESS_ALPHA = '0A';
const DISABLED_BG_ALPHA = '24';

/** Returns A, B, C … Z, then 1, 2, 3 … for indices beyond 25. */
function badgeLabel(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

interface InteractiveOptionsCardProps {
  prompt: ClawboyOptionsPrompt;
  /**
   * Pre-computed consumed state. When `consumed: false`, the card is live
   * (buttons + optional freeform input). When `consumed: true`, the card is
   * frozen with the selection highlighted.
   */
  surveyState: SurveyConsumedState | { consumed: false };
  /** Disabled while the assistant turn is still streaming. */
  disabled?: boolean;
  /** Called when the user confirms a choice selection. Sends `choice.value` as the reply. */
  onPick: (value: string) => void;
  /** Called when the user submits a free-form reply. */
  onSubmitFreeText: (text: string) => void;
}

export const InteractiveOptionsCard = React.memo(function InteractiveOptionsCard({
  prompt,
  surveyState,
  disabled = false,
  onPick,
  onSubmitFreeText,
}: InteractiveOptionsCardProps): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [freeText, setFreeText] = useState('');
  const [selectedValue, setSelectedValue] = useState<string | null>(null);

  const consumed = surveyState.consumed;
  // TypeScript narrows `surveyState` to `SurveyConsumedState` here once consumed is true.
  const chosenValue = consumed ? surveyState.chosenValue : undefined;
  const chosenFreeText = consumed ? surveyState.chosenFreeText : undefined;

  const showFreeText = !consumed && (prompt.allowFreeText ?? true);
  const showSendOnlyRow = !consumed && !(prompt.allowFreeText ?? true);

  // One-shot guard: prevent a fast double-tap from dispatching two chat.send calls.
  const pickedRef = useRef(false);
  // Reset when the card becomes live again (consumed flips false) so a re-enabled
  // card is always tappable. Also track prev-disabled to reset when `disabled`
  // goes true → false (e.g. connection restored after a failed send attempt) so
  // the guard doesn't leave the card permanently stuck if onPick was a no-op.
  useEffect(() => {
    if (!consumed) pickedRef.current = false;
  }, [consumed]);
  const prevDisabledRef = useRef(disabled);
  useEffect(() => {
    if (prevDisabledRef.current && !disabled) {
      pickedRef.current = false;
    }
    prevDisabledRef.current = disabled;
  }, [disabled]);

  // Reset local selection when the card becomes live again.
  useEffect(() => {
    if (!consumed) setSelectedValue(null);
  }, [consumed]);

  const handleChoiceTap = useCallback(
    (value: string) => {
      if (consumed || disabled) return;
      setSelectedValue((prev) => (prev === value ? null : value));
      // Picking a choice clears free-text input.
      setFreeText('');
    },
    [consumed, disabled],
  );

  const handleFreeTextChange = useCallback((text: string) => {
    setFreeText(text);
    // Typing clears the selected choice — mutually exclusive.
    if (text.length > 0) setSelectedValue(null);
  }, []);

  // Clear free-text when the survey becomes consumed.
  useEffect(() => {
    if (consumed) setFreeText('');
  }, [consumed]);

  const canSend = !disabled && (selectedValue !== null || freeText.trim().length > 0);

  const handleSend = useCallback(() => {
    if (!canSend) return;
    if (pickedRef.current) return;
    pickedRef.current = true;

    const trimmed = freeText.trim();
    if (trimmed) {
      onSubmitFreeText(trimmed);
      setFreeText('');
    } else if (selectedValue !== null) {
      onPick(selectedValue);
      setSelectedValue(null);
    }
  }, [canSend, freeText, selectedValue, onPick, onSubmitFreeText]);

  return (
    <View
      style={[
        styles.card,
        { borderColor: colors.border, backgroundColor: colors.secondary },
      ]}
    >
      {/* Optional reinforcing prompt label */}
      {prompt.prompt ? (
        <Text style={[styles.promptLabel, { color: colors.mutedForeground }]}>
          {prompt.prompt}
        </Text>
      ) : null}

      {/* Choice rows */}
      {prompt.choices.map((choice, index) => {
        const isChosen = consumed && chosenValue === choice.value;
        const isOther = consumed && !isChosen;
        const isLiveSelected = !consumed && selectedValue === choice.value;

        const a11yLabel = choice.hint
          ? t('chat.options.choiceHint', { label: choice.label, hint: choice.hint })
          : isChosen
            ? t('chat.options.choiceSelected', { label: choice.label })
            : isLiveSelected
              ? t('chat.options.choicePending', { label: choice.label })
              : t('chat.options.choiceNotSelected', { label: choice.label });

        return (
          <Pressable
            key={choice.value}
            disabled={consumed || disabled}
            onPress={() => handleChoiceTap(choice.value)}
            accessibilityRole="button"
            accessibilityLabel={a11yLabel}
            accessibilityState={{ disabled: consumed || disabled, selected: isChosen || isLiveSelected }}
            style={({ pressed }) => [
              styles.choiceRow,
              pressed && !consumed ? { backgroundColor: colors.foreground + PRESS_ALPHA } : null,
              isOther ? { opacity: 0.45 } : null,
            ]}
          >
            {/* Letter badge */}
            <View
              style={[
                styles.badge,
                isChosen || isLiveSelected
                  ? { backgroundColor: colors.primary, borderWidth: 0 }
                  : { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1 },
              ]}
            >
              <Text
                style={[
                  styles.badgeLetter,
                  {
                    color: isChosen || isLiveSelected ? colors.primaryForeground : colors.mutedForeground,
                    fontWeight: isChosen || isLiveSelected ? FontWeight.semibold : FontWeight.normal,
                  },
                ]}
              >
                {badgeLabel(index)}
              </Text>
            </View>

            {/* Label + optional hint */}
            <View style={styles.choiceLabelWrap}>
              <Text
                style={[
                  styles.choiceLabel,
                  {
                    color: isOther ? colors.mutedForeground : colors.foreground,
                    fontWeight: isChosen || isLiveSelected ? FontWeight.semibold : FontWeight.normal,
                  },
                ]}
              >
                {choice.label}
              </Text>
              {choice.hint ? (
                <Text style={[styles.choiceHint, { color: colors.mutedForeground }]}>
                  {choice.hint}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}

      {/* Free-form "Other…" row — live state only */}
      {showFreeText ? (
        <View style={[styles.freeRow, { borderTopColor: colors.border }]}>
          {/* Pencil badge — signals "free input" in the same badge grid */}
          <View style={[styles.badge, { borderColor: colors.border, borderWidth: 1, backgroundColor: 'transparent' }]}>
            <Pencil size={11} color={colors.mutedForeground} strokeWidth={2} />
          </View>

          {/* Borderless inline input */}
          <TextInput
            style={[styles.freeInput, { color: colors.foreground }]}
            placeholder={prompt.freeTextPlaceholder ?? t('chat.options.defaultPlaceholder')}
            placeholderTextColor={colors.mutedForeground}
            value={freeText}
            onChangeText={handleFreeTextChange}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            multiline={false}
            editable={!disabled}
            maxLength={4000}
            textContentType="none"
            accessibilityLabel={prompt.freeTextPlaceholder ?? t('chat.options.defaultPlaceholder')}
          />

          {/* Circular send button */}
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                backgroundColor: canSend ? colors.foreground : colors.mutedForeground + DISABLED_BG_ALPHA,
                opacity: pressed ? 0.75 : canSend ? 1 : 0.4,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('chat.options.sendCustomReply')}
            accessibilityState={{ disabled: !canSend }}
          >
            <Send size={12} color={canSend ? colors.background : colors.mutedForeground} />
          </Pressable>
        </View>
      ) : null}

      {/* Send-only footer row — when allowFreeText is false and card is live */}
      {showSendOnlyRow ? (
        <View style={[styles.sendOnlyRow, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                backgroundColor: canSend ? colors.foreground : colors.mutedForeground + DISABLED_BG_ALPHA,
                opacity: pressed ? 0.75 : canSend ? 1 : 0.4,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('chat.options.sendSelectedReply')}
            accessibilityState={{ disabled: !canSend }}
          >
            <Send size={12} color={canSend ? colors.background : colors.mutedForeground} />
          </Pressable>
        </View>
      ) : null}

      {/* Consumed free-text quote pill — announced to screen readers when it appears. */}
      {consumed && chosenFreeText ? (
        <View
          style={[styles.quotePill, { backgroundColor: colors.muted }]}
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${t('chat.options.youReplied')} ${chosenFreeText}`}
        >
          <Text style={[styles.quotePillCaption, { color: colors.mutedForeground }]}>
            {t('chat.options.youReplied')}
          </Text>
          <Text style={[styles.quotePillValue, { color: colors.foreground }]}>
            {chosenFreeText}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius['2xl'],
    paddingVertical: Spacing.xs,
    overflow: 'hidden',
  },
  promptLabel: {
    fontSize: FontSize.xs,
    letterSpacing: 0.3,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
    paddingBottom: 2,
  },
  // ── Choice rows ──────────────────────────────────────────────────────────
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    minHeight: 40,
    borderRadius: BorderRadius.md,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badgeLetter: {
    fontSize: FontSize.xs,
    lineHeight: FontSize.xs + 2,
  },
  choiceLabelWrap: {
    flex: 1,
    gap: 2,
  },
  choiceLabel: {
    fontSize: FontSize.sm,
  },
  choiceHint: {
    fontSize: FontSize.xs,
  },
  // ── Free-form row ─────────────────────────────────────────────────────────
  freeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  freeInput: {
    flex: 1,
    fontSize: FontSize.sm,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  sendBtn: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  // ── Send-only footer row (allowFreeText: false) ───────────────────────────
  sendOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  // ── Consumed quote pill ───────────────────────────────────────────────────
  quotePill: {
    marginHorizontal: Spacing.sm,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: 2,
  },
  quotePillCaption: {
    fontSize: FontSize.xs,
  },
  quotePillValue: {
    fontSize: FontSize.sm,
  },
});
