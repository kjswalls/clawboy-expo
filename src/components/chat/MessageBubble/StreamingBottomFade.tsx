import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const FADE_HEIGHT = 32;

export function StreamingBottomFade({
  active,
  tintColor,
  children,
}: {
  active: boolean;
  tintColor: string;
  children: React.ReactNode;
}): React.JSX.Element {
  if (!active || Platform.OS !== 'ios') {
    return <>{children}</>;
  }
  return (
    <View style={styles.container}>
      {children}
      <LinearGradient
        style={styles.overlay}
        colors={[tintColor, 'transparent']}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0 }}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: FADE_HEIGHT,
  },
});
