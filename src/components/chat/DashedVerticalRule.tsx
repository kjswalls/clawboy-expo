import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

/** Must match `MessageBubble` `styles.blocks` gap between internal block rows. */
export const INTER_BLOCK_GAP = 4;

const BADGE_TOP_PAD = 4;
const BADGE_SIZE = 24;
/** Y of bottom edge of circular icon badge from top of block root (row padding + badge). */
export const BADGE_BOTTOM_Y = BADGE_TOP_PAD + BADGE_SIZE;

/**
 * Positions a dashed segment from the bottom of the previous block’s badge to the top of this block’s badge.
 * `prevBlockHeight` is the onLayout height of the previous sibling block root.
 *
 * Span length = prev + gap + (top of next badge) − (bottom of prev badge) = prev + gap + BADGE_TOP_PAD − BADGE_BOTTOM_Y.
 */
export function getInterBlockConnectorLayout(prevBlockHeight: number): { top: number; height: number } {
  const height = Math.max(
    0,
    prevBlockHeight + INTER_BLOCK_GAP + BADGE_TOP_PAD - BADGE_BOTTOM_Y,
  );
  const top = BADGE_BOTTOM_Y - prevBlockHeight - INTER_BLOCK_GAP;
  return { top, height };
}

/** RN does not reliably render dashed borders; use SVG strokeDasharray instead. */
export function DashedVerticalRule({
  height,
  color,
  dashLength = 4,
  gapLength = 4,
  strokeWidth = 2,
}: {
  height: number;
  color: string;
  dashLength?: number;
  gapLength?: number;
  strokeWidth?: number;
}): React.JSX.Element | null {
  if (height <= 0 || !Number.isFinite(height)) {
    return null;
  }

  const cx = strokeWidth / 2;

  return (
    <View style={[styles.wrap, { height }]}>
      <Svg width={strokeWidth} height={height}>
        <Line
          x1={cx}
          y1={0}
          x2={cx}
          y2={height}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${dashLength},${gapLength}`}
          strokeLinecap="butt"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    alignItems: 'center',
  },
});
