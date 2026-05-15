/**
 * One BrandField tile (3×3 cells) drawn in Skia — each cell clips the shared
 * rotating gradient and exposes Reanimated SharedValues for blink opacity.
 *
 * Clip `SkRRect`s and the shared rotation `DerivedValue` are memoized so
 * theme-only parent re-renders do not rebuild clip geometry every frame.
 */

import { Group, LinearGradient, Rect, rrect, rect, vec } from '@shopify/react-native-skia';
import React, { useEffect, useLayoutEffect, useMemo } from 'react';
import type { DerivedValue, SharedValue } from 'react-native-reanimated';
import {
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import {
  BRAND_FIELD_TILE_GAP,
  NINE_CELL_LAYOUTS,
} from './brandFieldLayout';
import { BASE_OPACITY, L_SIZE, REST_OPACITY } from './BrandLoader';

const NINE = NINE_CELL_LAYOUTS;

/** Five theme stops along the diagonal gradient (matches BrandField color list). */
const LINEAR_GRADIENT_POSITIONS = [0, 0.25, 0.5, 0.75, 1] as const;

type CellClipR = ReturnType<typeof rrect>;

export type BrandFieldSkiaTileProps = {
  tileIndex: number;
  cols: number;
  originX: number;
  originY: number;
  fieldW: number;
  fieldH: number;
  gradLeft: number;
  gradTop: number;
  diagSize: number;
  gradientColors: string[];
  rotation: SharedValue<number>;
  reducedMotion: boolean;
  registerOpacities: (tileIdx: number, opacities: SharedValue<number>[]) => void;
  unregisterOpacities: (tileIdx: number) => void;
};

function CellWindow({
  clipR,
  rotationTransform,
  origin,
  gradLeft,
  gradTop,
  diagSize,
  gradientColors,
  opacity,
}: {
  clipR: CellClipR;
  rotationTransform: DerivedValue<{ rotate: number }[]>;
  origin: { x: number; y: number };
  gradLeft: number;
  gradTop: number;
  diagSize: number;
  gradientColors: string[];
  opacity: SharedValue<number>;
}): React.JSX.Element {
  return (
    <Group clip={clipR} opacity={opacity}>
      <Group origin={vec(origin.x, origin.y)} transform={rotationTransform}>
        <Rect x={gradLeft} y={gradTop} width={diagSize} height={diagSize}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(diagSize, diagSize)}
            colors={gradientColors}
            positions={[...LINEAR_GRADIENT_POSITIONS]}
          />
        </Rect>
      </Group>
    </Group>
  );
}

export function BrandFieldSkiaTile({
  tileIndex,
  cols,
  originX,
  originY,
  fieldW,
  fieldH,
  gradLeft,
  gradTop,
  diagSize,
  gradientColors,
  rotation,
  reducedMotion,
  registerOpacities,
  unregisterOpacities,
}: BrandFieldSkiaTileProps): React.JSX.Element {
  const o0 = useSharedValue(BASE_OPACITY);
  const o1 = useSharedValue(BASE_OPACITY);
  const o2 = useSharedValue(BASE_OPACITY);
  const o3 = useSharedValue(BASE_OPACITY);
  const o4 = useSharedValue(BASE_OPACITY);
  const o5 = useSharedValue(BASE_OPACITY);
  const o6 = useSharedValue(BASE_OPACITY);
  const o7 = useSharedValue(BASE_OPACITY);
  const o8 = useSharedValue(BASE_OPACITY);

  /** Stable pool reference for parent `setInterval` blink scheduler. */
  const opacities = useMemo(
    () => [o0, o1, o2, o3, o4, o5, o6, o7, o8],
    [o0, o1, o2, o3, o4, o5, o6, o7, o8],
  );

  const baseX = originX + (tileIndex % cols) * (L_SIZE + BRAND_FIELD_TILE_GAP);
  const baseY = originY + Math.floor(tileIndex / cols) * (L_SIZE + BRAND_FIELD_TILE_GAP);

  const origin = useMemo(() => ({ x: fieldW / 2, y: fieldH / 2 }), [fieldW, fieldH]);

  const cellClipRs = useMemo(
    (): CellClipR[] =>
      NINE.map((layout) =>
        rrect(
          rect(baseX + layout.x, baseY + layout.y, layout.width, layout.height),
          layout.rx,
          layout.rx,
        ),
      ),
    [baseX, baseY],
  );

  const rotationTransform = useDerivedValue(() => [{ rotate: rotation.value }]);

  useLayoutEffect(() => {
    registerOpacities(tileIndex, opacities);
    return () => {
      unregisterOpacities(tileIndex);
    };
  }, [tileIndex, opacities, registerOpacities, unregisterOpacities]);

  useEffect(() => {
    const v = reducedMotion ? REST_OPACITY : BASE_OPACITY;
    for (const s of opacities) {
      s.value = v;
    }
  }, [reducedMotion, opacities]);

  return (
    <Group>
      {cellClipRs.map((clipR, cellIdx) => (
        <CellWindow
          key={cellIdx}
          clipR={clipR}
          rotationTransform={rotationTransform}
          origin={origin}
          gradLeft={gradLeft}
          gradTop={gradTop}
          diagSize={diagSize}
          gradientColors={gradientColors}
          opacity={opacities[cellIdx]!}
        />
      ))}
    </Group>
  );
}
