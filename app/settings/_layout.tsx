import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';

export default function SettingsLayout(): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        gestureEnabled: true,
        animation: 'slide_from_right',
        fullScreenGestureEnabled: true,
      }}
    />
  );
}
