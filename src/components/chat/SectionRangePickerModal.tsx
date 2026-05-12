/**
 * SectionRangePickerModal — small modal for selecting an arbitrary text range
 * within a single message section.
 *
 * Opens via long-press on a section's "Add comment" affordance. Shows the
 * section's raw text in a non-editable TextInput so the user can drag-select
 * a span. On save, translates the section-local selection offsets back to
 * message-global character offsets and creates a range annotation.
 */

import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import type { MessageBlock } from '@/lib/messageBlocks';

export interface SectionRangePickerModalProps {
  visible: boolean;
  section: MessageBlock | null;
  onSave: (
    localStart: number,
    localEnd: number,
    messageGlobalStart: number,
    messageGlobalEnd: number,
    quotedText: string,
  ) => void;
  onClose: () => void;
}

export function SectionRangePickerModal({
  visible,
  section,
  onSave,
  onClose,
}: SectionRangePickerModalProps): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);

  const raw = section?.raw ?? '';

  const handleSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>): void => {
      const { start, end } = e.nativeEvent.selection;
      if (end > start) {
        setSelection({ start, end });
      } else {
        setSelection(null);
      }
    },
    [],
  );

  const handleSave = useCallback((): void => {
    if (!section || !selection || selection.end <= selection.start) return;
    const { start, end } = selection;
    const globalStart = section.sourceStart + start;
    const globalEnd = section.sourceStart + end;
    const quotedText = raw.slice(start, end);
    onSave(start, end, globalStart, globalEnd, quotedText);
    setSelection(null);
  }, [section, selection, raw, onSave]);

  const handleClose = useCallback((): void => {
    setSelection(null);
    onClose();
  }, [onClose]);

  if (!section) return null;

  const canSave = selection !== null && selection.end > selection.start;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={handleClose}
      accessibilityViewIsModal={true}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.sheet, { backgroundColor: colors.background }]}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={handleClose}
            hitSlop={10}
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel={t('common.cancel')}
            accessibilityRole="button"
          >
            <X size={20} color={colors.mutedForeground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {t('chat.annotate.rangePickerTitle')}
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            hitSlop={10}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: canSave ? colors.primary : colors.secondary },
              pressed && { opacity: 0.8 },
            ]}
            accessibilityLabel={t('chat.annotate.save')}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.saveBtnText,
                { color: canSave ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              {t('chat.annotate.save')}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, Spacing.lg) }]}
          keyboardShouldPersistTaps="handled"
        >
          {section.headingText ? (
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {section.headingText}
            </Text>
          ) : null}
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            {t('chat.annotate.rangeHint')}
          </Text>
          <TextInput
            style={[
              styles.textArea,
              {
                color: colors.foreground,
                backgroundColor: colors.secondary,
                borderColor: canSave ? colors.primary : colors.border,
              },
            ]}
            value={raw}
            editable={false}
            multiline
            selectTextOnFocus={false}
            onSelectionChange={handleSelectionChange}
            contextMenuHidden={false}
          />
          {canSave ? (
            <Text style={[styles.selectionStatus, { color: colors.primary }]}>
              {t('chat.annotate.selectionLength', { count: selection!.end - selection!.start })}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerBtn: {
    padding: 4,
    borderRadius: BorderRadius.sm,
    minWidth: 40,
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  saveBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    minWidth: 40,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hint: {
    fontSize: FontSize.sm,
  },
  textArea: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    minHeight: 200,
    textAlignVertical: 'top',
  },
  selectionStatus: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
});
