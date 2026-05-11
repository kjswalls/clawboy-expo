import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

const PARTICLE_COUNT = 20;
const DURATION_MS = 700;
const GRAVITY_PX = 30;

export interface ParticleConfig {
  angle: number;
  distance: number;
  startRotDeg: number;
  spinDeg: number;
  color: string;
  size: number;
}

/** Deterministic “random” in [0, 1) from seed (stable across renders for same seed). */
function seeded01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
  return x - Math.floor(x);
}

export function buildParticleConfigs(colors: string[], trigger: number): ParticleConfig[] {
  const out: ParticleConfig[] = [];
  const base = trigger * 7919;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const s = base + i * 127;
    const angle = seeded01(s) * Math.PI * 2;
    const distance = 40 + seeded01(s + 1) * 70;
    const startRotDeg = (seeded01(s + 2) - 0.5) * 180;
    const spinDeg = (seeded01(s + 3) - 0.5) * 1080;
    const color = colors[Math.floor(seeded01(s + 4) * colors.length)] ?? colors[0] ?? '#A855F7';
    const size = 5 + seeded01(s + 5) * 4;
    out.push({ angle, distance, startRotDeg, spinDeg, color, size });
  }
  return out;
}

interface ConfettiParticleProps {
  progress: SharedValue<number>;
  originX: number;
  originY: number;
  config: ParticleConfig;
}

function ConfettiParticle({
  progress,
  originX,
  originY,
  config,
}: ConfettiParticleProps): React.JSX.Element {
  const { angle, distance, startRotDeg, spinDeg, color, size } = config;

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const eased = Easing.out(Easing.cubic)(p);
    const tx = Math.cos(angle) * distance * eased;
    const ty = Math.sin(angle) * distance * eased + GRAVITY_PX * p * p;
    const rot = startRotDeg + spinDeg * p;
    const opacity = interpolate(p, [0, 0.08, 0.72, 1], [0, 1, 1, 0]);
    const scale = interpolate(p, [0, 0.15, 1], [0, 1, 0.7]);
    return {
      opacity,
      transform: [
        { translateX: tx },
        { translateY: ty },
        { rotate: `${rot}deg` },
        { scale },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: originX - size / 2,
          top: originY - size / 2,
          width: size,
          height: size,
          borderRadius: size * 0.25,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

export interface ConfettiBurstProps {
  /** Increment to fire a new burst. */
  trigger: number;
  colors: string[];
  originX: number;
  originY: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Short burst of small rounded squares from a fixed anchor — pointerEvents none.
 */
export function ConfettiBurst({
  trigger,
  colors,
  originX,
  originY,
  style,
}: ConfettiBurstProps): React.JSX.Element {
  const progress = useSharedValue(0);

  const configs = useMemo(
    () => buildParticleConfigs(colors.length > 0 ? colors : ['#A855F7'], trigger),
    [colors, trigger],
  );

  useEffect(() => {
    if (trigger < 1) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: DURATION_MS });
  }, [trigger, progress]);

  return (
    <View style={[styles.layer, style]} pointerEvents="none">
      {configs.map((config, i) => (
        <ConfettiParticle
          key={`${trigger}-${i}`}
          progress={progress}
          originX={originX}
          originY={originY}
          config={config}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'visible',
  },
});
