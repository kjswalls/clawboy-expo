import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ArrowUp, ChevronDown, ChevronUp, MessageCircleQuestionMark, Pencil, RotateCcw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type {
  ClawboyOptionsPrompt,
  ClawboyQuestion,
  MultiSurveyStates,
  SurveyConsumedState,
} from '@/lib/openclaw/interactive';
import { composeAnswersMessage, normalizeToQuestions } from '@/lib/openclaw/interactive';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';

// Hex alpha suffixes for semi-transparent overlays.
const PRESS_ALPHA = '0A';
const DISABLED_BG_ALPHA = '24';

/** Returns A, B, C … Z, then 1, 2, 3 … for indices beyond 25. */
function badgeLabel(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

/** Per-question answer state: picked choice value OR freeform text. */
type QuestionAnswer = { picked?: string; freeText: string };

function emptyAnswer(): QuestionAnswer {
  return { picked: undefined, freeText: '' };
}

interface InteractiveOptionsCardProps {
  prompt: ClawboyOptionsPrompt;
  /**
   * Per-question consumed states keyed by question id.
   * All questions should return `{ consumed: false }` when no reply has arrived.
   */
  surveyStates?: MultiSurveyStates;
  /** Disabled while the assistant turn is still streaming. */
  disabled?: boolean;
  /**
   * Called when the user sends their answers.
   * Receives the full raw message string (including the hidden
   * `<!-- clawboy:answers {...} -->` directive + human-readable summary).
   */
  onSubmitMultiReply: (rawMessage: string) => void;
  /**
   * When set (e.g. settings preview), Send stays gated on `canSend` but triggers this
   * instead of submitting — no `sentRef` lockout, repeated taps OK.
   */
  onSendPreview?: () => void;
}

export const InteractiveOptionsCard = React.memo(function InteractiveOptionsCard({
  prompt,
  surveyStates = {},
  disabled = false,
  onSubmitMultiReply,
  onSendPreview,
}: InteractiveOptionsCardProps): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const questions = normalizeToQuestions(prompt);
  const isMulti = questions.length > 1;

  // Determine global consumed state: card is locked if any question was answered.
  const isConsumed = Object.values(surveyStates).some((s) => s.consumed);

  // Per-question local answer state (live mode only).
  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, emptyAnswer()])),
  );

  // Reset answer state when the card goes live → consumed → live again (e.g. retry).
  useEffect(() => {
    if (!isConsumed) {
      setAnswers(Object.fromEntries(questions.map((q) => [q.id, emptyAnswer()])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConsumed]);

  // Current page index (0-based).
  const [currentIndex, setCurrentIndex] = useState(0);
  const clampedIndex = Math.min(currentIndex, questions.length - 1);
  const currentQuestion = questions[clampedIndex];

  // One-shot guard: prevent a fast double-tap from dispatching two chat.send calls.
  const sentRef = useRef(false);
  useEffect(() => {
    if (!isConsumed) sentRef.current = false;
  }, [isConsumed]);
  const prevDisabledRef = useRef(disabled);
  useEffect(() => {
    if (prevDisabledRef.current && !disabled) sentRef.current = false;
    prevDisabledRef.current = disabled;
  }, [disabled]);

  const handleChoiceTap = useCallback(
    (questionId: string, value: string) => {
      if (isConsumed || disabled) return;
      setAnswers((prev) => {
        const current = prev[questionId] ?? emptyAnswer();
        return {
          ...prev,
          [questionId]: {
            picked: current.picked === value ? undefined : value,
            freeText: '',
          },
        };
      });
    },
    [isConsumed, disabled],
  );

  const handleFreeTextChange = useCallback(
    (questionId: string, text: string) => {
      setAnswers((prev) => ({
        ...prev,
        [questionId]: { picked: undefined, freeText: text },
      }));
    },
    [],
  );

  // Whether at least one question has any answer.
  const hasAnyAnswer = questions.some((q) => {
    const a = answers[q.id];
    return (a?.picked !== undefined) || (a?.freeText.trim().length ?? 0) > 0;
  });

  const canSend = !disabled && hasAnyAnswer;

  const handleClear = useCallback(() => {
    if (isConsumed || disabled) return;
    setAnswers(Object.fromEntries(questions.map((q) => [q.id, emptyAnswer()])));
  }, [isConsumed, disabled, questions]);

  const handleSend = useCallback(() => {
    if (!canSend) return;
    if (onSendPreview) {
      onSendPreview();
      return;
    }
    if (sentRef.current) return;
    sentRef.current = true;

    // Build answers map: questionId → value string or null (skipped).
    const answersMap: Record<string, string | null> = {};
    for (const q of questions) {
      const a = answers[q.id];
      const freeText = a?.freeText.trim() ?? '';
      if (freeText) {
        answersMap[q.id] = freeText;
      } else if (a?.picked !== undefined) {
        answersMap[q.id] = a.picked;
      } else {
        answersMap[q.id] = null;
      }
    }

    onSubmitMultiReply(composeAnswersMessage(prompt, answersMap));
  }, [canSend, onSendPreview, answers, questions, prompt, onSubmitMultiReply]);

  if (!currentQuestion) return <View />;

  return (
    <View
      style={[
        styles.card,
        { borderColor: colors.border, backgroundColor: colors.secondary },
      ]}
    >
      {/* Single-Q header */}
      {!isMulti ? (
        <View style={[styles.header, styles.headerSingle, { borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft}>
            <MessageCircleQuestionMark size={14} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.multiHeaderTitle, { color: colors.mutedForeground }]}>
              {t('chat.options.questionHeader')}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Multi-Q header: always visible (needed for navigation even in consumed state) */}
      {isMulti ? (
        <View style={[styles.header, styles.headerMulti, { borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft}>
            <MessageCircleQuestionMark size={14} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.multiHeaderTitle, { color: colors.mutedForeground }]}>
              {t('chat.options.questionsHeader')}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={[styles.counter, { color: colors.mutedForeground }]}>
              {t('chat.options.questionCounter', {
                current: String(clampedIndex + 1),
                total: String(questions.length),
              })}
            </Text>
            <View style={styles.navButtons}>
              <Pressable
                onPress={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={clampedIndex === 0}
                accessibilityRole="button"
                accessibilityLabel={t('chat.options.prevQuestion')}
                style={({ pressed }) => [
                  styles.navBtn,
                  { opacity: clampedIndex === 0 ? 0.3 : pressed ? 0.6 : 1 },
                ]}
              >
                <ChevronUp size={16} color={colors.mutedForeground} strokeWidth={2} />
              </Pressable>
              <Pressable
                onPress={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                disabled={clampedIndex === questions.length - 1}
                accessibilityRole="button"
                accessibilityLabel={t('chat.options.nextQuestion')}
                style={({ pressed }) => [
                  styles.navBtn,
                  {
                    opacity:
                      clampedIndex === questions.length - 1 ? 0.3 : pressed ? 0.6 : 1,
                  },
                ]}
              >
                <ChevronDown size={16} color={colors.mutedForeground} strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {/* Current question body */}
      <QuestionBody
        question={currentQuestion}
        answer={answers[currentQuestion.id] ?? emptyAnswer()}
        surveyState={surveyStates[currentQuestion.id] ?? { consumed: false }}
        isConsumed={isConsumed}
        isMulti={isMulti}
        disabled={disabled}
        colors={colors}
        t={t}
        onChoiceTap={handleChoiceTap}
        onFreeTextChange={handleFreeTextChange}
      />

      {/* Footer — shown in live mode */}
      {!isConsumed ? (
        <View style={[styles.sendFooter, { borderTopColor: colors.border }]}>
          {/* Left: Clear — always present; disabled until any answer exists */}
          <Pressable
            onPress={handleClear}
            disabled={disabled || !hasAnyAnswer}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('chat.options.clear')}
            accessibilityState={{ disabled: disabled || !hasAnyAnswer }}
            style={({ pressed }) => [
              styles.clearBtn,
              {
                borderColor: colors.border,
                backgroundColor: pressed && !(disabled || !hasAnyAnswer)
                  ? colors.foreground + PRESS_ALPHA
                  : 'transparent',
                opacity:
                  disabled || !hasAnyAnswer ? 0.35 : pressed ? 0.8 : 1,
              },
            ]}
          >
            <RotateCcw size={12} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.footerSideText, { color: colors.mutedForeground }]}>
              {t('chat.options.clear')}
            </Text>
          </Pressable>

          {/* Spacer pushes Send to the right */}
          <View style={styles.footerSpacer} />

          {/* Right: Send — matches InputBarActionBar styling */}
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            style={({ pressed }) => [
              styles.sendBtn,
              !canSend && {
                backgroundColor: colors.mutedForeground + DISABLED_BG_ALPHA,
                opacity: 0.4,
              },
              canSend && {
                backgroundColor: colors.foreground,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('chat.options.sendAnswers')}
            accessibilityState={{ disabled: !canSend }}
          >
            <Text
              style={[
                styles.sendBtnText,
                { color: canSend ? colors.background : colors.mutedForeground },
              ]}
            >
              {t('chat.options.submit')}
            </Text>
            <ArrowUp
              size={14}
              color={canSend ? colors.background : colors.mutedForeground}
              strokeWidth={2.5}
            />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Per-question body (extracted to keep the outer component manageable)
// ---------------------------------------------------------------------------

interface QuestionBodyProps {
  question: ClawboyQuestion;
  answer: QuestionAnswer;
  surveyState: ReturnType<typeof import('@/lib/openclaw/interactive').deriveMultiSurveyState>[string];
  isConsumed: boolean;
  /** When true the prompt label renders inline (multi-Q uses the header for the prompt; single-Q owns it via the header bar). */
  isMulti: boolean;
  disabled: boolean;
  colors: ReturnType<typeof import('@/hooks/useTheme').useTheme>['colors'];
  t: ReturnType<typeof import('react-i18next').useTranslation>['t'];
  onChoiceTap: (questionId: string, value: string) => void;
  onFreeTextChange: (questionId: string, text: string) => void;
}

function QuestionBody({
  question,
  answer,
  surveyState,
  isConsumed,
  isMulti,
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
      {/* Prompt label: rendered inline for both single-Q and multi-Q */}
      {question.prompt ? (
        <>
          <Text style={[styles.promptLabel, { color: colors.foreground }]}>
            {question.prompt}
          </Text>
          <View style={[styles.questionSeparator, { backgroundColor: colors.border }]} />
        </>
      ) : null}

      {/* Choice rows */}
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

            {/* Label + optional hint */}
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

      {/* Skipped label — consumed, no choice or freetext */}
      {consumed &&
      chosenValue === undefined &&
      chosenFreeText === undefined ? (
        <Text style={[styles.skippedLabel, { color: colors.mutedForeground }]}>
          {t('chat.options.skipped')}
        </Text>
      ) : null}

      {/* Free-form "Other…" input row — live mode only */}
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

      {/* Consumed free-text quote pill */}
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

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius['2xl'],
    paddingVertical: Spacing.xs,
    overflow: 'hidden',
  },
  // ── Header bar (shared by multi-Q and single-Q) ────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.xs,
  },
  headerSingle: {
    justifyContent: 'flex-start',
  },
  headerMulti: {
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  multiHeaderTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
  counter: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
  navButtons: {
    flexDirection: 'row',
    gap: 2,
  },
  navBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.sm,
  },
  // ── Question prompt (multi-Q inline label only) ───────────────────────────
  promptLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
    paddingBottom: 2,
  },
  questionSeparator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.sm,
    marginTop: Spacing.xs,
    marginBottom: 2,
  },
  skippedLabel: {
    fontSize: FontSize.xs,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
    fontStyle: 'italic',
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
  // ── Send footer ───────────────────────────────────────────────────────────
  sendFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  // Clear button (both single-Q and multi-Q footer)
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    minHeight: 30,
  },
  footerSideText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  footerSpacer: {
    flex: 1,
  },
  // Send button — matches InputBarActionBar
  sendBtn: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    height: 34,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    flexShrink: 0,
  },
  sendBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
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
