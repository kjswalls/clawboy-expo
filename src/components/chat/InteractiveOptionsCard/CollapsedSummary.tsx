import React from 'react';
import { Text, View } from 'react-native';
import { FontWeight } from '@/constants/theme';
import type { ClawboyQuestion, MultiSurveyStates, SurveyConsumedState } from '@/lib/openclaw/interactive';
import type { ThemeColors } from '@/types';
import { badgeLabel, PRESS_ALPHA } from './types';
import { styles } from './cardStyles';

export interface CollapsedSummaryProps {
  questions: ClawboyQuestion[];
  surveyStates: MultiSurveyStates;
  isMulti: boolean;
  colors: ThemeColors;
  t: ReturnType<typeof import('react-i18next').useTranslation>['t'];
}

export function CollapsedSummary({
  questions,
  surveyStates,
  isMulti,
  colors,
  t,
}: CollapsedSummaryProps): React.JSX.Element {
  return (
    <View>
      {questions.map((q, qi) => {
        const state = surveyStates[q.id];
        const consumed = state?.consumed ?? false;
        const chosenValue = consumed ? (state as SurveyConsumedState).chosenValue : undefined;
        const chosenFreeText = consumed ? (state as SurveyConsumedState).chosenFreeText : undefined;
        const choiceIndex = chosenValue !== undefined
          ? q.choices.findIndex((c) => c.value === chosenValue)
          : -1;
        const choice = choiceIndex >= 0 ? q.choices[choiceIndex] : undefined;

        return (
          <React.Fragment key={q.id}>
            {qi > 0 ? (
              <View style={[styles.questionSeparator, { backgroundColor: colors.border }]} />
            ) : null}
            {q.prompt ? (
              <Text
                style={[
                  styles.promptLabel,
                  { color: colors.foreground },
                  isMulti ? styles.collapsedPromptCompact : null,
                ]}
                numberOfLines={isMulti ? 2 : undefined}
              >
                {q.prompt}
              </Text>
            ) : null}
            {choice ? (
              <View
                style={[
                  styles.choiceRow,
                  { backgroundColor: colors.foreground + PRESS_ALPHA },
                ]}
              >
                <View style={[styles.badge, { backgroundColor: colors.primary, borderWidth: 0 }]}>
                  <Text
                    style={[
                      styles.badgeLetter,
                      { color: colors.primaryForeground, fontWeight: FontWeight.normal },
                    ]}
                  >
                    {badgeLabel(choiceIndex)}
                  </Text>
                </View>
                <View style={styles.choiceLabelWrap}>
                  <Text
                    style={[
                      styles.choiceLabel,
                      { color: colors.foreground, fontWeight: FontWeight.normal },
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
              </View>
            ) : chosenFreeText ? (
              <View style={[styles.quotePill, { backgroundColor: colors.muted }]}>
                <Text style={[styles.quotePillCaption, { color: colors.mutedForeground }]}>
                  {t('chat.options.youReplied')}
                </Text>
                <Text style={[styles.quotePillValue, { color: colors.foreground }]}>
                  {chosenFreeText}
                </Text>
              </View>
            ) : (
              <Text style={[styles.skippedLabel, { color: colors.mutedForeground }]}>
                {t('chat.options.skipped')}
              </Text>
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}
