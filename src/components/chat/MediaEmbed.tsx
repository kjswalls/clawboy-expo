import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
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

import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';

const THUMB = 160;

interface MediaEmbedProps {
  images?: string[];
  audioUrl?: string;
  align: 'left' | 'right';
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

function AudioEmbed({ url }: { url: string }): React.JSX.Element {
  const player = useAudioPlayer(url, { updateInterval: 80 });
  const status = useAudioPlayerStatus(player);
  const prevDidFinishRef = React.useRef(false);

  const bars = useWaveformHeights(30, url.length);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

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

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.audioRow}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.playBtn, pressed && styles.playBtnPressed]}
      >
        {isPlaying ? (
          <Pause size={20} color={Colors.dark.primaryForeground} />
        ) : (
          <Play size={20} color={Colors.dark.primaryForeground} style={{ marginLeft: 2 }} />
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
                  (i / bars.length) * 100 < progress ? Colors.dark.primary : Colors.dark.muted,
              },
            ]}
          />
        ))}
      </View>
      <Text style={styles.timeLabel}>{formatTime(durationSec)}</Text>
    </View>
  );
}

export const MediaEmbed = React.memo(function MediaEmbed({
  images,
  audioUrl,
  align,
}: MediaEmbedProps): React.JSX.Element | null {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { width, height } = useWindowDimensions();

  const hasImages = images && images.length > 0;
  const hasAudio = Boolean(audioUrl);

  if (!hasImages && !hasAudio) {
    return null;
  }

  return (
    <>
      {hasImages ? (
        <View
          style={[
            styles.imageRow,
            align === 'right' ? styles.imageRowEnd : styles.imageRowStart,
          ]}
        >
          {images!.map((src, i) => (
            <Pressable
              key={`${src}-${i}`}
              onPress={() => setExpanded(src)}
              style={({ pressed }) => [styles.thumbWrap, pressed && { opacity: 0.9 }]}
            >
              <Image source={{ uri: src }} style={styles.thumb} contentFit="cover" />
            </Pressable>
          ))}
        </View>
      ) : null}

      {hasAudio && audioUrl ? (
        <View style={styles.audioOuter}>
          <AudioEmbed url={audioUrl} />
        </View>
      ) : null}

      <Modal visible={expanded != null} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setExpanded(null)}>
          <View style={[styles.modalInner, { maxWidth: width - 32, maxHeight: height * 0.8 }]}>
            {expanded ? (
              <Image
                source={{ uri: expanded }}
                style={styles.fullImage}
                contentFit="contain"
              />
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
    borderColor: Colors.dark.border,
    backgroundColor: 'rgba(26, 31, 46, 0.5)',
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary,
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
    color: Colors.dark.mutedForeground,
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
