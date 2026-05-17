/**
 * BrandLoader — Cursor-style 3×3 grid loading indicator.
 *
 * variant="large"  Full-screen: 3×3 grid of rounded squares, each a window
 *                  onto a slowly rotating rainbow gradient. Cells blink
 *                  independently at random — sparse, ~1-3 lit at a time —
 *                  like a data array transmitting.
 * variant="small"  Inline: same grid at 28×28pt, same random-blink behavior.
 *
 * Animation model:
 *   A setInterval fires every TICK_MS. With probability FLASH_PROB it picks
 *   1 cell (or 2 with probability BURST_PROB) at random and runs a
 *   withSequence: quick ramp to LIT_OPACITY, slow decay back to BASE_OPACITY.
 *   Each cell's opacity is a separate SharedValue that drives its slot in
 *   the MaskedView mask. The rotating rainbow gradient behind the mask is
 *   unchanged — flashing reveals the glow.
 *
 * Gradient colors mirror InputRainbowGlow:
 *   primary → accentViolet → accentIndigo → accentBlue → primary
 *
 * Theming: reads from useTheme() by default. Pass `palette` to bypass the
 * ThemeContext (e.g. at cold-start before the context tree is mounted).
 *
 * Reduced Motion: interval and rotation both disabled; cells render at
 * REST_OPACITY so the static logo is legible.
 *
 * Note on animation APIs: gradient rotation uses react-native Animated (not
 * Reanimated) because transforms inside MaskedView content fail to repaint
 * correctly with Reanimated on iOS. Cell opacity (mask element side) is safe
 * with Reanimated since it is opacity-only, not a transform.
 */

import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import {
  Animated as RNAnimated,
  Easing as RNEasing,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { FontSize } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import {
  GRID_ROWS,
  L_CELL,
  L_CENTER,
  L_GAP,
  L_GRAD,
  L_GRAD_OFFSET,
  L_PADDING,
  L_SIZE,
} from './brandLoaderGridConstants';
import { pickDistinct } from './brandLoaderPick';

export { GRID_ROWS, L_CELL, L_CENTER, L_GAP, L_GRAD, L_GRAD_OFFSET, L_PADDING, L_SIZE };
export { pickDistinct, pickDistinctInRange } from './brandLoaderPick';

function themeGradientColors(theme: ThemeColors): readonly [ColorValue, ColorValue, ...ColorValue[]] {
  return [
    theme.primary,
    theme.accentViolet,
    theme.accentIndigo,
    theme.accentBlue,
    theme.primary,
  ] as readonly [ColorValue, ColorValue, ...ColorValue[]];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandLoaderProps {
  variant?: 'large' | 'small' | 'mini' | 'backdrop';
  /** Override theme colors — use at cold-start before ThemeContext mounts. */
  palette?: ThemeColors;
  /** Optional caption rendered below the large variant. */
  label?: string;
  accessibilityLabel?: string;
}

// ─── Layout constants (large variant — shared RN-free geometry) ─────────────

// Small variant
const S_CELL = 6;
const S_GAP = 2;
const S_CENTER = 2;
const S_PADDING = 3;
const S_GRID = 3 * S_CELL + 2 * S_GAP;   // 22
const S_SIZE = S_GRID + 2 * S_PADDING;    // 28

const S_GRAD = 44;
const S_GRAD_OFFSET = (S_SIZE - S_GRAD) / 2;  // -8

// Mini variant — inline beside status text (~16pt)
const M_CELL = 4;
const M_GAP = 1;
const M_CENTER = 2;
const M_PADDING = 1;
const M_GRID = 3 * M_CELL + 2 * M_GAP;   // 14
const M_SIZE = M_GRID + 2 * M_PADDING;    // 16

const M_GRAD = 28;
const M_GRAD_OFFSET = (M_SIZE - M_GRAD) / 2;  // -6

// Backdrop variant — large decorative grid (sits behind the hero logo)
const B_CELL = 56;
const B_GAP = 8;
const B_CENTER = 18;
const B_PADDING = 10;
const B_GRID = 3 * B_CELL + 2 * B_GAP;   // 184
const B_SIZE = B_GRID + 2 * B_PADDING;    // 204

const B_GRAD = 290;
const B_GRAD_OFFSET = (B_SIZE - B_GRAD) / 2;  // -43

// Animation timing
export const ROTATE_DURATION = 6000; // full gradient rotation period

// Random-blink tuning
export const BASE_OPACITY = 0.10;   // dim resting state
export const LIT_OPACITY = 1.0;     // peak of a flash
export const REST_OPACITY = 0.62;   // static value used under reduced-motion
export const TICK_MS = 220;          // scheduler interval
export const FLASH_PROB = 0.55;      // prob a tick fires at all
export const BURST_PROB = 0.18;      // prob a firing tick lights 2 cells instead of 1
export const RAMP_UP_MS = 140;       // opacity → LIT ramp duration
export const DECAY_MS = 700;         // opacity → BASE decay duration

// ─── GridMask ─────────────────────────────────────────────────────────────────

interface GridMaskProps {
  cellOpacities: [
    SharedValue<number>, SharedValue<number>, SharedValue<number>,
    SharedValue<number>, SharedValue<number>, SharedValue<number>,
    SharedValue<number>, SharedValue<number>, SharedValue<number>,
  ];
  cell: number;
  center: number;
  gap: number;
  padding: number;
  size: number;
}

/**
 * Renders white squares on a transparent background.
 * MaskedView treats each pixel's alpha as a visibility mask —
 * so Reanimated opacity animation on these squares makes the
 * gradient behind them flash in and out.
 */
function GridMask({
  cellOpacities,
  cell,
  center,
  gap,
  padding,
  size,
}: GridMaskProps): React.JSX.Element {
  // 9 explicit useAnimatedStyle calls — fixed count, satisfies Rules of Hooks.
  const s0 = useAnimatedStyle(() => ({ opacity: cellOpacities[0].value }));
  const s1 = useAnimatedStyle(() => ({ opacity: cellOpacities[1].value }));
  const s2 = useAnimatedStyle(() => ({ opacity: cellOpacities[2].value }));
  const s3 = useAnimatedStyle(() => ({ opacity: cellOpacities[3].value }));
  const s4 = useAnimatedStyle(() => ({ opacity: cellOpacities[4].value }));
  const s5 = useAnimatedStyle(() => ({ opacity: cellOpacities[5].value }));
  const s6 = useAnimatedStyle(() => ({ opacity: cellOpacities[6].value }));
  const s7 = useAnimatedStyle(() => ({ opacity: cellOpacities[7].value }));
  const s8 = useAnimatedStyle(() => ({ opacity: cellOpacities[8].value }));
  const cellStyles = [s0, s1, s2, s3, s4, s5, s6, s7, s8] as const;

  const cellRadius = Math.round(cell * 0.22);
  const centerRadius = Math.round(center / 2);

  return (
    <View
      style={{
        width: size,
        height: size,
        padding,
        rowGap: gap,
        backgroundColor: 'transparent',
      }}
    >
      {GRID_ROWS.map((row, rowIdx) => (
        <View key={rowIdx} style={{ flexDirection: 'row', columnGap: gap }}>
          {row.map((idx) => {
            const isCenter = idx === 4;
            return (
              <View
                key={idx}
                style={{
                  width: cell,
                  height: cell,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Animated.View
                  style={[
                    {
                      width: isCenter ? center : cell,
                      height: isCenter ? center : cell,
                      borderRadius: isCenter ? centerRadius : cellRadius,
                      backgroundColor: 'white',
                    },
                    cellStyles[idx],
                  ]}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Shared animation logic ───────────────────────────────────────────────────

type CellOpacities = GridMaskProps['cellOpacities'];

function useGridAnimations(reducedMotion: boolean): {
  rotInterp: RNAnimated.AnimatedInterpolation<string>;
  cellOpacities: CellOpacities;
} {
  const rotAnim = useRef(new RNAnimated.Value(0)).current;
  const rotLoopRef = useRef<RNAnimated.CompositeAnimation | null>(null);

  // 9 explicit SharedValues — fixed count, satisfies Rules of Hooks.
  const initOpacity = reducedMotion ? REST_OPACITY : BASE_OPACITY;
  const sv0 = useSharedValue(initOpacity);
  const sv1 = useSharedValue(initOpacity);
  const sv2 = useSharedValue(initOpacity);
  const sv3 = useSharedValue(initOpacity);
  const sv4 = useSharedValue(initOpacity);
  const sv5 = useSharedValue(initOpacity);
  const sv6 = useSharedValue(initOpacity);
  const sv7 = useSharedValue(initOpacity);
  const sv8 = useSharedValue(initOpacity);
  const cellOpacities: CellOpacities = [sv0, sv1, sv2, sv3, sv4, sv5, sv6, sv7, sv8];

  useEffect(() => {
    if (reducedMotion) return;

    // Gradient rotation
    const loop = RNAnimated.loop(
      RNAnimated.timing(rotAnim, {
        toValue: 1,
        duration: ROTATE_DURATION,
        easing: RNEasing.linear,
        useNativeDriver: true,
      }),
    );
    rotLoopRef.current = loop;
    loop.start();

    // Intro sweep: deterministically flash 3 cells on mount so the gradient
    // is visible immediately, even during a brief cold-start splash.
    pickDistinct(3).forEach((i, order) => {
      const op = cellOpacities[i];
      if (!op) {
        return;
      }
      op.value = withDelay(
        order * 90,
        withSequence(
          withTiming(LIT_OPACITY, { duration: RAMP_UP_MS, easing: Easing.out(Easing.quad) }),
          withTiming(BASE_OPACITY, { duration: DECAY_MS, easing: Easing.in(Easing.quad) }),
        ),
      );
    });

    // Per-cell blink scheduler
    const intervalId = setInterval(() => {
      if (Math.random() > FLASH_PROB) return;
      const count = Math.random() < BURST_PROB ? 2 : 1;
      pickDistinct(count).forEach((i) => {
        const op = cellOpacities[i];
        if (!op) {
          return;
        }
        op.value = withSequence(
          withTiming(LIT_OPACITY, { duration: RAMP_UP_MS, easing: Easing.out(Easing.quad) }),
          withTiming(BASE_OPACITY, { duration: DECAY_MS, easing: Easing.in(Easing.quad) }),
        );
      });
    }, TICK_MS);

    return () => {
      rotLoopRef.current?.stop();
      rotLoopRef.current = null;
      clearInterval(intervalId);
    };
    // cellOpacities array identity is stable (same 9 refs across renders)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, rotAnim]);

  const rotInterp = rotAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return { rotInterp, cellOpacities };
}

// ─── LargeLoader ─────────────────────────────────────────────────────────────

interface LoaderProps {
  colors: ThemeColors;
  label?: string;
  reducedMotion: boolean;
}

function LargeLoader({ colors, label, reducedMotion }: LoaderProps): React.JSX.Element {
  const { rotInterp, cellOpacities } = useGridAnimations(reducedMotion);

  const gradColors = themeGradientColors(colors);

  return (
    <View
      style={styles.largeWrap}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}
      accessible
    >
      <MaskedView
        style={styles.gridL}
        maskElement={
          <GridMask
            cellOpacities={cellOpacities}
            cell={L_CELL}
            center={L_CENTER}
            gap={L_GAP}
            padding={L_PADDING}
            size={L_SIZE}
          />
        }
      >
        <View style={styles.gridL}>
          <RNAnimated.View
            style={[styles.gradWrapL, { transform: [{ rotate: rotInterp }] }]}
          >
            <LinearGradient
              colors={gradColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
          </RNAnimated.View>
        </View>
      </MaskedView>

      {label ? (
        <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      ) : null}
    </View>
  );
}

// ─── SmallLoader ──────────────────────────────────────────────────────────────

function SmallLoader({
  colors,
  reducedMotion,
}: Omit<LoaderProps, 'label'>): React.JSX.Element {
  const { rotInterp, cellOpacities } = useGridAnimations(reducedMotion);

  const gradColors = themeGradientColors(colors);

  return (
    <MaskedView
      style={styles.gridS}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      accessible
      maskElement={
        <GridMask
          cellOpacities={cellOpacities}
          cell={S_CELL}
          center={S_CENTER}
          gap={S_GAP}
          padding={S_PADDING}
          size={S_SIZE}
        />
      }
    >
      <View style={styles.gridS}>
        <RNAnimated.View
          style={[styles.gradWrapS, { transform: [{ rotate: rotInterp }] }]}
        >
          <LinearGradient
            colors={gradColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </RNAnimated.View>
      </View>
    </MaskedView>
  );
}

// ─── MiniLoader ───────────────────────────────────────────────────────────────

function MiniLoader({
  colors,
  reducedMotion,
}: Omit<LoaderProps, 'label'>): React.JSX.Element {
  const { rotInterp, cellOpacities } = useGridAnimations(reducedMotion);

  const gradColors = themeGradientColors(colors);

  return (
    <MaskedView
      style={styles.gridM}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      accessible
      maskElement={
        <GridMask
          cellOpacities={cellOpacities}
          cell={M_CELL}
          center={M_CENTER}
          gap={M_GAP}
          padding={M_PADDING}
          size={M_SIZE}
        />
      }
    >
      <View style={styles.gridM}>
        <RNAnimated.View
          style={[styles.gradWrapM, { transform: [{ rotate: rotInterp }] }]}
        >
          <LinearGradient
            colors={gradColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </RNAnimated.View>
      </View>
    </MaskedView>
  );
}

// ─── BackdropLoader ──────────────────────────────────────────────────────────

function BackdropLoader({ colors, reducedMotion }: Omit<LoaderProps, 'label'>): React.JSX.Element {
  const { rotInterp, cellOpacities } = useGridAnimations(reducedMotion);

  const gradColors = themeGradientColors(colors);

  return (
    <View
      style={styles.backdropWrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <MaskedView
        style={styles.gridB}
        maskElement={
          <GridMask
            cellOpacities={cellOpacities}
            cell={B_CELL}
            center={B_CENTER}
            gap={B_GAP}
            padding={B_PADDING}
            size={B_SIZE}
          />
        }
      >
        <View style={styles.gridB}>
          <RNAnimated.View
            style={[styles.gradWrapB, { transform: [{ rotate: rotInterp }] }]}
          >
            <LinearGradient
              colors={gradColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
          </RNAnimated.View>
        </View>
      </MaskedView>
    </View>
  );
}

// ─── BrandLoader (exported) ───────────────────────────────────────────────────

export function BrandLoader({
  variant = 'large',
  palette,
  label,
  accessibilityLabel,
}: BrandLoaderProps): React.JSX.Element {
  const { colors: themeColors } = useTheme();
  const reducedMotion = useReducedMotion() ?? false;
  const colors = palette ?? themeColors;

  if (variant === 'mini') {
    return <MiniLoader colors={colors} reducedMotion={reducedMotion} />;
  }

  if (variant === 'small') {
    return <SmallLoader colors={colors} reducedMotion={reducedMotion} />;
  }

  if (variant === 'backdrop') {
    return <BackdropLoader colors={colors} reducedMotion={reducedMotion} />;
  }

  return (
    <LargeLoader
      colors={colors}
      label={accessibilityLabel ?? label}
      reducedMotion={reducedMotion}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  largeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridL: {
    width: L_SIZE,
    height: L_SIZE,
  },
  gradWrapL: {
    width: L_GRAD,
    height: L_GRAD,
    position: 'absolute',
    top: L_GRAD_OFFSET,
    left: L_GRAD_OFFSET,
  },
  gridS: {
    width: S_SIZE,
    height: S_SIZE,
  },
  gradWrapS: {
    width: S_GRAD,
    height: S_GRAD,
    position: 'absolute',
    top: S_GRAD_OFFSET,
    left: S_GRAD_OFFSET,
  },
  gridM: {
    width: M_SIZE,
    height: M_SIZE,
  },
  gradWrapM: {
    width: M_GRAD,
    height: M_GRAD,
    position: 'absolute',
    top: M_GRAD_OFFSET,
    left: M_GRAD_OFFSET,
  },
  label: {
    marginTop: 28,
    fontSize: FontSize.sm,
    fontWeight: '500',
    textAlign: 'center',
  },
  backdropWrap: {
    opacity: 0.35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridB: {
    width: B_SIZE,
    height: B_SIZE,
  },
  gradWrapB: {
    width: B_GRAD,
    height: B_GRAD,
    position: 'absolute',
    top: B_GRAD_OFFSET,
    left: B_GRAD_OFFSET,
  },
});
