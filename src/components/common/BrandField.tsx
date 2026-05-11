/**
 * BrandField — tiled field of 3×3 brand-loader grids that fills its container.
 *
 * Used on the onboarding welcome screen as a full-width animated background.
 * Renders an N×M grid of small 3×3 tiles (each matching the BrandLoader large
 * variant's cell geometry) behind a single rotating rainbow gradient.
 *
 * Architecture:
 *   - One RNAnimated rotation loop drives a single LinearGradient that fills
 *     the entire container; cell squares in the MaskedView mask punch holes
 *     through to reveal the gradient.
 *   - Cell opacity values live in a stable useRef array (RNAnimated.Value[]).
 *     This sidesteps Rules-of-Hooks constraints on dynamic SharedValue counts
 *     while still driving opacity from the native thread (useNativeDriver).
 *   - A single setInterval scheduler fires every TICK_MS and randomly lights
 *     (tileIdx, cellIdx) pairs, with flash density scaled to actual tile count.
 *   - Tile count is derived from onLayout measurement; MAX_TILES caps the pool.
 *
 * Reduced motion: rotation loop and scheduler are skipped; cells render at
 * REST_OPACITY so the static gradient is still subtly visible.
 */

import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Easing as RNEasing,
  StyleSheet,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import type { ThemeColors } from '@/types';
import {
  BASE_OPACITY,
  BURST_PROB,
  DECAY_MS,
  FLASH_PROB,
  GRID_ROWS,
  L_CELL,
  L_CENTER,
  L_GAP,
  L_PADDING,
  L_SIZE,
  LIT_OPACITY,
  RAMP_UP_MS,
  REST_OPACITY,
  ROTATE_DURATION,
  TICK_MS,
} from './BrandLoader';

// ─── Field layout constants ───────────────────────────────────────────────────

// Gap between adjacent tiles (pt). Within each tile the existing L_GAP applies.
const TILE_GAP = 10;

// Maximum tiles to pre-allocate RNAnimated.Value pool for.
// 8 cols × 8 rows = 64 tiles covers every realistic phone screen.
const MAX_TILES = 64;

// Per-cell geometry (reuses large-variant numbers from BrandLoader)
const CELL_RADIUS = Math.round(L_CELL * 0.22);
const CENTER_RADIUS = Math.round(L_CENTER / 2);

// ─── TileSquares ─────────────────────────────────────────────────────────────

interface TileSquaresProps {
  cellValues: RNAnimated.Value[];
  tileIdx: number;
}

/**
 * Renders one 3×3 grid of white squares driven by pre-allocated RNAnimated
 * values. These squares form the alpha mask that reveals the gradient below.
 */
function TileSquares({ cellValues, tileIdx }: TileSquaresProps): React.JSX.Element {
  return (
    <View
      style={{
        width: L_SIZE,
        height: L_SIZE,
        padding: L_PADDING,
        rowGap: L_GAP,
        backgroundColor: 'transparent',
      }}
    >
      {GRID_ROWS.map((row, rowIdx) => (
        <View key={rowIdx} style={{ flexDirection: 'row', columnGap: L_GAP }}>
          {row.map((cellIdx) => {
            const isCenter = cellIdx === 4;
            const valueIdx = tileIdx * 9 + cellIdx;
            return (
              <View
                key={cellIdx}
                style={{
                  width: L_CELL,
                  height: L_CELL,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <RNAnimated.View
                  style={{
                    width: isCenter ? L_CENTER : L_CELL,
                    height: isCenter ? L_CENTER : L_CELL,
                    borderRadius: isCenter ? CENTER_RADIUS : CELL_RADIUS,
                    backgroundColor: 'white',
                    opacity: cellValues[valueIdx],
                  }}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── BrandField ──────────────────────────────────────────────────────────────

interface BrandFieldProps {
  /** Override theme colors (useful before ThemeContext mounts). */
  palette?: ThemeColors;
  /** Opacity multiplier for the overall field (default 0.30 — subtle). */
  fieldOpacity?: number;
}

export function BrandField({
  palette,
  fieldOpacity = 1,
}: BrandFieldProps): React.JSX.Element {
  const { colors: themeColors } = useTheme();
  const reducedMotion = useReducedMotion() ?? false;
  const colors = palette ?? themeColors;

  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  // Single rotation animation shared across all tile gradients.
  const rotAnim = useRef(new RNAnimated.Value(0)).current;

  // Pre-allocated pool: MAX_TILES × 9 values. Fixed count — Rules of Hooks safe.
  const initOpacity = reducedMotion ? REST_OPACITY : BASE_OPACITY;
  const cellValues = useRef<RNAnimated.Value[]>(
    Array.from({ length: MAX_TILES * 9 }, () => new RNAnimated.Value(initOpacity)),
  ).current;

  // ── Derive layout from measured dims ──────────────────────────────────────
  const stride = L_SIZE + TILE_GAP;
  const cols = dims ? Math.min(8, Math.floor((dims.w + TILE_GAP) / stride)) : 0;
  const rows = dims ? Math.min(8, Math.floor((dims.h + TILE_GAP) / stride)) : 0;
  const tileCount = cols * rows;

  // Gradient must cover the entire field even while rotating.
  // Use the diagonal so corners never go uncovered.
  const fieldW = dims?.w ?? 400;
  const fieldH = dims?.h ?? 500;
  const diagSize = Math.ceil(Math.sqrt(fieldW * fieldW + fieldH * fieldH));
  const gradTop = (fieldH - diagSize) / 2;   // negative: extends above container
  const gradLeft = (fieldW - diagSize) / 2;  // negative: extends left of container

  const rotInterp = rotAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const gradColors = [
    colors.primary,
    colors.accentViolet,
    colors.accentIndigo,
    colors.accentBlue,
    colors.primary,
  ] as const;

  // ── Stable ref so the interval always sees the current tileCount ──────────
  const tileCountRef = useRef(tileCount);
  tileCountRef.current = tileCount;

  // ── Animation effects ─────────────────────────────────────────────────────
  useEffect(() => {
    if (reducedMotion) {
      cellValues.forEach((v) => v.setValue(REST_OPACITY));
      return;
    }

    // Kick off gradient rotation.
    const loop = RNAnimated.loop(
      RNAnimated.timing(rotAnim, {
        toValue: 1,
        duration: ROTATE_DURATION,
        easing: RNEasing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();

    // Single blink scheduler for all tiles.
    const intervalId = setInterval(() => {
      const count = tileCountRef.current;
      if (count === 0) return;
      if (Math.random() > FLASH_PROB) return;

      const numFlashes = Math.random() < BURST_PROB ? 2 : 1;
      for (let i = 0; i < numFlashes; i++) {
        const tileIdx = Math.floor(Math.random() * count);
        const cellIdx = Math.floor(Math.random() * 9);
        const valueIdx = tileIdx * 9 + cellIdx;
        RNAnimated.sequence([
          RNAnimated.timing(cellValues[valueIdx], {
            toValue: LIT_OPACITY,
            duration: RAMP_UP_MS,
            easing: RNEasing.out(RNEasing.quad),
            useNativeDriver: true,
          }),
          RNAnimated.timing(cellValues[valueIdx], {
            toValue: BASE_OPACITY,
            duration: DECAY_MS,
            easing: RNEasing.in(RNEasing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      }
    }, TICK_MS);

    return () => {
      loop.stop();
      clearInterval(intervalId);
    };
    // cellValues and rotAnim are stable refs — safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  // ── Mask element: rows of tiles ───────────────────────────────────────────
  const maskElement = (
    <View
      style={{
        width: fieldW,
        height: fieldH,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
      }}
    >
      <View style={{ rowGap: TILE_GAP }}>
        {Array.from({ length: rows }, (_, rowIdx) => (
          <View key={rowIdx} style={{ flexDirection: 'row', columnGap: TILE_GAP }}>
            {Array.from({ length: cols }, (_, colIdx) => {
              const tileIdx = rowIdx * cols + colIdx;
              return (
                <TileSquares
                  key={colIdx}
                  cellValues={cellValues}
                  tileIdx={tileIdx}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View
      style={[styles.container, { opacity: fieldOpacity }]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setDims({ w: width, h: height });
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {dims && tileCount > 0 ? (
        <MaskedView style={StyleSheet.absoluteFill} maskElement={maskElement}>
          <View style={StyleSheet.absoluteFill}>
            <RNAnimated.View
              style={{
                width: diagSize,
                height: diagSize,
                position: 'absolute',
                top: gradTop,
                left: gradLeft,
                transform: [{ rotate: rotInterp }],
              }}
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
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
