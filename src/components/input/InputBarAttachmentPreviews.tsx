import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FileText, Image as ImageIcon, X } from 'lucide-react-native';

import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

import type { InputAttachment } from './types';

interface InputBarAttachmentPreviewsProps {
  attachments: InputAttachment[];
  onRemoveAttachment: (id: string) => void;
}

export function InputBarAttachmentPreviews({
  attachments,
  onRemoveAttachment,
}: InputBarAttachmentPreviewsProps): React.JSX.Element | null {
  const { colors } = useThemeContext();
  const images = attachments.filter((a) => a.type === 'image');
  const files = attachments.filter((a) => a.type === 'file');

  if (images.length === 0 && files.length === 0) {
    return null;
  }

  return (
    <>
      {images.length > 0 ? (
        <View style={styles.attachRow}>
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
              >
                <X size={12} color={colors.background} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {files.length > 0 ? (
        <View style={styles.fileRow}>
          {files.map((attachment) => (
            <View
              key={attachment.id}
              style={[styles.filePill, { borderColor: colors.border, backgroundColor: colors.muted }]}
            >
              <FileText size={16} color={colors.accentBlue} />
              <Text style={[styles.fileName, { color: colors.foreground }]} numberOfLines={1}>
                {attachment.name}
              </Text>
              <Pressable onPress={() => onRemoveAttachment(attachment.id)} hitSlop={6}>
                <X size={14} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
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
    paddingTop: Spacing.md,
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
  fileRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
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
});
