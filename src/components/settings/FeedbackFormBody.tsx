import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Bug, Sparkles } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { FeedbackKind } from '@/lib/feedback/submitFeedback';
import { TITLE_MAX, BODY_MAX, CONTACT_MAX, BODY_MIN } from './feedbackHelpers';

type Props = {
  kind: FeedbackKind;
  title: string;
  body: string;
  contact: string;
  onKindChange: (k: FeedbackKind) => void;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onContactChange: (v: string) => void;
  trimmedTitle: string;
  trimmedBody: string;
};

export function FeedbackFormBody({
  kind,
  title,
  body,
  contact,
  onKindChange,
  onTitleChange,
  onBodyChange,
  onContactChange,
  trimmedTitle,
  trimmedBody,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <>
      {/* Type segmented control */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('feedback.sectionType')}</Text>
      <View style={styles.segmentRow}>
        {(['bug', 'feature'] as FeedbackKind[]).map((k) => {
          const active = kind === k;
          const Icon = k === 'bug' ? Bug : Sparkles;
          return (
            <Pressable
              key={k}
              onPress={() => onKindChange(k)}
              style={[
                styles.segmentBtn,
                active
                  ? { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}50` }
                  : { backgroundColor: colors.secondary, borderColor: 'transparent' },
              ]}
            >
              <Icon size={14} color={active ? colors.primary : colors.mutedForeground} />
              <Text style={{
                fontSize: FontSize.sm,
                fontWeight: '500',
                color: active ? colors.primary : colors.mutedForeground,
              }}>
                {k === 'bug' ? t('feedback.kindBug') : t('feedback.kindFeature')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Title */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('feedback.sectionTitle')}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.fieldRow}>
          <TextInput
            value={title}
            onChangeText={onTitleChange}
            placeholder={kind === 'bug' ? t('feedback.placeholderBugTitle') : t('feedback.placeholderFeatureTitle')}
            placeholderTextColor={`${colors.mutedForeground}80`}
            maxLength={TITLE_MAX}
            autoCapitalize="sentences"
            style={[styles.fieldInput, {
              backgroundColor: colors.secondary,
              borderColor: 'transparent',
              color: colors.foreground,
            }]}
          />
          <View style={styles.counterRow}>
            <Text style={[styles.counter, { color: colors.mutedForeground }]}>
              {trimmedTitle.length}/{TITLE_MAX}
            </Text>
          </View>
        </View>
      </View>

      {/* Body */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
        {kind === 'bug' ? t('feedback.sectionBodyBug') : t('feedback.sectionBodyFeature')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.fieldRow}>
          <TextInput
            value={body}
            onChangeText={onBodyChange}
            placeholder={
              kind === 'bug'
                ? t('feedback.placeholderBodyBug')
                : t('feedback.placeholderBodyFeature')
            }
            placeholderTextColor={`${colors.mutedForeground}80`}
            maxLength={BODY_MAX}
            multiline
            textAlignVertical="top"
            style={[styles.fieldInput, styles.bodyInput, {
              backgroundColor: colors.secondary,
              borderColor: 'transparent',
              color: colors.foreground,
            }]}
          />
          <View style={styles.counterRow}>
            <Text style={[styles.counter, { color: colors.mutedForeground }]}>
              {trimmedBody.length}/{BODY_MAX}
            </Text>
          </View>
        </View>
      </View>

      {/* Contact (optional) */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('feedback.sectionContact')}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.fieldRow}>
          <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
            {t('feedback.contactHint')}
          </Text>
          <TextInput
            value={contact}
            onChangeText={onContactChange}
            placeholder={t('feedback.contactPlaceholder')}
            placeholderTextColor={`${colors.mutedForeground}80`}
            maxLength={CONTACT_MAX}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={[styles.fieldInput, styles.mono, {
              backgroundColor: colors.secondary,
              borderColor: 'transparent',
              color: colors.foreground,
            }]}
          />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: FontSize.xs, fontWeight: '500', marginBottom: 10, marginTop: Spacing.md },
  segmentRow: { flexDirection: 'row', gap: Spacing.sm },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  fieldRow: { paddingHorizontal: 12, paddingVertical: 10 },
  fieldHint: { fontSize: FontSize.xs, lineHeight: 16, marginBottom: 6 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: FontSize.sm,
  },
  bodyInput: { minHeight: 140 },
  counterRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 4 },
  counter: { fontSize: 11 },
  mono: { fontFamily: 'System' },
});
