import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  FileAudio,
  FileVideo,
  File,
  Download,
  Info,
} from 'lucide-react-native';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuthedMedia } from '@/hooks/useAuthedMedia';
import { showMediaActions, type MediaKind } from '@/lib/media/mediaActions';
import type { MessageFile } from '@/lib/openclaw/types';

interface FileAttachmentCardProps {
  file: MessageFile;
  /** When true, a download error shows MediaFallbackCard instead of the normal card. */
  guessedMedia?: boolean;
}

function kindFromMime(mimeType: string | undefined, name: string): MediaKind {
  if (!mimeType && name) {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (/^(mp3|wav|ogg|m4a|aac|opus|flac)$/.test(ext)) return 'audio';
    if (/^(mp4|mov|mkv|avi|flv|wmv|webm)$/.test(ext)) return 'video';
  }
  if (!mimeType) return 'file';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

function FileIcon({
  kind,
  color,
  size = 22,
}: {
  kind: MediaKind;
  color: string;
  size?: number;
}): React.JSX.Element {
  switch (kind) {
    case 'audio':
      return <FileAudio size={size} color={color} />;
    case 'video':
      return <FileVideo size={size} color={color} />;
    case 'image':
      return <FileText size={size} color={color} />;
    default:
      return <File size={size} color={color} />;
  }
}

export const FileAttachmentCard = React.memo(function FileAttachmentCard({
  file,
  guessedMedia,
}: FileAttachmentCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { token } = useAuthedMedia();
  const [loading, setLoading] = React.useState(false);

  const kind = kindFromMime(file.mimeType, file.name);

  const handlePress = () => {
    setLoading(true);
    showMediaActions({
      url: file.url,
      kind,
      fileName: file.name,
      mimeType: file.mimeType,
      token,
    });
    setTimeout(() => setLoading(false), 800);
  };

  const handleLongPress = () => {
    showMediaActions({
      url: file.url,
      kind,
      fileName: file.name,
      mimeType: file.mimeType,
      token,
    });
  };

  const fileName = file.name || 'File';
  const displayName = fileName.length > 36 ? `${fileName.slice(0, 33)}…` : fileName;

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.secondary,
          borderColor: colors.border,
        },
        pressed && styles.cardPressed,
      ]}
      accessibilityLabel={`File: ${fileName}. Tap to share.`}
      accessibilityRole="button"
    >
      <View style={styles.iconWrap}>
        <FileIcon kind={kind} color={colors.primary} />
      </View>
      <View style={styles.textWrap}>
        <Text
          style={[styles.name, { color: colors.foreground }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {displayName}
        </Text>
        {file.mimeType ? (
          <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {file.mimeType}
          </Text>
        ) : null}
      </View>
      <View style={styles.actionWrap}>
        {guessedMedia ? (
          <Pressable
            onPress={() => {
              Alert.alert(
                t('chat.media.loadFailTitle'),
                t('chat.media.loadFailOtherClient'),
                [{ text: t('chat.media.loadFailOk') }],
              );
            }}
            hitSlop={8}
            accessibilityLabel={t('chat.media.whyCantSee')}
            accessibilityRole="button"
          >
            <Info size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : loading ? (
          <ActivityIndicator size="small" color={colors.mutedForeground} />
        ) : (
          <Download size={18} color={colors.mutedForeground} />
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    maxWidth: '92%',
    marginVertical: Spacing.xs,
  },
  cardPressed: {
    opacity: 0.75,
  },
  iconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  meta: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  actionWrap: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
