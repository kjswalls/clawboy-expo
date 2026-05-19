import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAnnotationLayoutMaybe } from './AnnotationLayoutContext';
import { useLiveDraftFor } from '@/contexts/AnnotationDraftContext';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { MessageSquare, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import type { Annotation } from '@/lib/annotations';

interface InlineAnnotationRowProps {
  annotation: Annotation;
  highlighted?: boolean;
  onEditPress: (id: string) => void;
  onLongPress: (id: string) => void;
  onDeletePress: (id: string) => void;
  colors: ThemeColors;
}

export function InlineAnnotationRow({
  annotation,
  highlighted = false,
  onEditPress,
  onLongPress,
  onDeletePress,
  colors,
}: InlineAnnotationRowProps): React.JSX.Element {
  const { t } = useTranslation();

  const layout = useAnnotationLayoutMaybe();
  const cardRef = useRef<View>(null);

  useEffect(() => {
    if (!layout) return;
    if (cardRef.current) {
      layout.register(annotation.id, cardRef.current);
    }
    return () => {
      layout.unregister(annotation.id);
    };
  }, [annotation.id, layout]);

  const flashOpacity = useSharedValue(0);

  useEffect(() => {
    if (!highlighted) return;
    flashOpacity.value = withSequence(
      withTiming(1, { duration: 120 }),
      withTiming(0, { duration: 580 }),
    );
  }, [highlighted, flashOpacity]);

  const flashStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: BorderRadius.md,
    backgroundColor: `${colors.primary}33`,
    opacity: flashOpacity.value,
  }));

  const handleEditPress = useCallback(() => onEditPress(annotation.id), [onEditPress, annotation.id]);
  const handleLongPress = useCallback(() => onLongPress(annotation.id), [onLongPress, annotation.id]);
  const handleDeletePress = useCallback(() => onDeletePress(annotation.id), [onDeletePress, annotation.id]);

  const liveDraft = useLiveDraftFor(annotation.id);
  const isEditing = liveDraft !== null;
  const displayText = isEditing ? liveDraft : annotation.comment;
  const placeholderKey = isEditing ? 'chat.annotate.writeComment' : 'chat.annotate.tapToComment';
  const label = displayText || t(placeholderKey);

  return (
    <View
      ref={cardRef}
      style={[
        styles.card,
        isEditing ? {
          backgroundColor: `${colors.primary}1a`,
          borderColor: colors.primary,
          borderWidth: 1.5,
          shadowColor: colors.primary,
          shadowOpacity: 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 0 },
          elevation: 4,
        } : {
          backgroundColor: `${colors.primary}0d`,
          borderColor: `${colors.primary}40`,
        },
      ]}
    >
      <Animated.View style={flashStyle} />

      <View style={styles.row}>
        <Pressable
          onPress={handleEditPress}
          onLongPress={handleLongPress}
          style={styles.editArea}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: `${colors.primary}1a`,
                borderColor: `${colors.primary}33`,
              },
            ]}
          >
            <MessageSquare size={12} color={colors.primary} />
          </View>
          <View style={styles.textColumn}>
            {displayText ? (
              <Text style={[styles.commentText, { color: colors.foreground }]}>
                {displayText}
              </Text>
            ) : (
              <Text style={[styles.placeholderText, { color: colors.mutedForeground }]}>
                {t(placeholderKey)}
              </Text>
            )}
          </View>
        </Pressable>
        <Pressable
          onPress={handleDeletePress}
          style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={t('chat.annotate.deleteCommentLabel')}
          hitSlop={8}
        >
          <X size={14} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  editArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  deleteBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  iconContainer: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textColumn: {
    flex: 1,
  },
  commentText: {
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  placeholderText: {
    fontSize: FontSize.sm,
    lineHeight: 18,
    fontStyle: 'italic',
  },
});
