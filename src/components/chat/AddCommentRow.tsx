import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MessageSquarePlus, TextSelect } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';

export interface AddCommentRowProps {
  onAddBlock: () => void;
  onAddRange: () => void;
  colors: ThemeColors;
  hasExisting?: boolean;
}

export function AddCommentRow({ onAddBlock, onAddRange, colors, hasExisting = false }: AddCommentRowProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View style={styles.addRow}>
      <Pressable
        onPress={onAddBlock}
        style={({ pressed }) => [
          styles.addBtn,
          { borderColor: `${colors.primary}50`, backgroundColor: `${colors.primary}0a` },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityLabel={hasExisting ? t('chat.annotate.addAnother') : t('chat.annotate.addComment')}
        accessibilityRole="button"
      >
        <MessageSquarePlus size={12} color={colors.primary} />
        <Text style={[styles.addBtnText, { color: colors.primary }]}>
          {hasExisting ? t('chat.annotate.addAnother') : t('chat.annotate.addComment')}
        </Text>
      </Pressable>
      <Pressable
        onPress={onAddRange}
        style={({ pressed }) => [
          styles.addRangeBtn,
          { borderColor: colors.border },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityLabel={t('chat.annotate.addRangeComment')}
        accessibilityRole="button"
        hitSlop={8}
      >
        <TextSelect size={12} color={colors.mutedForeground} />
        <Text style={[styles.addRangeBtnText, { color: colors.mutedForeground }]}>
          {t('chat.annotate.addRangeComment')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  addBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  addRangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  addRangeBtnText: {
    fontSize: FontSize.xs,
  },
});
