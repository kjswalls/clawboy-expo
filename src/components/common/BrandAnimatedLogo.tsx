import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

const BRAND_ANIMATED_SOURCE = require('../../../assets/brand/cowgirlAnimated.mp4');

export type BrandAnimatedLogoProps = {
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  /** Pause when hidden (e.g. full-screen modal closed — avoids decoding off-screen). */
  paused?: boolean;
};

export function BrandAnimatedLogo({
  style,
  accessibilityLabel,
  paused = false,
}: BrandAnimatedLogoProps): React.JSX.Element {
  const player = useVideoPlayer(BRAND_ANIMATED_SOURCE, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (paused) {
      player.pause();
    } else {
      player.play();
    }
  }, [paused, player]);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.clip, style]}
    >
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit="contain"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
