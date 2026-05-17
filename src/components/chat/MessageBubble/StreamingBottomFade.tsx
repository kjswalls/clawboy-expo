import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';

const FADE_REGION = 32;
const MASK_COLORS: [string, string, string] = ['#000000ff', '#000000ff', '#00000000'];
const MASK_LOCATIONS: [number, number, number] = [0, 0.6, 1];

export function StreamingBottomFade({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  if (!active || Platform.OS !== 'ios') {
    return <>{children}</>;
  }
  return (
    <MaskedView
      maskElement={
        <LinearGradient
          style={StyleSheet.absoluteFill}
          colors={MASK_COLORS}
          locations={MASK_LOCATIONS}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
      }
      style={{ paddingBottom: FADE_REGION }}
    >
      {children}
    </MaskedView>
  );
}
