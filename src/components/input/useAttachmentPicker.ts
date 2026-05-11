import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useCallback } from 'react';
import type React from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { VIDEO_PICK_MAX_DURATION_SECONDS } from '@/constants/attachmentsGateway';
import { writeClipboardDataImageToCache } from '@/lib/attachments/prepareChatAttachments';
import { persistPastedImageUris } from '@/lib/attachments/persistPastedImages';

import type { InputAttachment } from './types';
import { makeId } from './palette/shared';

interface UseAttachmentPickerOptions {
  setAttachments: (a: InputAttachment[]) => void;
  attachmentsRef: React.MutableRefObject<InputAttachment[]>;
}

export interface UseAttachmentPickerResult {
  pickFromLibrary: () => Promise<void>;
  pickVideoLibrary: () => Promise<void>;
  pickDocument: () => Promise<void>;
  takeVideo: () => Promise<void>;
  takeMedia: () => Promise<void>;
  attachRecentAssets: (assets: MediaLibrary.Asset[]) => Promise<void>;
  pasteImageFromClipboard: () => Promise<void>;
  onCamera: () => Promise<void>;
  removeAttachment: (id: string) => void;
}

export function useAttachmentPicker({
  setAttachments,
  attachmentsRef,
}: UseAttachmentPickerOptions): UseAttachmentPickerResult {
  const { t } = useTranslation();

  const pickFromLibrary = useCallback(async (): Promise<void> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (res.canceled) return;
    const next: InputAttachment[] = res.assets.map((a) => ({
      id: makeId(),
      name: a.fileName ?? 'Image',
      type: 'image' as const,
      uri: a.uri,
      preview: a.uri,
      mimeType: a.mimeType ?? undefined,
      sizeBytes: a.fileSize,
    }));
    setAttachments([...attachmentsRef.current, ...next]);
  }, [setAttachments, attachmentsRef]);

  const pickVideoLibrary = useCallback(async (): Promise<void> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: false,
      videoMaxDuration: VIDEO_PICK_MAX_DURATION_SECONDS,
      quality: 0.8,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    const next: InputAttachment = {
      id: makeId(),
      name: a.fileName ?? 'Video',
      type: 'video',
      uri: a.uri,
      preview: a.uri,
      mimeType: a.mimeType ?? undefined,
      sizeBytes: a.fileSize,
    };
    setAttachments([...attachmentsRef.current, next]);
  }, [setAttachments, attachmentsRef]);

  const pickDocument = useCallback(async (): Promise<void> => {
    const res = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (res.canceled || !res.assets?.length) return;
    const next: InputAttachment[] = res.assets.map((a) => ({
      id: makeId(),
      name: a.name,
      type: 'file' as const,
      uri: a.uri,
      mimeType: a.mimeType,
      sizeBytes: a.size,
    }));
    setAttachments([...attachmentsRef.current, ...next]);
  }, [setAttachments, attachmentsRef]);

  const takeVideo = useCallback(async (): Promise<void> => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: VIDEO_PICK_MAX_DURATION_SECONDS,
      quality: 0.8,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setAttachments([
      ...attachmentsRef.current,
      {
        id: makeId(),
        name: a.fileName ?? 'Video',
        type: 'video',
        uri: a.uri,
        preview: a.uri,
        mimeType: a.mimeType ?? undefined,
        sizeBytes: a.fileSize,
      },
    ]);
  }, [setAttachments, attachmentsRef]);

  const takeMedia = useCallback(async (): Promise<void> => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      videoMaxDuration: VIDEO_PICK_MAX_DURATION_SECONDS,
      quality: 0.85,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    const isVideo = a.type === 'video';
    setAttachments([
      ...attachmentsRef.current,
      {
        id: makeId(),
        name: a.fileName ?? (isVideo ? 'Video' : 'Photo'),
        type: isVideo ? 'video' : 'image',
        uri: a.uri,
        preview: a.uri,
        mimeType: a.mimeType ?? undefined,
        sizeBytes: a.fileSize,
      },
    ]);
  }, [setAttachments, attachmentsRef]);

  const attachRecentAssets = useCallback(async (assets: MediaLibrary.Asset[]): Promise<void> => {
    const next: InputAttachment[] = [];
    for (const asset of assets) {
      try {
        const info = await MediaLibrary.getAssetInfoAsync(asset);
        const uri = info.localUri ?? asset.uri;
        next.push({
          id: makeId(),
          name: asset.filename,
          type: asset.mediaType === MediaLibrary.MediaType.video ? 'video' : 'image',
          uri,
          preview: uri,
        });
      } catch {
        // skip assets that can't be resolved
      }
    }
    if (next.length > 0) {
      setAttachments([...attachmentsRef.current, ...next]);
    }
  }, [setAttachments, attachmentsRef]);

  const pasteImageFromClipboard = useCallback(async (): Promise<void> => {
    const has = await Clipboard.hasImageAsync();
    if (!has) {
      Alert.alert(t('input.clipboard.title'), t('input.clipboard.noImage'));
      return;
    }
    const img = await Clipboard.getImageAsync({ format: 'jpeg', jpegQuality: 0.88 });
    if (!img?.data) {
      Alert.alert(t('input.clipboard.title'), t('input.clipboard.readError'));
      return;
    }
    try {
      const uri = await writeClipboardDataImageToCache(img.data);
      const next: InputAttachment = {
        id: makeId(),
        name: t('input.clipboard.pastedImage'),
        type: 'image',
        uri,
        preview: uri,
        mimeType: 'image/jpeg',
      };
      setAttachments([...attachmentsRef.current, next]);
    } catch {
      Alert.alert(t('input.clipboard.title'), t('input.clipboard.attachError'));
    }
  }, [setAttachments, attachmentsRef, t]);

  const onCamera = useCallback(async (): Promise<void> => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setAttachments([
      ...attachmentsRef.current,
      {
        id: makeId(),
        name: a.fileName ?? 'Photo',
        type: 'image',
        uri: a.uri,
        preview: a.uri,
        mimeType: a.mimeType ?? undefined,
        sizeBytes: a.fileSize,
      },
    ]);
  }, [setAttachments, attachmentsRef]);

  const removeAttachment = useCallback((id: string): void => {
    setAttachments(attachmentsRef.current.filter((a) => a.id !== id));
  }, [setAttachments, attachmentsRef]);

  return {
    pickFromLibrary,
    pickVideoLibrary,
    pickDocument,
    takeVideo,
    takeMedia,
    attachRecentAssets,
    pasteImageFromClipboard,
    onCamera,
    removeAttachment,
  };
}
