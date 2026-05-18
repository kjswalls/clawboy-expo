import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Image,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useBootReady } from '@/contexts/BootReadyContext';
import { useThemeContext } from '@/contexts/ThemeContext';

const FADE_MS = 280;
const LOGO_SIZE = 200;

// Must match app.json `expo-splash-screen` plugin `backgroundColor` / `dark.backgroundColor`.
const NATIVE_LIGHT_BG = '#FFFFFF';
const NATIVE_DARK_BG = '#020B0E'; // = Colors.tower.background; update both if native splash bg changes

const LIGHT_LOGO = require('../../../assets/splash-icon-light.png');
const DARK_LOGO = require('../../../assets/splash-icon-dark.png');

export function SplashOverlay(): React.JSX.Element | null {
  const osScheme = useColorScheme();
  const { resolvedScheme, colors } = useThemeContext();
  const { diskHydrationAttempted } = useBootReady();

  const [mounted, setMounted] = useState(true);
  const reduceMotionRef = useRef(false);
  const mirrorFadedRef = useRef(false);
  const isMountedRef = useRef(true);

  const wrapperOpacity = useSharedValue(1);
  const mirrorOpacity = useSharedValue(1);

  // Mirror layer paints the OS-matching variant so the handoff from native
  // splash is invisible. Fall back to dark if useColorScheme returns null
  // (matches ThemeContext's fallback at ThemeContext.tsx:184).
  const osIsDark = (osScheme ?? 'dark') === 'dark';
  const mirrorBg = osIsDark ? NATIVE_DARK_BG : NATIVE_LIGHT_BG;
  const mirrorLogo = osIsDark ? DARK_LOGO : LIGHT_LOGO;

  // User-theme layer reads from ThemeContext so it tracks the user's chosen
  // variant (tower, cygnus, polaris, etc.) — not just light/dark.
  const userLogo = useMemo(
    () => (resolvedScheme === 'dark' ? DARK_LOGO : LIGHT_LOGO),
    [resolvedScheme],
  );

  // Hand off from native splash to JS overlay on first paint. Both layers
  // are already opaque when this fires, so there's no flash.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => { /* already hidden */ });
  }, []);

  useEffect(() => () => { isMountedRef.current = false; }, []);

  // Track reduce-motion. If true, fades become instant cuts.
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (!cancelled) reduceMotionRef.current = enabled; })
      .catch(() => { /* ignore */ });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => { reduceMotionRef.current = enabled; },
    );
    return () => { cancelled = true; sub.remove(); };
  }, []);

  // Cross-fade mirror layer out once we know the user's theme differs from
  // the OS — this is what fades the user-theme splash IN by uncovering the
  // layer beneath. If themes match, the mirror stays opaque (invisible
  // transition) and we just wait for the wrapper fade-out.
  useEffect(() => {
    if (resolvedScheme === (osScheme ?? 'dark')) return;
    if (mirrorFadedRef.current) return;
    mirrorFadedRef.current = true;
    const duration = reduceMotionRef.current ? 0 : FADE_MS;
    mirrorOpacity.value = withTiming(0, {
      duration,
      easing: Easing.out(Easing.ease),
    });
  }, [resolvedScheme, osScheme, mirrorOpacity]);

  // Fade the whole overlay out once boot is ready.
  useEffect(() => {
    if (!diskHydrationAttempted) return;
    const duration = reduceMotionRef.current ? 0 : FADE_MS;
    wrapperOpacity.value = withTiming(
      0,
      { duration, easing: Easing.out(Easing.ease) },
      (finished) => {
        if (finished && isMountedRef.current) runOnJS(setMounted)(false);
      },
    );
  }, [diskHydrationAttempted, wrapperOpacity]);

  const wrapperStyle = useAnimatedStyle(() => ({
    opacity: wrapperOpacity.value,
  }));
  const mirrorStyle = useAnimatedStyle(() => ({
    opacity: mirrorOpacity.value,
  }));

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.wrapper, wrapperStyle]}
    >
      <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.background }]}>
        <Image source={userLogo} style={styles.logo} />
      </View>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: mirrorBg }, mirrorStyle]}
      >
        <Image source={mirrorLogo} style={styles.logo} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    zIndex: 9999,
    elevation: 9999,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    resizeMode: 'contain',
  },
});
