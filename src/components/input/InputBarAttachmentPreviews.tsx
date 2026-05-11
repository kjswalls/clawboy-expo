import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FileText, Image as ImageIcon, Mic, TriangleAlert, Video, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

import type { InputAttachment } from './types';

interface InputBarAttachmentPreviewsProps {
  attachments: InputAttachment[];
  onRemoveAttachment: (id: string) => void;
  /**
   * When `false`, a small warning banner is shown above image thumbnails to
   * indicate the active model may not process image attachments.
   * `true` or `undefined` suppresses the banner (model supports images or
   * capability is unknown).
   */
  modelSupportsImageInput?: boolean;
  /**
   * When `false`, a small pill is shown on voice-note pills to inform the user
   * their recording will be transcribed to text before sending.
   * `true` = send as raw audio. `undefined` = capability unknown (no pill shown).
   */
  modelSupportsAudioInput?: boolean;
}

export function InputBarAttachmentPreviews({
  attachments,
  onRemoveAttachment,
  modelSupportsImageInput,
  modelSupportsAudioInput,
}: InputBarAttachmentPreviewsProps): React.JSX.Element | null {
  const { colors } = useThemeContext();
  const { t } = useTranslation();
  const images = attachments.filter((a) => a.type === 'image');
  const files = attachments.filter((a) => a.type === 'file' || a.type === 'video' || a.type === 'audio');

  if (images.length === 0 && files.length === 0) {
    return null;
  }

  const showVisionWarning = images.length > 0 && modelSupportsImageInput === false;

  return (
    <>
      {showVisionWarning ? (
        <View style={styles.visionWarnRow}>
          <TriangleAlert size={12} color={colors.warningText} />
          <Text style={[styles.visionWarnText, { color: colors.warningText }]}>
            {t('input.attach.visionWarning')}
          </Text>
        </View>
      ) : null}

      {images.length > 0 ? (
        <View style={[styles.attachRow, { paddingTop: Spacing.md }]}>
          {images.map((attachment) => (
            <View key={attachment.id} style={styles.thumbWrap}>
              <View style={[styles.thumb, { borderColor: colors.border }]}>
                {attachment.preview ? (
                  <Image
                    source={{ uri: attachment.preview }}
                    style={styles.thumbImg}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.thumbPlaceholder}>
                    <ImageIcon size={24} color={colors.mutedForeground} />
                  </View>
                )}
              </View>
              <Pressable
                onPress={() => onRemoveAttachment(attachment.id)}
                style={[styles.removeBtn, { backgroundColor: colors.foreground }]}
                accessibilityRole="button"
                accessibilityLabel={t('common.delete')}
              >
                <X size={12} color={colors.background} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {files.length > 0 ? (
        <View style={styles.fileRow}>
          {files.map((attachment) => {
            const isAudio = attachment.type === 'audio';
            const showTranscribeHint = isAudio && modelSupportsAudioInput === false;
            const showAudioHint = isAudio && modelSupportsAudioInput === true;
            return (
              <View key={attachment.id} style={styles.filePillGroup}>
                <View
                  style={[styles.filePill, { borderColor: colors.border, backgroundColor: colors.muted }]}
                >
                  {attachment.type === 'video' ? (
                    <Video size={16} color={colors.accentBlue} />
                  ) : isAudio ? (
                    <Mic size={16} color={colors.accentBlue} />
                  ) : (
                    <FileText size={16} color={colors.accentBlue} />
                  )}
                  <Text style={[styles.fileName, { color: colors.foreground }]} numberOfLines={1}>
                    {attachment.name}
                  </Text>
                  <Pressable
                    onPress={() => onRemoveAttachment(attachment.id)}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.delete')}
                  >
                    <X size={14} color={colors.mutedForeground} />
                  </Pressable>
                </View>
                {showTranscribeHint ? (
                  <Text style={[styles.audioHint, { color: colors.mutedForeground }]}>
                    {t('input.attach.willTranscribe')}
                  </Text>
                ) : showAudioHint ? (
                  <Text style={[styles.audioHint, { color: colors.mutedForeground }]}>
                    {t('input.attach.willSendAudio')}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  attachRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  thumbWrap: {
    position: 'relative',
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visionWarnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  visionWarnText: {
    fontSize: FontSize.xs,
  },
  fileRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  filePillGroup: {
    flexDirection: 'column',
    gap: 3,
    maxWidth: '100%',
  },
  filePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    maxWidth: '100%',
  },
  fileName: {
    fontSize: FontSize.sm,
    flexShrink: 1,
  },
  audioHint: {
    fontSize: FontSize.xs,
    paddingHorizontal: 2,
  },
});
