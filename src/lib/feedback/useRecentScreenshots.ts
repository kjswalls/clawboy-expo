/**
 * Fetches recent screenshots from the device's media library.
 *
 * iOS: uses the `mediaSubtypes: ['screenshot']` filter on the photo media type.
 * Android: queries the "Screenshots" album; falls back to recent photos if the
 * album doesn't exist (some manufacturers name it differently or don't create it).
 */
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

export interface RecentScreenshotsState {
  assets: MediaLibrary.Asset[];
  status: MediaLibrary.PermissionStatus | null;
  requestPermission: () => Promise<void>;
}

export function useRecentScreenshots(limit = 12): RecentScreenshotsState {
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [status, setStatus] = useState<MediaLibrary.PermissionStatus | null>(null);

  const fetchAssets = useCallback(async (): Promise<void> => {
    if (Platform.OS === 'ios') {
      const result = await MediaLibrary.getAssetsAsync({
        first: limit,
        mediaType: [MediaLibrary.MediaType.photo],
        // iOS-only: narrows results to screenshots only
        mediaSubtypes: ['screenshot'],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      setAssets(result.assets);
    } else {
      // Android: try the "Screenshots" album first
      const album = await MediaLibrary.getAlbumAsync('Screenshots');
      if (album) {
        const result = await MediaLibrary.getAssetsAsync({
          first: limit,
          mediaType: [MediaLibrary.MediaType.photo],
          album,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });
        setAssets(result.assets);
      } else {
        // Fallback to recent photos (manufacturer may use a different album name)
        const result = await MediaLibrary.getAssetsAsync({
          first: limit,
          mediaType: [MediaLibrary.MediaType.photo],
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });
        setAssets(result.assets);
      }
    }
  }, [limit]);

  const load = useCallback(async (): Promise<void> => {
    const perm = await MediaLibrary.getPermissionsAsync();
    setStatus(perm.status);
    if (perm.granted) {
      await fetchAssets();
    }
  }, [fetchAssets]);

  const requestPermission = useCallback(async (): Promise<void> => {
    const perm = await MediaLibrary.requestPermissionsAsync();
    setStatus(perm.status);
    if (perm.granted) {
      await fetchAssets();
    } else if (perm.status === MediaLibrary.PermissionStatus.DENIED) {
      await Linking.openSettings();
    }
  }, [fetchAssets]);

  useEffect(() => {
    void load();
  }, [load]);

  return { assets, status, requestPermission };
}
