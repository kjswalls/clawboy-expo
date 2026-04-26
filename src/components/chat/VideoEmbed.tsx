import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Maximize2, Play } from 'lucide-react-native';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuthedMedia } from '@/hooks/useAuthedMedia';
import { useMediaCacheReplay } from '@/hooks/useMediaCacheReplay';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useConnection } from '@/contexts/ConnectionContext';
import { showMediaActions } from '@/lib/media/mediaActions';
import { downloadToCacheCancellable, MediaSavedFileError, type DownloadHandle } from '@/lib/media/downloadMedia';
import { diagnoseMediaFailure, type MediaFailureReason } from '@/lib/media/diagnoseMediaFailure';
import { resolveMediaUrl } from '@/lib/media/gatewayMedia';
import { deriveFallbackName } from '@/lib/media/deriveFallbackName';
import { MediaFallbackCard } from './MediaFallbackCard';
import * as FileSystem from 'expo-file-system/legacy';

// ── Sizing constants ──────────────────────────────────────────────────────────
const BASE_W = 280;
const MAX_H = 210;
/** Native inline controls need a minimum width; portrait caps otherwise yield ~118pt wide. */
const MIN_INLINE_W = 260;
const FALLBACK_ASPECT = 16 / 9;

type VideoSize = { width: number; height: number };

function computePlayerSize(naturalSize: VideoSize | null): { width: number; height: number } {
  if (!naturalSize || naturalSize.width === 0 || naturalSize.height === 0) {
    return { width: BASE_W, height: BASE_W / FALLBACK_ASPECT };
  }
  const ar = naturalSize.width / naturalSize.height;
  let width = BASE_W;
  let height = BASE_W / ar;
  if (height > MAX_H) {
    height = MAX_H;
    width = MAX_H * ar;
  }
  return { width, height };
}

/** Widen short inline frames so scrubber / transport controls stay usable (video stays `contain`-centered). */
function computeLayoutSize(naturalSize: VideoSize | null): { width: number; height: number } {
  const { width, height } = computePlayerSize(naturalSize);
  return { width: Math.max(width, MIN_INLINE_W), height };
}

// ── expo-video lazy load ──────────────────────────────────────────────────────

type ExpoVideoMod = typeof import('expo-video');
type ExpoVideoState = { kind: 'uninit' } | { kind: 'ok'; mod: ExpoVideoMod } | { kind: 'miss' };

let expoVideoState: ExpoVideoState = { kind: 'uninit' };

function getExpoVideo(): ExpoVideoMod | null {
  if (expoVideoState.kind === 'ok') return expoVideoState.mod;
  if (expoVideoState.kind === 'miss') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-video') as ExpoVideoMod;
    expoVideoState = { kind: 'ok', mod };
    return mod;
  } catch {
    expoVideoState = { kind: 'miss' };
    return null;
  }
}

// ── Download-then-play state machine ─────────────────────────────────────────

type VideoPhase =
  | { phase: 'downloading'; progress: number }
  | { phase: 'ready'; localUri: string }
  | { phase: 'error'; reason: MediaFailureReason | null };

// ── Sub-components ────────────────────────────────────────────────────────────

function VideoLoadingPill({
  progress,
  url,
  align,
  colors,
}: {
  progress: number;
  url: string;
  align: 'left' | 'right';
  colors: ReturnType<typeof useTheme>['colors'];
}): React.JSX.Element {
  const pct = Math.round(progress * 100);
  const name = deriveFallbackName(url);
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: colors.card, borderColor: colors.border },
        align === 'right' ? styles.alignEnd : styles.alignStart,
      ]}
    >
      <ActivityIndicator size="small" color={colors.primary} style={styles.pillSpinner} />
      <Text style={[styles.pillText, { color: colors.mutedForeground }]} numberOfLines={1}>
        {pct > 0 ? `${pct}%` : 'Loading…'}{name ? ` · ${name}` : ''}
      </Text>
    </View>
  );
}

/** Renders the native video player from a local file:// URI. */
const VideoPlayerNative = React.memo(function VideoPlayerNative({
  mod,
  localUri,
  remoteUrl,
  align,
  token,
}: {
  mod: ExpoVideoMod;
  localUri: string;
  remoteUrl: string;
  align: 'left' | 'right';
  token: string | null;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { useVideoPlayer, VideoView } = mod;
  const [loadFailed, setLoadFailed] = useState(false);
  const [failureReason, setFailureReason] = useState<MediaFailureReason | null>(null);
  const [naturalSize, setNaturalSize] = useState<VideoSize | null>(null);
  const videoViewRef = useRef<InstanceType<typeof VideoView>>(null);

  const player = useVideoPlayer({ uri: localUri }, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    const sourceLoadSub = player.addListener('sourceLoad', (payload: any) => {
      const tracks: any[] = payload?.availableVideoTracks ?? [];
      const size = tracks[0]?.size;
      if (size?.width && size?.height) {
        setNaturalSize({ width: size.width, height: size.height });
      }
    });

    const statusSub = player.addListener('statusChange', (status: any) => {
      if (status?.status === 'error' || status?.error) {
        setLoadFailed(true);
        void diagnoseMediaFailure(remoteUrl, token).then(setFailureReason);
        return;
      }
      // Fallback: read size from player.videoTrack once ready
      if (status?.status === 'readyToPlay') {
        const track = (player as any).videoTrack;
        const size = track?.size;
        if (size?.width && size?.height) {
          setNaturalSize((prev) => prev ?? { width: size.width, height: size.height });
        }
      }
    });

    return () => {
      sourceLoadSub.remove();
      statusSub.remove();
    };
  }, [player, remoteUrl, token]);

  if (loadFailed) {
    return (
      <MediaFallbackCard
        kind="video"
        name={deriveFallbackName(remoteUrl)}
        reason={failureReason ?? undefined}
      />
    );
  }

  const { width: layoutW, height: layoutH } = computeLayoutSize(naturalSize);

  return (
    <Pressable
      onLongPress={() => showMediaActions({ url: remoteUrl, kind: 'video', token })}
      style={[
        styles.container,
        { width: layoutW, height: layoutH },
        align === 'right' ? styles.alignEnd : styles.alignStart,
      ]}
    >
      <VideoView
        ref={videoViewRef}
        player={player}
        style={styles.video}
        contentFit="contain"
        allowsPictureInPicture={false}
        fullscreenOptions={{ enable: true }}
        nativeControls
      />
      <Pressable
        onPress={() => void videoViewRef.current?.enterFullscreen()}
        style={[styles.fullscreenHint, { backgroundColor: colors.secondary }]}
        accessibilityLabel="Enter fullscreen"
        accessibilityRole="button"
        hitSlop={8}
      >
        <Maximize2 size={14} color={colors.mutedForeground} />
      </Pressable>
    </Pressable>
  );
});

/** Fallback when expo-video native module is absent from the build. */
function VideoEmbedNoNative({
  url,
  align,
  token,
}: {
  url: string;
  align: 'left' | 'right';
  token: string | null;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable
      onLongPress={() => showMediaActions({ url, kind: 'video', token })}
      accessibilityLabel="Video card; long-press for save or share"
      style={[
        styles.fallback,
        { borderColor: colors.border, backgroundColor: colors.card },
        align === 'right' ? styles.alignEnd : styles.alignStart,
      ]}
    >
      <View style={styles.fallbackRow}>
        <Pressable
          onPress={() => void Linking.openURL(url)}
          accessibilityLabel="Open video in browser"
          accessibilityRole="button"
          hitSlop={6}
        >
          <View style={styles.fallbackIconWrap}>
            <Play size={20} color={colors.foreground} fill={colors.foreground} />
          </View>
        </Pressable>
        <View style={styles.fallbackTextCol}>
          <Text style={[styles.fallbackTitle, { color: colors.foreground }]}>
            Video (native player unavailable)
          </Text>
          <Text style={[styles.fallbackHint, { color: colors.mutedForeground }]} numberOfLines={2}>
            Rebuild the iOS app with expo-video, or open in a browser. Long-press for more actions.
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ── VideoEmbed ────────────────────────────────────────────────────────────────

interface VideoEmbedProps {
  url: string;
  align?: 'left' | 'right';
  /** Active gateway token forwarded from MediaEmbed. VideoEmbed falls back to its
   *  own hook call when not provided. */
  token?: string | null;
}

export const VideoEmbed = React.memo(function VideoEmbed({
  url,
  align = 'left',
  token: tokenProp,
}: VideoEmbedProps): React.JSX.Element | null {
  const { colors } = useTheme();
  const { token: hookToken, gatewayUrl } = useAuthedMedia();
  const [cacheReplay] = useMediaCacheReplay();
  const { activeProfile } = useServerConfig();
  const { connectGeneration } = useConnection();

  const token = tokenProp !== undefined ? tokenProp : hookToken;
  const profileId = activeProfile?.id ?? '_';

  const mod = getExpoVideo();

  const [videoState, setVideoState] = useState<VideoPhase>({
    phase: 'downloading',
    progress: 0,
  });

  const handleRef = useRef<DownloadHandle | null>(null);
  // Track the local URI for ephemeral cleanup on unmount.
  const ephemeralUriRef = useRef<string | null>(null);
  // Stable ref so useEffect doesn't re-run when the function identity changes.
  const urlRef = useRef(url);
  urlRef.current = url;

  useEffect(() => {
    let dead = false;

    setVideoState({ phase: 'downloading', progress: 0 });
    ephemeralUriRef.current = null;

    // Resolve the raw URL through the gateway media pipeline so that local
    // server paths (e.g. /tmp/... or ~/.openclaw/media/...) are normalised to
    // https://<gateway>/__openclaw__/assistant-media?source=… before the
    // download. Direct https:// URLs pass through unchanged.
    const resolved = resolveMediaUrl(url, gatewayUrl ?? undefined);
    if (!resolved) {
      setVideoState({ phase: 'error', reason: null });
      return;
    }
    const resolvedUrl = resolved.url;

    const handle = downloadToCacheCancellable(resolvedUrl, token, {
      profileId,
      ephemeral: !cacheReplay,
      onProgress: (fraction) => {
        if (!dead) setVideoState({ phase: 'downloading', progress: fraction });
      },
    });
    handleRef.current = handle;

    handle.promise
      .then((result) => {
        if (dead) {
          // Unmounted before completion — clean up ephemeral file.
          if (!cacheReplay) {
            void FileSystem.deleteAsync(result.localUri, { idempotent: true }).catch(() => {});
          }
          return;
        }
        if (!cacheReplay) ephemeralUriRef.current = result.localUri;
        setVideoState({ phase: 'ready', localUri: result.localUri });
      })
      .catch((err: unknown) => {
        if (dead) return;
        if (err instanceof Error && err.message === 'Download cancelled.') return;
        // Saved-file validation already classified the failure — use it directly
        // and skip the redundant diagnoseMediaFailure GET probe.
        if (err instanceof MediaSavedFileError) {
          setVideoState({ phase: 'error', reason: err.reason });
          return;
        }
        void diagnoseMediaFailure(resolvedUrl, token).then((reason) => {
          if (!dead) setVideoState({ phase: 'error', reason });
        });
      });

    return () => {
      dead = true;
      handleRef.current?.cancel();
      handleRef.current = null;
      // Delete ephemeral file on unmount.
      if (ephemeralUriRef.current) {
        void FileSystem.deleteAsync(ephemeralUriRef.current, { idempotent: true }).catch(() => {});
        ephemeralUriRef.current = null;
      }
    };
    // Re-run when URL, token, gateway URL, profile, replay pref, or connect
    // generation changes. connectGeneration changing means we disconnected —
    // cancel in-progress downloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, token, gatewayUrl, profileId, cacheReplay, connectGeneration]);

  if (!mod) {
    return <VideoEmbedNoNative url={url} align={align} token={token} />;
  }

  if (videoState.phase === 'downloading') {
    return <VideoLoadingPill progress={videoState.progress} url={url} align={align} colors={colors} />;
  }

  if (videoState.phase === 'error') {
    return (
      <MediaFallbackCard
        kind="video"
        name={deriveFallbackName(url)}
        reason={videoState.reason ?? undefined}
      />
    );
  }

  // videoState.phase === 'ready'
  return (
    <VideoPlayerNative
      mod={mod}
      localUri={videoState.localUri}
      remoteUrl={url}
      align={align}
      token={token}
    />
  );
});

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    maxWidth: '92%',
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    marginVertical: Spacing.xs,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '92%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.full ?? 999,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    marginVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  pillSpinner: {
    flexShrink: 0,
  },
  pillText: {
    fontSize: FontSize.xs,
    flexShrink: 1,
  },
  alignStart: {
    alignSelf: 'flex-start',
  },
  alignEnd: {
    alignSelf: 'flex-end',
  },
  video: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullscreenHint: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    padding: 4,
    borderRadius: 6,
    opacity: 0.8,
    zIndex: 2,
  },
  fallback: {
    width: 280,
    maxWidth: '92%',
    minHeight: 88,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    marginVertical: Spacing.xs,
    padding: Spacing.sm,
  },
  fallbackRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fallbackIconWrap: { opacity: 0.9 },
  fallbackTextCol: { flex: 1, gap: 2 },
  fallbackTitle: { fontSize: FontSize.sm, fontWeight: '600' },
  fallbackHint: { fontSize: FontSize.xs, lineHeight: 16 },
});
