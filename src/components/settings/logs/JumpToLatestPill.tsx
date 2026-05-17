import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { ArrowDown, ArrowUp } from 'lucide-react-native';
import { BorderRadius, FontSize } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import type { SortOrder } from './logDisplayHelpers';

interface JumpToLatestPillProps {
  visible: boolean;
  onPress: () => void;
  sortOrder: SortOrder;
  bottomInset: number;
  colors: ThemeColors;
  t: ReturnType<typeof import('react-i18next').useTranslation>['t'];
}

export function JumpToLatestPill({
  visible,
  onPress,
  sortOrder,
  bottomInset,
  colors,
  t,
}: JumpToLatestPillProps): React.JSX.Element | null {
  if (!visible) return null;

  return (
    <Pressable
      onPress={onPress}
      style={[
        pillStyles.jumpPill,
        {
          backgroundColor: colors.primary,
          bottom: (bottomInset || 8) + 60,
        },
      ]}
      accessibilityLabel={t('gatewayLogs.jumpToLatest')}
    >
      {sortOrder === 'newest-bottom'
        ? <ArrowDown size={14} color="#fff" />
        : <ArrowUp size={14} color="#fff" />
      }
      <Text style={pillStyles.jumpText}>{t('gatewayLogs.jumpToLatest')}</Text>
    </Pressable>
  );
}

const pillStyles = StyleSheet.create({
  jumpPill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
  },
  jumpText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
