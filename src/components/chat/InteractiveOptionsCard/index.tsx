import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowUp, ChevronDown, ChevronRight, ChevronUp, MessageCircleQuestionMark, RotateCcw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type {
  ClawboyOptionsPrompt,
  MultiSurveyStates,
} from '@/lib/openclaw/interactive';
import { composeAnswersMessage, normalizeToQuestions } from '@/lib/openclaw/interactive';
import { useTheme } from '@/hooks/useTheme';
import { hexToRgba } from '@/utils/color';
import { emptyAnswer, PRESS_ALPHA, DISABLED_BG_ALPHA, type QuestionAnswer } from './types';
import { styles } from './cardStyles';
import { QuestionBody } from './QuestionBody';
import { CollapsedSummary } from './CollapsedSummary';

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

  const isConsumed = Object.values(surveyStates).some((s) => s.consumed);

  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, emptyAnswer()])),
  );

  useEffect(() => {
    if (!isConsumed) {
      setAnswers(Object.fromEntries(questions.map((q) => [q.id, emptyAnswer()])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConsumed]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const clampedIndex = Math.min(currentIndex, questions.length - 1);
  const currentQuestion = questions[clampedIndex];

  const sentRef = useRef(false);
  useEffect(() => {
    if (!isConsumed) sentRef.current = false;
  }, [isConsumed]);
  const prevDisabledRef = useRef(disabled);
  useEffect(() => {
    if (prevDisabledRef.current && !disabled) sentRef.current = false;
    prevDisabledRef.current = disabled;
  }, [disabled]);

  // ---------------------------------------------------------------------------
  // Collapse / expand (consumed state)
  // ---------------------------------------------------------------------------

  const [userExpanded, setUserExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [summaryContentHeight, setSummaryContentHeight] = useState(0);
  const height = useSharedValue(0);
  const opacity = useSharedValue(0);
  const summaryHeight = useSharedValue(0);
  const summaryOpacity = useSharedValue(1);
  const chevronAnim = useSharedValue(0);

  useEffect(() => {
    if (!isConsumed) {
      setUserExpanded(false);
    }
  }, [isConsumed]);

  useEffect(() => {
    if (!isConsumed) return;
    height.value = withTiming(userExpanded ? contentHeight : 0, { duration: 200 });
    opacity.value = withTiming(userExpanded ? 1 : 0, { duration: 200 });
    summaryHeight.value = withTiming(userExpanded ? 0 : summaryContentHeight, { duration: 200 });
    summaryOpacity.value = withTiming(userExpanded ? 0 : 1, { duration: 200 });
    chevronAnim.value = withTiming(userExpanded ? 90 : 0, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [isConsumed, userExpanded, contentHeight, summaryContentHeight, chevronAnim, height, opacity, summaryHeight, summaryOpacity]);

  const bodyStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
    overflow: 'hidden',
  }));

  const summaryStyle = useAnimatedStyle(() => ({
    height: summaryHeight.value,
    opacity: summaryOpacity.value,
    overflow: 'hidden',
  }));

  const chevronAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronAnim.value}deg` }],
  }));

  const onMeasureBody = (e: LayoutChangeEvent): void => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - contentHeight) > 1) {
      setContentHeight(h);
    }
  };

  const onMeasureSummary = (e: LayoutChangeEvent): void => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - summaryContentHeight) > 1) {
      setSummaryContentHeight(h);
    }
  };

  // ---------------------------------------------------------------------------
  // Live-mode handlers
  // ---------------------------------------------------------------------------

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

  const currentSurveyState = surveyStates[currentQuestion.id] ?? { consumed: false as const };

  return (
    <View
      style={[
        styles.card,
        { borderColor: colors.border, backgroundColor: colors.secondary },
      ]}
    >
      {/* Single-Q header — becomes pressable when consumed */}
      {!isMulti ? (
        <Pressable
          onPress={isConsumed ? () => setUserExpanded((e) => !e) : undefined}
          disabled={!isConsumed}
          accessibilityRole={isConsumed ? 'button' : undefined}
          accessibilityState={isConsumed ? { expanded: userExpanded } : undefined}
          style={[styles.header, styles.headerSingle, { borderBottomColor: colors.border }]}
        >
          <View style={styles.headerLeft}>
            <MessageCircleQuestionMark size={14} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.multiHeaderTitle, { color: colors.mutedForeground }]}>
              {t('chat.options.questionHeader')}
            </Text>
          </View>
          {isConsumed ? (
            <Animated.View style={chevronAnimStyle}>
              <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={2} />
            </Animated.View>
          ) : null}
        </Pressable>
      ) : null}

      {/* Multi-Q header — becomes pressable when consumed; nav hidden while collapsed */}
      {isMulti ? (
        <Pressable
          onPress={isConsumed ? () => setUserExpanded((e) => !e) : undefined}
          disabled={!isConsumed}
          accessibilityRole={isConsumed ? 'button' : undefined}
          accessibilityState={isConsumed ? { expanded: userExpanded } : undefined}
          style={[styles.header, styles.headerMulti, { borderBottomColor: colors.border }]}
        >
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
            {(!isConsumed || userExpanded) ? (
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
            ) : null}
            {isConsumed ? (
              <Animated.View style={chevronAnimStyle}>
                <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={2} />
              </Animated.View>
            ) : null}
          </View>
        </Pressable>
      ) : null}

      {/* Consumed mode: hidden measurement ghosts + collapsed summary + animated body */}
      {isConsumed ? (
        <>
          {/* Absolutely-positioned ghost for measuring consumed body height */}
          <View style={styles.measureHidden} pointerEvents="none">
            <View onLayout={onMeasureBody}>
              <QuestionBody
                question={currentQuestion}
                answer={answers[currentQuestion.id] ?? emptyAnswer()}
                surveyState={currentSurveyState}
                isConsumed={true}
                isMulti={isMulti}
                disabled={disabled}
                colors={colors}
                t={t}
                onChoiceTap={handleChoiceTap}
                onFreeTextChange={handleFreeTextChange}
              />
            </View>
          </View>

          {/* Absolutely-positioned ghost for measuring collapsed summary height */}
          <View style={styles.measureHidden} pointerEvents="none">
            <View onLayout={onMeasureSummary}>
              <CollapsedSummary
                questions={questions}
                surveyStates={surveyStates}
                isMulti={isMulti}
                colors={colors}
                t={t}
              />
            </View>
          </View>

          {/* Collapsed summary (animates to height 0 when expanded) */}
          <Animated.View testID="options-summary-block" style={summaryStyle}>
            <CollapsedSummary
              questions={questions}
              surveyStates={surveyStates}
              isMulti={isMulti}
              colors={colors}
              t={t}
            />
            <LinearGradient
              colors={[hexToRgba(colors.secondary, 0), colors.secondary]}
              style={styles.summaryGradient}
              pointerEvents="none"
            />
          </Animated.View>

          {/* Expandable body (height animates 0 ↔ contentHeight) */}
          <Animated.View style={bodyStyle}>
            <QuestionBody
              question={currentQuestion}
              answer={answers[currentQuestion.id] ?? emptyAnswer()}
              surveyState={currentSurveyState}
              isConsumed={true}
              isMulti={isMulti}
              disabled={disabled}
              colors={colors}
              t={t}
              onChoiceTap={handleChoiceTap}
              onFreeTextChange={handleFreeTextChange}
            />
          </Animated.View>
        </>
      ) : (
        /* Live mode: body always visible, no animation */
        <QuestionBody
          question={currentQuestion}
          answer={answers[currentQuestion.id] ?? emptyAnswer()}
          surveyState={currentSurveyState}
          isConsumed={false}
          isMulti={isMulti}
          disabled={disabled}
          colors={colors}
          t={t}
          onChoiceTap={handleChoiceTap}
          onFreeTextChange={handleFreeTextChange}
        />
      )}

      {/* Footer — shown in live mode only */}
      {!isConsumed ? (
        <View style={[styles.sendFooter, { borderTopColor: colors.border }]}>
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

          <View style={styles.footerSpacer} />

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
