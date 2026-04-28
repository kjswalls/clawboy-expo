import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import type * as ML from 'expo-media-library';
import { Camera, ChevronRight, ClipboardPaste, FileText, Images } from 'lucide-react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import {
  AttachmentSheetBaseProps,
  BottomSheetShell,
  CameraTile,
  PermissionPrompt,
  RecentThumb,
  ShimmerTitle,
  THUMB_SIZE,
  successHaptic,
  tapHaptic,
  useClipboardHasImage,
  useRecentMedia,
  useThemeContext,
} from './AttachmentSheetShared';

interface ListOption {
  key: string;
  label: string;
  subtitle: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  tint: string;
  onPress: () => void;
  onLongPress?: () => void;
}

const RAIL_HEIGHT = THUMB_SIZE + Spacing.md;

export function AttachmentSheetList({
  visible,
  onClose,
  onPickPhoto,
  onPickFile,
  onPasteImage,
  onTakeMedia,
  onTakeVideo,
  onAttachRecentAssets,
}: AttachmentSheetBaseProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const [openKey, setOpenKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { assets, status, requestPermission } = useRecentMedia(16);
  const clipboardHasImage = useClipboardHasImage(visible);

  // Animated height for the multi-select "Add N" bar
  const multiBarH = useSharedValue(0);
  const prevSelectedCount = useRef(0);

  useEffect(() => {
    if (visible) {
      setOpenKey((k) => k + 1);
      setSelectedIds(new Set());
    }
  }, [visible]);

  useEffect(() => {
    const count = selectedIds.size;
    if (count !== prevSelectedCount.current) {
      prevSelectedCount.current = count;
      multiBarH.value = withSpring(count > 0 ? 54 : 0, { damping: 22, stiffness: 220 });
    }
  }, [selectedIds.size, multiBarH]);

  const multiBarStyle = useAnimatedStyle(() => ({
    height: multiBarH.value,
    overflow: 'hidden',
  }));

  const handleClose = useCallback((): void => {
    onClose();
  }, [onClose]);

  const closeAfter = useCallback(
    (action: () => void): void => {
      handleClose();
      setTimeout(action, 80);
    },
    [handleClose],
  );

  const handleThumbPress = useCallback(
    (asset: ML.Asset): void => {
      if (selectedIds.size === 0) {
        // Instant single attach
        successHaptic();
        handleClose();
        setTimeout(() => {
          onAttachRecentAssets([asset]);
        }, 80);
      } else {
        // Toggle selection
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(asset.id)) {
            next.delete(asset.id);
          } else {
            next.add(asset.id);
          }
          return next;
        });
      }
    },
    [selectedIds.size, handleClose, onAttachRecentAssets],
  );

  const handleThumbLongPress = useCallback(
    (asset: ML.Asset): void => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.add(asset.id);
        return next;
      });
    },
    [],
  );

  const handleAddSelected = useCallback((): void => {
    const selected = assets.filter((a) => selectedIds.has(a.id));
    if (selected.length === 0) return;
    successHaptic();
    handleClose();
    setTimeout(() => {
      onAttachRecentAssets(selected);
    }, 80);
  }, [assets, selectedIds, handleClose, onAttachRecentAssets]);

  const showRecentsRail =
    status === 'granted' && assets.length > 0;
  // Only show the prompt once the permission status has been resolved (not during initial null state)
  const showPermissionPrompt =
    status !== null && status !== 'granted';

  const listOptions: ListOption[] = [
    {
      key: 'photos',
      label: 'Photos',
      subtitle: 'From your library',
      Icon: Images,
      tint: colors.accentBlue,
      onPress: () => { tapHaptic(); closeAfter(onPickPhoto); },
    },
    {
      key: 'camera',
      label: 'Camera',
      subtitle: 'Tap for photo · Hold to record',
      Icon: Camera,
      tint: colors.primary,
      onPress: () => { tapHaptic(); closeAfter(onTakeMedia); },
      onLongPress: () => { tapHaptic(); closeAfter(onTakeVideo); },
    },
    {
      key: 'files',
      label: 'Files',
      subtitle: 'Documents and downloads',
      Icon: FileText,
      tint: colors.warning,
      onPress: () => { tapHaptic(); closeAfter(onPickFile); },
    },
    ...(clipboardHasImage
      ? [
          {
            key: 'paste',
            label: 'Paste image',
            subtitle: 'From clipboard',
            Icon: ClipboardPaste,
            tint: colors.success,
            onPress: () => { tapHaptic(); closeAfter(onPasteImage); },
          } satisfies ListOption,
        ]
      : []),
  ];

  const renderThumb: ListRenderItem<ML.Asset> = useCallback(
    ({ item }) => (
      <RecentThumb
        asset={item}
        selected={selectedIds.has(item.id)}
        colors={colors}
        onPress={handleThumbPress}
        onLongPress={handleThumbLongPress}
      />
    ),
    [selectedIds, colors, handleThumbPress, handleThumbLongPress],
  );

  return (
    <BottomSheetShell visible={visible} onClose={onClose} colors={colors}>
      {/* Title */}
      <ShimmerTitle colors={colors} playKey={openKey} />

      {/* Recents rail */}
      {showRecentsRail && (
        <Animated.View
          entering={FadeInDown.delay(0).springify().damping(14).stiffness(160)}
          style={{ height: RAIL_HEIGHT, marginBottom: Spacing.xs }}
        >
          <FlatList
            horizontal
            data={assets}
            keyExtractor={(a) => a.id}
            renderItem={renderThumb}
            ListHeaderComponent={
              <View style={styles.railHead}>
                <CameraTile colors={colors} onPress={() => closeAfter(onTakeMedia)} />
              </View>
            }
            contentContainerStyle={styles.railContent}
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ width: Spacing.xs }} />}
          />
        </Animated.View>
      )}

      {/* Permission prompt */}
      {showPermissionPrompt && (
        <PermissionPrompt colors={colors} onRequest={() => void requestPermission()} />
      )}

      {/* Action rows card */}
      <View
        style={[
          styles.actionsCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        {listOptions.map((opt, idx) => (
          <Animated.View
            key={opt.key}
            entering={FadeInDown.delay(idx * 40).springify().damping(14).stiffness(160)}
          >
            <Pressable
              onPress={opt.onPress}
              onLongPress={opt.onLongPress}
              delayLongPress={350}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.muted },
              ]}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
            >
              <View style={[
                styles.iconBox,
                {
                  backgroundColor: colors.background,
                  borderColor: `${opt.tint}55`,
                  borderWidth: StyleSheet.hairlineWidth,
                },
              ]}>
                <opt.Icon size={14} color={opt.tint} strokeWidth={1.7} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>
                  {opt.label}
                </Text>
                <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]}>
                  {opt.subtitle}
                </Text>
              </View>
              <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={1.75} />
            </Pressable>
            {idx < listOptions.length - 1 && (
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
            )}
          </Animated.View>
        ))}
      </View>

      {/* Multi-select confirm bar */}
      <Animated.View style={multiBarStyle}>
        <Pressable
          onPress={handleAddSelected}
          style={({ pressed }) => [
            styles.addBar,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Add ${selectedIds.size} attachment${selectedIds.size !== 1 ? 's' : ''}`}
        >
          <Text style={[styles.addBarLabel, { color: colors.primaryForeground }]}>
            Add {selectedIds.size} attachment{selectedIds.size !== 1 ? 's' : ''}
          </Text>
        </Pressable>
      </Animated.View>
    </BottomSheetShell>
  );
}

const styles = StyleSheet.create({
  railHead: {
    paddingLeft: Spacing.md,
    paddingRight: Spacing.xs,
  },
  railContent: {
    paddingRight: Spacing.md,
    alignItems: 'center',
  },
  actionsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconBox: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  rowLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: FontSize.xs,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 12,
  },
  addBar: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    height: 42,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBarLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
