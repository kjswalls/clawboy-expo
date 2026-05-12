import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useEvent } from 'expo';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Pause, Play } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuthedMedia } from '@/hooks/useAuthedMedia';
import { type AuthedSource } from '@/lib/media/gatewayMedia';
import { showMediaActions } from '@/lib/media/mediaActions';
import {
  diagnoseMediaFailureDetailed,
  type MediaDiagnosis,
} from '@/lib/media/diagnoseMediaFailure';
import { deriveFallbackName } from '@/lib/media/deriveFallbackName';
import { MediaFallbackCard } from './MediaFallbackCard';
import { VideoEmbed } from './VideoEmbed';

export { deriveFallbackName };

const THUMB = 160;
/** How long to wait for expo-audio to report `isLoaded` before showing a fallback. */
const AUDIO_LOAD_TIMEOUT_MS = 5000;

interface MediaEmbedProps {
  images?: string[];
  audioUrl?: string;
  videoUrl?: string;
  align: 'left' | 'right';
  /** When true, images and video will show a MediaFallbackCard on load error. */
  guessedMedia?: boolean;
}

function useWaveformHeights(count: number, seed: number): number[] {
  return useMemo(() => {
    const out: number[] = [];
    let s = seed;
    for (let i = 0; i < count; i++) {
      s = (s * 9301 + 49297) % 233280;
      const r = s / 233280;
      out.push(20 + Math.sin(i * 0.5) * 15 + r * 10);
    }
    return out;
  }, [count, seed]);
}

/**
 * Audio player card.
 *
 * Resolves the raw `url` through `useAuthedMedia` so local gateway paths
 * (e.g. `/tmp/...` or `~/.openclaw/media/...`) are normalised to a full
 * `https://<gateway>/__openclaw__/assistant-media?source=…` URL before being
 * handed to expo-audio. Without this, the native player receives a bare path
 * and never loads, leaving duration at 0:00 with a silent play button.
 *
 * If the URL cannot be resolved, or if the player fails to reach `isLoaded`
 * within AUDIO_LOAD_TIMEOUT_MS, a `MediaFallbackCard` is rendered instead.
 */
function AudioEmbed({ url }: { url: string }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { resolveAuthedSource, token } = useAuthedMedia();

  // Resolve the raw URL through the gateway media pipeline (same as images).
  const resolvedSource: AuthedSource | null = useMemo(
    () => resolveAuthedSource(url),
    // resolveAuthedSource is stable per [gatewayUrl, gatewayToken] via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, resolveAuthedSource],
  );

  // Imperative player avoids hook exports that can fail on some Hermes builds;
  // mirrors useAudioPlayer + useAudioPlayerStatus (createAudioPlayer + useEvent).
  const player = useMemo(
    () => createAudioPlayer(null, { updateInterval: 80 }),
    [],
  );

  useEffect(() => {
    if (resolvedSource === null) {
      player.replace(null);
      return;
    }
    player.replace(resolvedSource);
  }, [resolvedSource, player]);

  useEffect(() => {
    return () => {
      player.remove();
    };
  }, [player]);

  const initialStatus = useMemo(() => player.currentStatus, [player.id]);
  const status = useEvent(player, 'playbackStatusUpdate', initialStatus);
  const prevDidFinishRef = React.useRef(false);

  const bars = useWaveformHeights(30, url.length);

  const [loadFailed, setLoadFailed] = useState(false);
  const [diagnosis, setDiagnosis] = useState<MediaDiagnosis | undefined>();

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  // Load-failure detection: if isLoaded is still false after AUDIO_LOAD_TIMEOUT_MS
  // (or immediately when the URL is unresolvable), run a diagnostic and show a
  // MediaFallbackCard instead of the permanently-broken player UI.
  useEffect(() => {
    if (status.isLoaded) return;

    if (resolvedSource === null) {
      // Unresolvable URL — fail immediately with no network probe.
      setLoadFailed(true);
      return;
    }

    const timer = setTimeout(() => {
      if (!status.isLoaded) {
        setLoadFailed(true);
        void diagnoseMediaFailureDetailed(resolvedSource.uri, token).then(setDiagnosis);
      }
    }, AUDIO_LOAD_TIMEOUT_MS);

    return () => clearTimeout(timer);
  // Re-run if the resolved source changes (e.g. profile switch), but NOT on
  // every status tick — the status.isLoaded guard at the top handles that.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedSource, token]);

  useEffect(() => {
    if (status.didJustFinish && !prevDidFinishRef.current) {
      void player.seekTo(0);
    }
    prevDidFinishRef.current = status.didJustFinish;
  }, [status.didJustFinish, player]);

  const ready = status.isLoaded;
  const isPlaying = status.playing;
  const durationSec = status.duration > 0 ? status.duration : 0;
  const progress =
    status.duration > 0 ? (status.currentTime / status.duration) * 100 : 0;

  const toggle = useCallback(() => {
    if (!ready) {
      return;
    }
    if (isPlaying) {
      player.pause();
      return;
    }
    const atEnd =
      status.duration > 0 && status.currentTime >= status.duration - 0.05;
    if (atEnd) {
      void player.seekTo(0).then(() => {
        player.play();
      });
      return;
    }
    player.play();
  }, [isPlaying, player, ready, status.currentTime, status.duration]);

  const handleLongPress = useCallback(() => {
    showMediaActions({ url, kind: 'audio', token });
  }, [url, token]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loadFailed) {
    return (
      <MediaFallbackCard
        kind="audio"
        name={deriveFallbackName(url)}
        diagnosis={diagnosis}
        reason={diagnosis?.reason}
      />
    );
  }

  return (
    <Pressable
      onLongPress={handleLongPress}
      accessibilityRole="none"
      accessibilityHint={t('chat.media.audio.longPressHint')}
    >
      <View style={[styles.audioRow, { borderColor: colors.border }]}>
        <Pressable
          onPress={toggle}
          style={({ pressed }) => [styles.playBtn, { backgroundColor: colors.accent }, pressed && styles.playBtnPressed]}
          accessibilityLabel={isPlaying ? t('chat.media.audio.pause') : t('chat.media.audio.play')}
          accessibilityRole="button"
        >
          {isPlaying ? (
            <Pause size={20} color={colors.accentForeground} />
          ) : (
            <Play size={20} color={colors.accentForeground} style={{ marginLeft: 2 }} />
          )}
        </Pressable>
        <View style={styles.waveWrap}>
          {bars.map((height, i) => (
            <View
              key={i}
              style={[
                styles.waveBar,
                {
                  height: `${height}%`,
                  backgroundColor:
                    (i / bars.length) * 100 < progress ? colors.primary : colors.muted,
                },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.timeLabel, { color: colors.mutedForeground }]}>{formatTime(durationSec)}</Text>
      </View>
    </Pressable>
  );
}

export const MediaEmbed = React.memo(function MediaEmbed({
  images,
  audioUrl,
  videoUrl,
  align,
}: MediaEmbedProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [failedSrcs, setFailedSrcs] = useState<Set<string>>(new Set());
  const [failedDiagnoses, setFailedDiagnoses] = useState<Map<string, MediaDiagnosis>>(new Map());
  const { width, height } = useWindowDimensions();
  const { token, resolveAuthedSource } = useAuthedMedia();

  // Memoize the authed source map so expo-image receives the same { uri, headers }
  // object identity across re-renders, preventing spurious re-fetches.
  const authedSources = useMemo((): Map<string, AuthedSource | null> => {
    const map = new Map<string, AuthedSource | null>();
    for (const src of images ?? []) {
      map.set(src, resolveAuthedSource(src));
    }
    if (expanded) {
      map.set(expanded, resolveAuthedSource(expanded));
    }
    return map;
  // resolveAuthedSource is stable per [gatewayUrl, gatewayToken] via useCallback
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, expanded, resolveAuthedSource]);

  const hasImages = images && images.length > 0;
  const hasAudio = Boolean(audioUrl);
  const hasVideo = Boolean(videoUrl);

  if (!hasImages && !hasAudio && !hasVideo) {
    return null;
  }

  const handleImageError = (src: string): void => {
    setFailedSrcs((prev) => new Set([...prev, src]));
    void diagnoseMediaFailureDetailed(src, token).then((d) => {
      setFailedDiagnoses((prev) => {
        const next = new Map(prev);
        next.set(src, d);
        return next;
      });
    });
  };

  return (
    <>
      {hasImages ? (
        <View
          style={[
            styles.imageRow,
            align === 'right' ? styles.imageRowEnd : styles.imageRowStart,
          ]}
        >
          {images!.map((src, i) => {
            if (failedSrcs.has(src)) {
              const d = failedDiagnoses.get(src);
              return (
                <MediaFallbackCard
                  key={`${src}-${i}`}
                  kind="image"
                  name={deriveFallbackName(src)}
                  diagnosis={d}
                  reason={d?.reason}
                />
              );
            }
            const authedSrc = authedSources.get(src);
            return (
              <Pressable
                key={`${src}-${i}`}
                onPress={() => setExpanded(src)}
                onLongPress={() =>
                  showMediaActions({ url: src, kind: 'image', token })
                }
                style={({ pressed }) => [styles.thumbWrap, pressed && { opacity: 0.9 }]}
                accessibilityLabel={deriveFallbackName(src)}
                accessibilityRole="imagebutton"
                accessibilityHint="Tap to expand. Long-press for save or share."
              >
                <Image
                  source={authedSrc ?? { uri: src }}
                  style={styles.thumb}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  onError={() => handleImageError(src)}
                />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {hasAudio && audioUrl ? (
        <View style={styles.audioOuter}>
          <AudioEmbed url={audioUrl} />
        </View>
      ) : null}

      {hasVideo && videoUrl ? (
        <VideoEmbed url={videoUrl} align={align} token={token} />
      ) : null}

      <Modal visible={expanded != null} transparent animationType="fade" accessibilityViewIsModal={true}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setExpanded(null)}
          onLongPress={() => {
            if (expanded) {
              showMediaActions({ url: expanded, kind: 'image', token });
            }
          }}
          accessibilityLabel={t('common.close')}
          accessibilityRole="button"
        >
          <View style={[styles.modalInner, { maxWidth: width - 32, maxHeight: height * 0.8 }]}>
            {expanded ? (
              (() => {
                const authedSrc = authedSources.get(expanded);
                return (
                  <Image
                    source={authedSrc ?? { uri: expanded }}
                    style={styles.fullImage}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                  />
                );
              })()
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </>
  );
});

const styles = StyleSheet.create({
  imageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    maxWidth: '92%',
  },
  imageRowStart: {
    justifyContent: 'flex-start',
  },
  imageRowEnd: {
    justifyContent: 'flex-end',
  },
  thumbWrap: {
    width: THUMB,
    height: THUMB,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  audioOuter: {
    maxWidth: '92%',
    width: '100%',
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    backgroundColor: 'rgba(26, 31, 46, 0.5)',
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnPressed: {
    opacity: 0.9,
  },
  waveWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 40,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
  },
  timeLabel: {
    fontSize: FontSize.xs,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    minWidth: 40,
    textAlign: 'right',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 18, 25, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalInner: {
    width: '100%',
    flex: 1,
    justifyContent: 'center',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
});
