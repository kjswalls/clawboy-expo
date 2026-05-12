import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { ImagePlus, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type * as MediaLibrary from 'expo-media-library';

import { useTheme } from '@/hooks/useTheme';
import {
  RecentThumb,
  THUMB_SIZE,
} from '@/components/input/attachmentSheet/AttachmentSheetShared';
import { FEEDBACK_SCREENSHOT_MAX_COUNT } from '@/lib/feedback/prepareFeedbackScreenshots';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ScreenshotItem } from './feedbackHelpers';
import type { AnimatedStyle } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

type Props = {
  screenshots: ScreenshotItem[];
  recentAssets: MediaLibrary.Asset[];
  selectedIds: Set<string>;
  permissionStatus: MediaLibrary.PermissionStatus | null;
  multiBarStyle: AnimatedStyle<ViewStyle>;
  onAddFromLibrary: () => void;
  onRequestPermission: () => void;
  onRecentPress: (asset: MediaLibrary.Asset) => void;
  onRecentLongPress: (asset: MediaLibrary.Asset) => void;
  onAddSelected: () => void;
  onRemoveScreenshot: (id: string) => void;
};

export function FeedbackScreenshotRail({
  screenshots,
  recentAssets,
  selectedIds,
  permissionStatus,
  multiBarStyle,
  onAddFromLibrary,
  onRequestPermission,
  onRecentPress,
  onRecentLongPress,
  onAddSelected,
  onRemoveScreenshot,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const remainingSlots = FEEDBACK_SCREENSHOT_MAX_COUNT - screenshots.length;
  const permGranted = permissionStatus === 'granted';
  const showPermissionTile = permissionStatus !== null && !permGranted;

  return (
    <>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('feedback.sectionScreenshots')}</Text>

      {/* Security notice — feedback-003 */}
      <Text style={[styles.screenshotWarning, { color: colors.mutedForeground }]}>
        {t('feedback.screenshotWarning')}
      </Text>

      {/* Already-attached thumbnails */}
      {screenshots.length > 0 ? (
        <View style={styles.screenshotRow}>
          {screenshots.map((s) => (
            <View key={s.id} style={styles.screenshotThumb}>
              <Image source={{ uri: s.uri }} style={styles.screenshotImg} />
              <Pressable
                onPress={() => onRemoveScreenshot(s.id)}
                style={[styles.screenshotRemove, { backgroundColor: colors.background }]}
                hitSlop={6}
                accessibilityLabel={t('feedback.removeScreenshot')}
              >
                <X size={10} color={colors.foreground} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {/* Screenshots rail — always visible when slots remain */}
      {remainingSlots > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.rail}
          contentContainerStyle={styles.railContent}
        >
          {/* Library tile is always first */}
          <Pressable
            onPress={onAddFromLibrary}
            style={({ pressed }) => [
              styles.railTile,
              { borderColor: colors.border, backgroundColor: colors.card },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel={t('feedback.openLibrary')}
          >
            <ImagePlus size={18} color={colors.mutedForeground} />
            <Text style={{ fontSize: FontSize.xs, color: colors.mutedForeground, marginTop: 4 }}>
              {t('feedback.libraryLabel')}
            </Text>
          </Pressable>

          {/* Recent screenshot thumbs when permission is granted */}
          {permGranted && recentAssets.map((asset) => (
            <React.Fragment key={asset.id}>
              <View style={{ width: Spacing.xs }} />
              <RecentThumb
                asset={asset}
                selected={selectedIds.has(asset.id)}
                colors={colors}
                onPress={onRecentPress}
                onLongPress={onRecentLongPress}
              />
            </React.Fragment>
          ))}

          {/* Recents unlock tile when permission status is known but not granted */}
          {showPermissionTile ? (
            <>
              <View style={{ width: Spacing.xs }} />
              <Pressable
                onPress={onRequestPermission}
                style={({ pressed }) => [
                  styles.railTile,
                  { borderColor: `${colors.primary}40`, backgroundColor: `${colors.primary}0C` },
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityLabel={t('feedback.allowRecents')}
              >
                <ImagePlus size={18} color={colors.primary} />
                <Text style={{ fontSize: FontSize.xs, color: colors.primary, marginTop: 4, textAlign: 'center' }}>
                  {t('feedback.recentsLabel')}
                </Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      ) : null}

      {/* Multi-select confirm bar */}
      <Animated.View style={multiBarStyle}>
        <Pressable
          onPress={onAddSelected}
          style={({ pressed }) => [
            styles.multiBar,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t(selectedIds.size === 1 ? 'feedback.addScreenshots_one' : 'feedback.addScreenshots_other', { count: selectedIds.size })}
        >
          <Text style={[styles.multiBarLabel, { color: colors.primaryForeground }]}>
            {t(selectedIds.size === 1 ? 'feedback.addScreenshots_one' : 'feedback.addScreenshots_other', { count: selectedIds.size })}
          </Text>
        </Pressable>
      </Animated.View>

      {screenshots.length > 0 ? (
        <Text style={[styles.screenshotHint, { color: colors.mutedForeground }]}>
          {remainingSlots > 0
            ? t(remainingSlots === 1 ? 'feedback.slotsRemaining_one' : 'feedback.slotsRemaining_other', { count: remainingSlots })
            : t('feedback.maxScreenshots')}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: FontSize.xs, fontWeight: '500', marginBottom: 6, marginTop: Spacing.md },
  screenshotWarning: {
    fontSize: FontSize.xs,
    marginBottom: 10,
    lineHeight: 16,
  },
  screenshotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  screenshotThumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  screenshotImg: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: BorderRadius.md,
  },
  screenshotRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rail: {
    marginHorizontal: -Spacing.md,
  },
  railContent: {
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    gap: 0,
  },
  railTile: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenshotHint: {
    fontSize: FontSize.xs,
    marginTop: 6,
  },
  multiBar: {
    marginTop: Spacing.sm,
    height: 42,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiBarLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
