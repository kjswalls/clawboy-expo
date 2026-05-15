/**
 * BrandField — tiled field of 3×3 brand-loader grids that fills its container.
 *
 * Renders via @shopify/react-native-skia: each cell clips a shared rotating
 * linear gradient; Reanimated SharedValues drive opacity (sparse blink) and
 * rotation. Used on onboarding and About backdrops.
 *
 * **GPU note:** Each frame draws up to `tileCount × 9` full-diagonal gradient
 * fills (each clipped to one cell). That is intentional for visual parity with
 * the old MaskedView approach; if profiling shows GPU pressure, consider a
 * single offscreen gradient + mask shader or fewer draw passes.
 *
 * Reduced motion: rotation and blink scheduler off; cells use REST_OPACITY.
 */

import { Canvas } from '@shopify/react-native-skia';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  cancelAnimation,
  Easing,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import type { ThemeColors } from '@/types';
import {
  computeBrandFieldGrid,
} from './brandFieldLayout';
import { BrandFieldSkiaTile } from './BrandFieldSkiaTile';
import { pickDistinctInRange } from './brandLoaderPick';
import {
  BASE_OPACITY,
  BURST_PROB,
  DECAY_MS,
  FLASH_PROB,
  LIT_OPACITY,
  RAMP_UP_MS,
  ROTATE_DURATION,
  TICK_MS,
} from './BrandLoader';

/** Matches prior RN pool cap (8×8 tiles). */
const MAX_TILES = 64;

interface BrandFieldProps {
  /** Override theme colors (useful before ThemeContext mounts). */
  palette?: ThemeColors;
  /** Opacity multiplier for the overall field (default 1). */
  fieldOpacity?: number;
  /**
   * Seed layout size so Skia can mount before the first `onLayout`.
   * Should match the parent’s intended width/height; `onLayout` still wins.
   */
  initialSize?: { width: number; height: number };
}

function sizeFromInitial(
  initialSize: BrandFieldProps['initialSize'],
): { w: number; h: number } | null {
  if (
    initialSize == null ||
    initialSize.width <= 0 ||
    initialSize.height <= 0
  ) {
    return null;
  }
  return { w: initialSize.width, h: initialSize.height };
}

export function BrandField({
  palette,
  fieldOpacity = 1,
  initialSize,
}: BrandFieldProps): React.JSX.Element {
  const { colors: themeColors } = useTheme();
  const reducedMotion = useReducedMotion() ?? false;
  const colors = palette ?? themeColors;

  const [dims, setDims] = useState<{ w: number; h: number } | null>(() =>
    sizeFromInitial(initialSize),
  );

  const iw = initialSize?.width ?? 0;
  const ih = initialSize?.height ?? 0;
  useEffect(() => {
    const next = sizeFromInitial(
      iw > 0 && ih > 0 ? { width: iw, height: ih } : undefined,
    );
    if (next == null) return;
    setDims((prev) =>
      prev != null && prev.w === next.w && prev.h === next.h ? prev : next,
    );
  }, [iw, ih]);

  const rotation = useSharedValue(0);

  const tileOpacitiesRef = useRef<Array<SharedValue<number>[] | undefined>>(
    Array.from({ length: MAX_TILES }, () => undefined),
  );

  const registerOpacities = useCallback((tileIdx: number, opacities: SharedValue<number>[]) => {
    tileOpacitiesRef.current[tileIdx] = opacities;
  }, []);

  const unregisterOpacities = useCallback((tileIdx: number) => {
    tileOpacitiesRef.current[tileIdx] = undefined;
  }, []);

  const grid = dims
    ? computeBrandFieldGrid(dims.w, dims.h)
    : { cols: 0, rows: 0, tileCount: 0, originX: 0, originY: 0 };
  const { cols, tileCount, originX, originY } = grid;

  const fieldW = dims?.w ?? 400;
  const fieldH = dims?.h ?? 500;
  const diagSize = Math.ceil(Math.sqrt(fieldW * fieldW + fieldH * fieldH));
  const gradTop = (fieldH - diagSize) / 2;
  const gradLeft = (fieldW - diagSize) / 2;

  const gradientColors = useMemo(
    (): string[] => [
      String(colors.primary),
      String(colors.accentViolet),
      String(colors.accentIndigo),
      String(colors.accentBlue),
      String(colors.primary),
    ],
    [
      colors.accentBlue,
      colors.accentIndigo,
      colors.accentViolet,
      colors.primary,
    ],
  );

  const tileCountRef = useRef(tileCount);
  tileCountRef.current = tileCount;

  const introPlayedRef = useRef(false);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(rotation);
      rotation.value = 0;
      return;
    }
    rotation.value = 0;
    rotation.value = withRepeat(
      withTiming(2 * Math.PI, { duration: ROTATE_DURATION, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(rotation);
    };
  }, [reducedMotion, rotation]);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }

    const runRandomBlinkTick = (): void => {
      const count = tileCountRef.current;
      if (count === 0) return;
      if (Math.random() > FLASH_PROB) return;

      const numFlashes = Math.random() < BURST_PROB ? 2 : 1;
      for (let i = 0; i < numFlashes; i++) {
        const tileIdx = Math.floor(Math.random() * count);
        const cellIdx = Math.floor(Math.random() * 9);
        const arr = tileOpacitiesRef.current[tileIdx];
        const sv = arr?.[cellIdx];
        if (sv === undefined) continue;
        sv.value = withSequence(
          withTiming(LIT_OPACITY, { duration: RAMP_UP_MS, easing: Easing.out(Easing.quad) }),
          withTiming(BASE_OPACITY, { duration: DECAY_MS, easing: Easing.in(Easing.quad) }),
        );
      }
    };

    const count = tileCountRef.current;
    if (count > 0 && !introPlayedRef.current) {
      introPlayedRef.current = true;
      const totalCells = count * 9;
      pickDistinctInRange(3, totalCells).forEach((flatIdx, order) => {
        const tileIdx = Math.floor(flatIdx / 9);
        const cellIdx = flatIdx % 9;
        const sv = tileOpacitiesRef.current[tileIdx]?.[cellIdx];
        if (sv === undefined) return;
        sv.value = withDelay(
          order * 90,
          withSequence(
            withTiming(LIT_OPACITY, { duration: RAMP_UP_MS, easing: Easing.out(Easing.quad) }),
            withTiming(BASE_OPACITY, { duration: DECAY_MS, easing: Easing.in(Easing.quad) }),
          ),
        );
      });
    }

    runRandomBlinkTick();
    const intervalId = setInterval(runRandomBlinkTick, TICK_MS);
    return () => {
      clearInterval(intervalId);
    };
  }, [reducedMotion, tileCount]);

  return (
    <View
      style={[styles.container, { opacity: fieldOpacity }]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width <= 0 || height <= 0) return;
        setDims((prev) => {
          if (prev != null && prev.w === width && prev.h === height) {
            return prev;
          }
          return { w: width, h: height };
        });
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {dims != null && tileCount > 0 ? (
        <Canvas
          style={StyleSheet.absoluteFill}
          opaque={false}
          androidWarmup={Platform.OS === 'android'}
        >
          {Array.from({ length: tileCount }, (_, tileIndex) => (
            <BrandFieldSkiaTile
              key={tileIndex}
              tileIndex={tileIndex}
              cols={cols}
              originX={originX}
              originY={originY}
              fieldW={fieldW}
              fieldH={fieldH}
              gradLeft={gradLeft}
              gradTop={gradTop}
              diagSize={diagSize}
              gradientColors={gradientColors}
              rotation={rotation}
              reducedMotion={reducedMotion}
              registerOpacities={registerOpacities}
              unregisterOpacities={unregisterOpacities}
            />
          ))}
        </Canvas>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
