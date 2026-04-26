import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { Camera, Film } from 'lucide-react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  useBottomSheetSpringConfigs,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';

// ── Haptics ───────────────────────────────────────────────────────────────────

export function tapHaptic(): void {
  Haptics.selectionAsync().catch(() => {});
}

export function successHaptic(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

// ── useRecentMedia ─────────────────────────────────────────────────────────────

export interface RecentMediaState {
  assets: MediaLibrary.Asset[];
  status: MediaLibrary.PermissionStatus | null;
  requestPermission: () => Promise<void>;
}

export function useRecentMedia(limit = 12): RecentMediaState {
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [status, setStatus] = useState<MediaLibrary.PermissionStatus | null>(null);

  const fetchAssets = useCallback(async (): Promise<void> => {
    const result = await MediaLibrary.getAssetsAsync({
      first: limit,
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });
    setAssets(result.assets);
  }, [limit]);

  const load = useCallback(async (): Promise<void> => {
    const perm = await MediaLibrary.getPermissionsAsync();
    setStatus(perm.status);
    if (perm.granted) {
      await fetchAssets();
    }
  }, [fetchAssets]);

  const requestPermission = useCallback(async (): Promise<void> => {
    const perm = await MediaLibrary.requestPermissionsAsync();
    setStatus(perm.status);
    if (perm.granted) {
      await fetchAssets();
    } else if (perm.status === MediaLibrary.PermissionStatus.DENIED) {
      await Linking.openSettings();
    }
  }, [fetchAssets]);

  useEffect(() => {
    void load();
  }, [load]);

  return { assets, status, requestPermission };
}

// ── useClipboardHasImage ───────────────────────────────────────────────────────

export function useClipboardHasImage(visible: boolean): boolean {
  const [hasImage, setHasImage] = useState(false);

  useEffect(() => {
    if (!visible) return;
    Clipboard.hasImageAsync()
      .then(setHasImage)
      .catch(() => setHasImage(false));
  }, [visible]);

  return hasImage;
}

// ── AttachmentSheetBaseProps ───────────────────────────────────────────────────

export interface AttachmentSheetBaseProps {
  visible: boolean;
  onClose: () => void;
  onPickPhoto: () => void;
  onPickVideo: () => void;
  onTakeVideo: () => void;
  onPickFile: () => void;
  onPasteImage: () => void;
  /** Launches camera for either photo or video (merged action). */
  onTakeMedia: () => void;
  /** Called with selected MediaLibrary assets to attach. InputBar resolves localUri. */
  onAttachRecentAssets: (assets: MediaLibrary.Asset[]) => void;
}

// ── ShimmerTitle ───────────────────────────────────────────────────────────────

interface ShimmerTitleProps {
  colors: ThemeColors;
  /** Increment to replay the sweep animation on every sheet open. */
  playKey: number;
}

export function ShimmerTitle({ colors, playKey }: ShimmerTitleProps): React.JSX.Element {
  const shimmerX = useSharedValue(-60);
  const lineOpacity = useSharedValue(0);

  useEffect(() => {
    // Reset and replay sweep
    shimmerX.value = -60;
    lineOpacity.value = 1;
    shimmerX.value = withDelay(
      200,
      withTiming(340, { duration: 680 }, (finished) => {
        if (finished) {
          lineOpacity.value = withDelay(80, withTiming(0, { duration: 400 }));
        }
      }),
    );
  // playKey intentionally drives replay; shared values are stable refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey]);

  const shimmerAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  const lineAnimStyle = useAnimatedStyle(() => ({
    opacity: lineOpacity.value,
  }));

  return (
    <View style={shimmerTitleStyles.wrap}>
      <Text style={[shimmerTitleStyles.title, { color: colors.foreground }]}>
        Attach
      </Text>
      <Animated.View
        style={[
          shimmerTitleStyles.underline,
          { backgroundColor: `${colors.primary}28` },
          lineAnimStyle,
        ]}
      >
        <Animated.View
          style={[
            shimmerTitleStyles.shimmerGlow,
            { backgroundColor: colors.primary },
            shimmerAnimStyle,
          ]}
        />
      </Animated.View>
    </View>
  );
}

const shimmerTitleStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.base,
    fontWeight: '600',
    marginBottom: 7,
  },
  underline: {
    height: 1.5,
    borderRadius: 1,
    overflow: 'hidden',
  },
  shimmerGlow: {
    position: 'absolute',
    top: -1,
    bottom: -1,
    width: 52,
    opacity: 0.75,
    borderRadius: 1,
  },
});

// ── RecentThumb ────────────────────────────────────────────────────────────────

export const THUMB_SIZE = 76;

interface RecentThumbProps {
  asset: MediaLibrary.Asset;
  selected?: boolean;
  colors: ThemeColors;
  onPress: (asset: MediaLibrary.Asset) => void;
  onLongPress: (asset: MediaLibrary.Asset) => void;
}

export function RecentThumb({
  asset,
  selected = false,
  colors,
  onPress,
  onLongPress,
}: RecentThumbProps): React.JSX.Element {
  const scale = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={() => {
        tapHaptic();
        scale.value = withSpring(0.93, { damping: 12 }, () => {
          scale.value = withSpring(1, { damping: 12 });
        });
        onPress(asset);
      }}
      onLongPress={() => {
        tapHaptic();
        onLongPress(asset);
      }}
    >
      <Animated.View
        style={[
          thumbStyles.container,
          {
            borderColor: selected ? colors.primary : 'transparent',
            borderWidth: 2.5,
          },
          scaleStyle,
        ]}
      >
        <Image
          source={{ uri: asset.uri }}
          style={thumbStyles.image}
          contentFit="cover"
          transition={80}
        />
        {selected && (
          <View style={[thumbStyles.checkCircle, { backgroundColor: colors.primary }]}>
            <Text style={thumbStyles.checkMark}>✓</Text>
          </View>
        )}
        {asset.mediaType === MediaLibrary.MediaType.video && !selected && (
          <View style={thumbStyles.videoBadge}>
            <Film size={9} color="#fff" strokeWidth={2.5} />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const thumbStyles = StyleSheet.create({
  container: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 9,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  checkCircle: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  videoBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    borderRadius: 4,
    padding: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});

// ── CameraTile ─────────────────────────────────────────────────────────────────

interface CameraTileProps {
  colors: ThemeColors;
  onPress: () => void;
}

export function CameraTile({ colors, onPress }: CameraTileProps): React.JSX.Element {
  return (
    <Pressable
      onPress={() => {
        tapHaptic();
        onPress();
      }}
      style={({ pressed }) => [
        cameraTileStyles.container,
        {
          backgroundColor: colors.background,
          borderColor: `${colors.primary}55`,
        },
        pressed && { opacity: 0.72 },
      ]}
      accessibilityLabel="Open camera"
      accessibilityRole="button"
    >
      <Camera size={22} color={colors.primary} strokeWidth={1.5} />
    </Pressable>
  );
}

const cameraTileStyles = StyleSheet.create({
  container: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ── PermissionPrompt ───────────────────────────────────────────────────────────

interface PermissionPromptProps {
  colors: ThemeColors;
  onRequest: () => void;
}

export function PermissionPrompt({ colors, onRequest }: PermissionPromptProps): React.JSX.Element {
  return (
    <Pressable
      onPress={() => { tapHaptic(); onRequest(); }}
      style={({ pressed }) => [
        permStyles.row,
        { borderColor: colors.border },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Allow photo library access"
    >
      <View style={[permStyles.iconWrap, { backgroundColor: `${colors.primary}18` }]}>
        <Camera size={14} color={colors.primary} strokeWidth={1.75} />
      </View>
      <Text style={[permStyles.label, { color: colors.primary }]}>
        Allow photo library access to see recents
      </Text>
    </Pressable>
  );
}

const permStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
});

// ── BottomSheetShell ───────────────────────────────────────────────────────────

interface BottomSheetShellProps {
  visible: boolean;
  onClose: () => void;
  colors: ThemeColors;
  children: React.ReactNode;
}

export function BottomSheetShell({
  visible,
  onClose,
  colors,
  children,
}: BottomSheetShellProps): React.JSX.Element {
  const sheetRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const animationConfigs = useBottomSheetSpringConfigs({
    damping: 22,
    stiffness: 240,
    mass: 0.7,
    overshootClamping: false,
  });

  useEffect(() => {
    if (visible) {
      sheetRef.current?.present();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.55}
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      animationConfigs={animationConfigs}
      backdropComponent={renderBackdrop}
      onDismiss={onClose}
      backgroundStyle={{ backgroundColor: colors.card }}
      handleIndicatorStyle={shellStyles.indicator}
      style={shellStyles.shadow}
    >
      <BottomSheetView
        style={{ paddingBottom: Math.max(insets.bottom + Spacing.md, Spacing['2xl']) }}
      >
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

// Separate StyleSheet from the inline usage above
const shellStyles = StyleSheet.create({
  indicator: {
    backgroundColor: '#80808050',
    width: 36,
    height: 4,
  },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 12,
  },
});

// ── Re-export ThemeColors for convenience in variants ─────────────────────────
export type { ThemeColors };
export { useThemeContext };
