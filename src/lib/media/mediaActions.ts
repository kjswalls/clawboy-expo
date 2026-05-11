/**
 * Media action sheet — Save / Share / Copy link.
 *
 * Presents a native action sheet for a piece of media the assistant replied
 * with, then carries out the selected action.
 *
 * Security notes (per .cursorrules):
 * - Rule 9: Copy Link strips ?token= before writing to clipboard, and
 *   schedules an automatic clipboard clear after 60 s.
 * - Rule 10: Token is passed in at call-time (never stored at module level)
 *   and is not kept in any module-level var after the call completes.
 * - Tokens only travel in the Authorization header — never in file paths,
 *   share sheets, or clipboard text.
 */

import { ActionSheetIOS, Alert, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import i18n from '@/i18n';
import { sanitizeUrlForDisplay } from './gatewayMedia';
import { downloadToCache } from './downloadMedia';

type ExpoMediaLibraryMod = typeof import('expo-media-library');
type ExpoSharingMod = typeof import('expo-sharing');
let sharingMod: ExpoSharingMod | null = null;

function getSharing(): ExpoSharingMod {
  if (sharingMod) {
    return sharingMod;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sharingMod = require('expo-sharing') as ExpoSharingMod;
  return sharingMod;
}
let mediaLibraryMod: ExpoMediaLibraryMod | null = null;

function getMediaLibrary(): ExpoMediaLibraryMod {
  if (mediaLibraryMod) {
    return mediaLibraryMod;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mediaLibraryMod = require('expo-media-library') as ExpoMediaLibraryMod;
  return mediaLibraryMod;
}

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

export interface MediaActionContext {
  url: string;
  kind: MediaKind;
  fileName?: string;
  mimeType?: string;
  /** Auth token for the active gateway connection. */
  token: string | null | undefined;
}

const CLIPBOARD_CLEAR_DELAY_MS = 60_000;

async function saveToPhotos(
  url: string,
  token: string | null | undefined,
  opts?: { fileName?: string; mimeType?: string },
): Promise<void> {
  let MediaLibrary: ExpoMediaLibraryMod;
  try {
    MediaLibrary = getMediaLibrary();
  } catch {
    Alert.alert(
      i18n.t('chat.media.errors.photoLibraryUnavailableTitle'),
      i18n.t('chat.media.errors.photoLibraryUnavailableBody'),
    );
    return;
  }
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      i18n.t('chat.media.errors.permissionRequiredTitle'),
      i18n.t('chat.media.errors.permissionRequiredBody'),
    );
    return;
  }
  const { localUri } = await downloadToCache(url, token, opts);
  await MediaLibrary.saveToLibraryAsync(localUri);
  Alert.alert(i18n.t('chat.media.errors.savedTitle'), i18n.t('chat.media.errors.savedBody'));
}

async function shareFile(
  url: string,
  token: string | null | undefined,
  opts?: { fileName?: string; mimeType?: string },
): Promise<void> {
  let sharing: ExpoSharingMod;
  try {
    sharing = getSharing();
  } catch {
    Alert.alert(
      i18n.t('chat.media.errors.sharingUnavailableTitle'),
      i18n.t('chat.media.errors.sharingUnavailableRebuildBody'),
    );
    return;
  }
  const { localUri, mimeType } = await downloadToCache(url, token, opts);
  const canShare = await sharing.isAvailableAsync();
  if (!canShare) {
    Alert.alert(
      i18n.t('chat.media.errors.sharingUnavailableTitle'),
      i18n.t('chat.media.errors.sharingUnavailableDeviceBody'),
    );
    return;
  }
  await sharing.shareAsync(localUri, { mimeType: opts?.mimeType ?? mimeType, UTI: undefined });
}

let clipboardClearTimer: ReturnType<typeof setTimeout> | null = null;

function copyLink(url: string): void {
  const safe = sanitizeUrlForDisplay(url);
  void Clipboard.setStringAsync(safe);

  // Clear previous scheduled clear if any.
  if (clipboardClearTimer) {
    clearTimeout(clipboardClearTimer);
  }
  clipboardClearTimer = setTimeout(() => {
    clipboardClearTimer = null;
    void Clipboard.setStringAsync('');
  }, CLIPBOARD_CLEAR_DELAY_MS);
}

function showIOS(ctx: MediaActionContext): void {
  const canSaveToPhotos = ctx.kind === 'image' || ctx.kind === 'video';

  const options: string[] = [i18n.t('chat.media.actionSheet.cancel')];
  if (canSaveToPhotos) options.push(i18n.t('chat.media.actionSheet.saveToPhotos'));
  options.push(i18n.t('chat.media.actionSheet.share'));
  options.push(i18n.t('chat.media.actionSheet.copyLink'));

  ActionSheetIOS.showActionSheetWithOptions(
    {
      options,
      cancelButtonIndex: 0,
      title: ctx.fileName ?? undefined,
    },
    (idx) => {
      let offset = 1;
      if (canSaveToPhotos) {
        if (idx === offset) {
          void saveToPhotos(ctx.url, ctx.token, { fileName: ctx.fileName, mimeType: ctx.mimeType }).catch(
            (e: unknown) => Alert.alert(i18n.t('common.error'), e instanceof Error ? e.message : i18n.t('chat.media.errors.saveFailBody'))
          );
          return;
        }
        offset++;
      }
      if (idx === offset) {
        void shareFile(ctx.url, ctx.token, { fileName: ctx.fileName, mimeType: ctx.mimeType }).catch(
          (e: unknown) => Alert.alert(i18n.t('common.error'), e instanceof Error ? e.message : i18n.t('chat.media.errors.shareFailBody'))
        );
        return;
      }
      if (idx === offset + 1) {
        copyLink(ctx.url);
      }
    },
  );
}

function showAndroid(ctx: MediaActionContext): void {
  const canSaveToPhotos = ctx.kind === 'image' || ctx.kind === 'video';

  const buttons: { text: string; onPress?: () => void }[] = [];

  if (canSaveToPhotos) {
    buttons.push({
      text: i18n.t('chat.media.actionSheet.saveToPhotos'),
      onPress: () => {
        void saveToPhotos(ctx.url, ctx.token, { fileName: ctx.fileName, mimeType: ctx.mimeType }).catch(
          (e: unknown) => Alert.alert(i18n.t('common.error'), e instanceof Error ? e.message : i18n.t('chat.media.errors.saveFailBody'))
        );
      },
    });
  }

  buttons.push({
    text: i18n.t('chat.media.actionSheet.share'),
    onPress: () => {
      void shareFile(ctx.url, ctx.token, { fileName: ctx.fileName, mimeType: ctx.mimeType }).catch(
        (e: unknown) => Alert.alert(i18n.t('common.error'), e instanceof Error ? e.message : i18n.t('chat.media.errors.shareFailBody'))
      );
    },
  });

  buttons.push({
    text: i18n.t('chat.media.actionSheet.copyLink'),
    onPress: () => copyLink(ctx.url),
  });

  buttons.push({ text: i18n.t('chat.media.actionSheet.cancel') });

  Alert.alert(ctx.fileName ?? i18n.t('chat.media.actionSheet.mediaTitle'), undefined, buttons, { cancelable: true });
}

/**
 * Show a native action sheet for a media item, presenting context-appropriate
 * options:
 * - Images / Videos: Save to Photos, Share…, Copy Link
 * - Audio / Files: Share…, Copy Link (on iOS also Save to Files via Share)
 */
export function showMediaActions(ctx: MediaActionContext): void {
  if (Platform.OS === 'ios') {
    showIOS(ctx);
  } else {
    showAndroid(ctx);
  }
}
