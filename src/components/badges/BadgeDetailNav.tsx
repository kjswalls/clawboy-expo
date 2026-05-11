/**
 * BadgeDetailNav — previous/next chevron buttons for BadgeDetailModal.
 * Absolutely positioned inside the card.
 */

import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

export interface BadgeDetailNavProps {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  foregroundColor: string;
}

export function BadgeDetailNav({
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  foregroundColor,
}: BadgeDetailNavProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <Pressable
        onPress={onPrev}
        hitSlop={12}
        disabled={!hasPrev}
        style={({ pressed }) => [
          styles.navBtnLeft,
          { opacity: !hasPrev ? 0.25 : pressed ? 0.6 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('badges.detail.previous')}
        accessibilityState={{ disabled: !hasPrev }}
      >
        <ChevronLeft size={22} color={foregroundColor} />
      </Pressable>

      <Pressable
        onPress={onNext}
        hitSlop={12}
        disabled={!hasNext}
        style={({ pressed }) => [
          styles.navBtnRight,
          { opacity: !hasNext ? 0.25 : pressed ? 0.6 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('badges.detail.next')}
        accessibilityState={{ disabled: !hasNext }}
      >
        <ChevronRight size={22} color={foregroundColor} />
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  navBtnLeft: {
    position: 'absolute',
    left: 4,
    top: '50%',
    transform: [{ translateY: -18 }],
    padding: 6,
    zIndex: 2,
  },
  navBtnRight: {
    position: 'absolute',
    right: 4,
    top: '50%',
    transform: [{ translateY: -18 }],
    padding: 6,
    zIndex: 2,
  },
});
