/**
 * FoundersCountdown — shows "Closes in N days" for the founders window.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { FontSize } from '@/constants/theme';

interface Props {
  remainingMs: number;
}

export function FoundersCountdown({ remainingMs }: Props): React.JSX.Element | null {
  const { colors } = useTheme();

  if (remainingMs <= 0) return null;

  const daysLeft = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));

  return (
    <View style={[styles.pill, { backgroundColor: `${colors.warning}22`, borderColor: `${colors.warning}44` }]}>
      <Text style={[styles.text, { color: colors.warningText }]}>
        ⏳ Closes in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  text: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
