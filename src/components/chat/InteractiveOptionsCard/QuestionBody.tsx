import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Pencil } from 'lucide-react-native';
import { FontWeight } from '@/constants/theme';
import type { ClawboyQuestion, SurveyConsumedState } from '@/lib/openclaw/interactive';
import type { ThemeColors } from '@/types';
import { badgeLabel, emptyAnswer, PRESS_ALPHA, type QuestionAnswer } from './types';
import { styles } from './cardStyles';

export interface QuestionBodyProps {
  question: ClawboyQuestion;
  answer: QuestionAnswer;
  surveyState: ReturnType<typeof import('@/lib/openclaw/interactive').deriveMultiSurveyState>[string];
  isConsumed: boolean;
  isMulti: boolean;
  disabled: boolean;
  colors: ThemeColors;
  t: ReturnType<typeof import('react-i18next').useTranslation>['t'];
  onChoiceTap: (questionId: string, value: string) => void;
  onFreeTextChange: (questionId: string, text: string) => void;
}

export function QuestionBody({
  question,
  answer,
  surveyState,
  isConsumed,
  isMulti: _isMulti,
  disabled,
  colors,
  t,
  onChoiceTap,
  onFreeTextChange,
}: QuestionBodyProps): React.JSX.Element {
  const consumed = surveyState.consumed;
  const chosenValue = consumed ? (surveyState as SurveyConsumedState).chosenValue : undefined;
  const chosenFreeText = consumed
    ? (surveyState as SurveyConsumedState).chosenFreeText
    : undefined;

  const showFreeText = !isConsumed && (question.allowFreeText ?? true);

  return (
    <View>
      {question.prompt ? (
        <>
          <Text style={[styles.promptLabel, { color: colors.foreground }]}>
            {question.prompt}
          </Text>
          <View style={[styles.questionSeparator, { backgroundColor: colors.border }]} />
        </>
      ) : null}

      {question.choices.map((choice, index) => {
        const isChosen = consumed && chosenValue === choice.value;
        const isOther = consumed && !isChosen && chosenValue !== undefined;
        const isSkippedChoice = consumed && chosenValue === undefined && chosenFreeText === undefined;
        const isLiveSelected = !isConsumed && answer.picked === choice.value;

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
            disabled={isConsumed || disabled}
            onPress={() => onChoiceTap(question.id, choice.value)}
            accessibilityRole="button"
            accessibilityLabel={a11yLabel}
            accessibilityState={{
              disabled: isConsumed || disabled,
              selected: isChosen || isLiveSelected,
            }}
            style={({ pressed }) => [
              styles.choiceRow,
              (pressed && !isConsumed) || isChosen || isLiveSelected
                ? { backgroundColor: colors.foreground + PRESS_ALPHA }
                : null,
              (isOther || isSkippedChoice) ? { opacity: 0.45 } : null,
            ]}
          >
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
                    color:
                      isChosen || isLiveSelected
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                    fontWeight: FontWeight.normal,
                  },
                ]}
              >
                {badgeLabel(index)}
              </Text>
            </View>

            <View style={styles.choiceLabelWrap}>
              <Text
                style={[
                  styles.choiceLabel,
                  {
                    color: (isOther || isSkippedChoice)
                      ? colors.mutedForeground
                      : colors.foreground,
                    fontWeight: FontWeight.normal,
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

      {consumed &&
      chosenValue === undefined &&
      chosenFreeText === undefined ? (
        <Text style={[styles.skippedLabel, { color: colors.mutedForeground }]}>
          {t('chat.options.skipped')}
        </Text>
      ) : null}

      {showFreeText ? (
        <View style={[styles.freeRow, { borderTopColor: colors.border }]}>
          <View
            style={[
              styles.badge,
              { borderColor: colors.border, borderWidth: 1, backgroundColor: 'transparent' },
            ]}
          >
            <Pencil size={11} color={colors.mutedForeground} strokeWidth={2} />
          </View>

          <TextInput
            style={[styles.freeInput, { color: colors.foreground }]}
            placeholder={
              question.freeTextPlaceholder ?? t('chat.options.defaultPlaceholder')
            }
            placeholderTextColor={colors.mutedForeground}
            value={answer.freeText}
            onChangeText={(text) => onFreeTextChange(question.id, text)}
            returnKeyType="done"
            multiline={false}
            editable={!disabled}
            maxLength={4000}
            textContentType="none"
            accessibilityLabel={
              question.freeTextPlaceholder ?? t('chat.options.defaultPlaceholder')
            }
          />
        </View>
      ) : null}

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
}
