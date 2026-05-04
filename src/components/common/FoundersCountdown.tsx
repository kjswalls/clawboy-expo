/**
 * FoundersCountdown — small pill showing time remaining in the Founders window.
 * Renders "Xd Yh Zm" and updates once per minute.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FontSize, FontWeight } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0d 0h 0m';
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${hours}h ${minutes}m`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface FoundersCountdownProps {
  remainingMs: number;
}

export function FoundersCountdown({ remainingMs }: FoundersCountdownProps): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [displayed, setDisplayed] = useState(() => formatRemaining(remainingMs));

  useEffect(() => {
    setDisplayed(formatRemaining(remainingMs));
    if (remainingMs <= 0) return;
    const id = setInterval(() => {
      setDisplayed(formatRemaining(remainingMs));
    }, 60_000);
    return () => clearInterval(id);
  }, [remainingMs]);

  const accent = '#FFB347';

  return (
    <View style={[styles.pill, { backgroundColor: `${accent}15`, borderColor: `${accent}40` }]}>
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {t('settings.edition.founders.countdown.endsIn')}
      </Text>
      <Text style={[styles.time, { color: accent }]}>{displayed}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: FontSize.xs,
  },
  time: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
});
