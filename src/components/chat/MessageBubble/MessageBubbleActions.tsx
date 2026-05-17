import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, Check, Copy, MessageSquarePlus, RotateCcw, Volume2, VolumeX } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { FontSize, FontWeight } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import { formatMessageTime } from '@/utils/formatting';

interface MessageBubbleActionsProps {
  isUser: boolean;
  trimmedContent: string;
  timestamp: Date;
  copied: boolean;
  speaking: boolean;
  interrupted: boolean | undefined;
  onCopy: () => void;
  onSpeak: (() => void) | undefined;
  onRetry: (() => void) | undefined;
  onAnnotate: (() => void) | undefined;
  annotateMode?: boolean;
  hasSavedAnnotations?: boolean;
  annotationCount?: number;
  colors: ThemeColors;
}

export const MessageBubbleActions = React.memo(function MessageBubbleActions({
  isUser,
  trimmedContent,
  timestamp,
  copied,
  speaking,
  interrupted,
  onCopy,
  onSpeak,
  onRetry,
  onAnnotate,
  annotateMode = false,
  hasSavedAnnotations = false,
  annotationCount = 0,
  colors,
}: MessageBubbleActionsProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      {interrupted && !isUser ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            actionsStyles.interruptedPill,
            { backgroundColor: colors.secondary, borderColor: colors.warning ?? '#F59E0B' },
            pressed && { opacity: 0.75 },
          ]}
          hitSlop={6}
          accessibilityLabel={t('chat.message.retryLabel')}
          accessibilityRole="button"
        >
          <AlertTriangle size={11} color={colors.warning ?? '#F59E0B'} />
          <Text style={[actionsStyles.interruptedText, { color: colors.warning ?? '#F59E0B' }]}>
            {t('chat.message.interrupted')}
          </Text>
          {onRetry ? (
            <>
              <View style={[actionsStyles.interruptedDivider, { backgroundColor: colors.warning ?? '#F59E0B' }]} />
              <RotateCcw size={11} color={colors.warning ?? '#F59E0B'} />
              <Text style={[actionsStyles.interruptedText, { color: colors.warning ?? '#F59E0B' }]}>
                {t('chat.message.retry')}
              </Text>
            </>
          ) : null}
        </Pressable>
      ) : null}

      <View style={[actionsStyles.meta, isUser ? actionsStyles.metaEnd : actionsStyles.metaStart]}>
        <Text style={[actionsStyles.time, { color: colors.mutedForeground }]}>
          {formatMessageTime(timestamp)}
        </Text>
        {trimmedContent ? (
          <Pressable
            onPress={onCopy}
            hitSlop={10}
            style={({ pressed }) => [actionsStyles.copyBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel={t('chat.message.copyLabel')}
            accessibilityRole="button"
          >
            {copied ? (
              <Check size={14} color={colors.success} />
            ) : (
              <Copy size={14} color="rgba(139, 139, 139, 0.5)" />
            )}
          </Pressable>
        ) : null}
        {!isUser && trimmedContent && onSpeak ? (
          <Pressable
            onPress={onSpeak}
            hitSlop={10}
            style={({ pressed }) => [actionsStyles.copyBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel={speaking ? t('chat.message.stopSpeaking') : t('chat.message.readAloud')}
            accessibilityRole="button"
          >
            {speaking ? (
              <VolumeX size={14} color={colors.primary} />
            ) : (
              <Volume2 size={14} color="rgba(139, 139, 139, 0.5)" />
            )}
          </Pressable>
        ) : null}
        {!isUser && trimmedContent && onAnnotate ? (
          <Pressable
            onPress={onAnnotate}
            hitSlop={10}
            style={({ pressed }) => [
              actionsStyles.copyBtn,
              annotateMode && {
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 8,
                backgroundColor: `${colors.primary}20`,
              },
              !annotateMode && hasSavedAnnotations && {
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 8,
                backgroundColor: `${colors.primary}1a`,
                shadowColor: colors.primary,
                shadowOpacity: 0.35,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 0 },
                elevation: 4,
              },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel={
              annotateMode
                ? t('chat.annotate.doneAnnotating')
                : hasSavedAnnotations
                  ? t('chat.annotate.iconLabelWithCount', { count: annotationCount })
                  : t('chat.annotate.iconLabel')
            }
            accessibilityRole="button"
          >
            {annotateMode ? (
              <Text style={[actionsStyles.doneText, { color: colors.primary }]}>
                {t('chat.annotate.doneAnnotating')}
              </Text>
            ) : (
              <MessageSquarePlus
                size={14}
                color={hasSavedAnnotations ? colors.primary : 'rgba(139, 139, 139, 0.5)'}
              />
            )}
          </Pressable>
        ) : null}
      </View>
    </>
  );
});

const actionsStyles = StyleSheet.create({
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  metaStart: {
    flexDirection: 'row',
  },
  metaEnd: {
    flexDirection: 'row-reverse',
  },
  time: {
    fontSize: FontSize.xs,
  },
  copyBtn: {
    padding: 2,
    borderRadius: 4,
  },
  interruptedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  interruptedText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  interruptedDivider: {
    width: 1,
    height: 10,
    opacity: 0.4,
    marginHorizontal: 2,
  },
  doneText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
});
