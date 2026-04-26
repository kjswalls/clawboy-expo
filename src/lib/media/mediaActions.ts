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
      'Photo library unavailable',
      'This build does not include the photo library module. Rebuild the iOS app (e.g. npx expo prebuild and npx expo run:ios) so media can be saved to Photos.',
    );
    return;
  }
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission required', 'Allow ClawBoy access to your photo library to save media.');
    return;
  }
  const { localUri } = await downloadToCache(url, token, opts);
  await MediaLibrary.saveToLibraryAsync(localUri);
  Alert.alert('Saved', 'File saved to your photo library.');
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
      'Sharing unavailable',
      'This build does not include the system sharing module. Rebuild the iOS app (e.g. npx expo prebuild and npx expo run:ios) to enable Share.',
    );
    return;
  }
  const { localUri, mimeType } = await downloadToCache(url, token, opts);
  const canShare = await sharing.isAvailableAsync();
  if (!canShare) {
    Alert.alert('Sharing unavailable', 'Your device does not support file sharing.');
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

  const options: string[] = ['Cancel'];
  if (canSaveToPhotos) options.push('Save to Photos');
  options.push('Share…');
  options.push('Copy Link');

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
            (e: unknown) => Alert.alert('Error', e instanceof Error ? e.message : 'Could not save file.')
          );
          return;
        }
        offset++;
      }
      if (idx === offset) {
        void shareFile(ctx.url, ctx.token, { fileName: ctx.fileName, mimeType: ctx.mimeType }).catch(
          (e: unknown) => Alert.alert('Error', e instanceof Error ? e.message : 'Could not share file.')
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
      text: 'Save to Photos',
      onPress: () => {
        void saveToPhotos(ctx.url, ctx.token, { fileName: ctx.fileName, mimeType: ctx.mimeType }).catch(
          (e: unknown) => Alert.alert('Error', e instanceof Error ? e.message : 'Could not save file.')
        );
      },
    });
  }

  buttons.push({
    text: 'Share…',
    onPress: () => {
      void shareFile(ctx.url, ctx.token, { fileName: ctx.fileName, mimeType: ctx.mimeType }).catch(
        (e: unknown) => Alert.alert('Error', e instanceof Error ? e.message : 'Could not share file.')
      );
    },
  });

  buttons.push({
    text: 'Copy Link',
    onPress: () => copyLink(ctx.url),
  });

  buttons.push({ text: 'Cancel' });

  Alert.alert(ctx.fileName ?? 'Media', undefined, buttons, { cancelable: true });
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
