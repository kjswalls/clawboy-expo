import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  FadeIn,
  FadeOut,
  interpolate,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import {
  ArrowUp,
  Camera,
  ChevronRight,
  ListPlus,
  Loader,
  Mic,
  Paperclip,
  Pencil,
  Pin,
  RotateCcw,
  Slash,
  Square,
} from 'lucide-react-native';

import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize } from '@/constants/theme';
import { useActionBarPins } from '@/hooks/useActionBarPins';
import { useTranslation } from 'react-i18next';

function hapticLight(): void {
  if (Platform.OS !== 'web') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

function hapticMedium(): void {
  if (Platform.OS !== 'web') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
}

/**
 * All commands that live in the expandable section. Slash is included so it
 * can be pinned/unpinned like any other command (pinned by default via
 * useActionBarPins).
 */
const EXPANDABLE_COMMANDS = [
  { id: 'slash', Icon: Slash },
  { id: 'reset', Icon: RotateCcw },
  { id: 'compact', Icon: Loader },
] as const;

type ExpandableCommandId = (typeof EXPANDABLE_COMMANDS)[number]['id'];

// ── ExpandableButton ──────────────────────────────────────────────────────────

interface ExpandableButtonProps {
  id: ExpandableCommandId;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  isPinned: boolean;
  /** When true, the pin status glyph is rendered. */
  showPinGlyph: boolean;
  /**
   * When true, tapping the button toggles its pin instead of triggering the
   * command handler. Icon tints to primary color as a visual cue.
   */
  isEditing: boolean;
  onTrigger: () => void;
  onTogglePin: () => void;
  colors: ReturnType<typeof useThemeContext>['colors'];
}

function ExpandableButton({
  id,
  Icon,
  isPinned,
  showPinGlyph,
  isEditing,
  onTrigger,
  onTogglePin,
  colors,
}: ExpandableButtonProps): React.JSX.Element {
  const { t } = useTranslation();
  // Scale the pin glyph up slightly in edit mode so it reads as "tappable".
  const pinScale = useSharedValue(1);

  useEffect(() => {
    pinScale.value = withTiming(isEditing ? 1.4 : 1, { duration: 150 });
  }, [isEditing, pinScale]);

  const pinGlyphStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pinScale.value }],
  }));

  const handlePress = useCallback((): void => {
    hapticLight();
    if (isEditing) {
      onTogglePin();
    } else {
      onTrigger();
    }
  }, [isEditing, onTogglePin, onTrigger]);

  const iconColor = colors.mutedForeground;

  return (
    <View style={styles.expandableButtonWrapper}>
      <Pressable
        onPress={handlePress}
        style={styles.actionIcon}
        accessibilityLabel={isEditing ? (isPinned ? t('input.actionBar.unpin', { id }) : t('input.actionBar.pin', { id })) : id}
        accessibilityRole="button"
      >
        <Icon size={14} color={iconColor} />
      </Pressable>
      {showPinGlyph ? (
        // Non-interactive — purely a status indicator. Animated scale in edit mode.
        <Animated.View style={[styles.pinGlyph, pinGlyphStyle]} pointerEvents="none">
          <Pin
            size={8}
            color={
              isPinned
                ? (isEditing ? colors.primary : colors.mutedForeground)
                : colors.mutedForeground + '70'
            }
            fill={
              isPinned
                ? (isEditing ? colors.primary : colors.mutedForeground)
                : 'transparent'
            }
            strokeWidth={2.5}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

// ── InputBarActionBar ─────────────────────────────────────────────────────────

interface InputBarActionBarProps {
  isThinking: boolean;
  /** When true, the stop button is shown. Defaults to `isThinking` if omitted. */
  canStop?: boolean;
  canSend: boolean;
  onSend: () => void;
  onStop?: () => void;
  onPaperclip: () => void;
  onSlash: () => void;
  onCamera: () => void;
  /** Press-and-hold to record voice (native). */
  isVoiceRecording?: boolean;
  onMicPressIn?: () => void;
  onMicPressOut?: () => void;
  onReset?: () => void;
  onCompact?: () => void;
  /** Number of pending annotation replies — shows a badge on the send button. */
  annotationCount?: number;
}

export function InputBarActionBar({
  isThinking,
  canStop,
  canSend,
  onSend,
  onStop,
  onPaperclip,
  onSlash,
  onCamera,
  isVoiceRecording = false,
  onMicPressIn,
  onMicPressOut,
  onReset,
  onCompact,
  annotationCount = 0,
}: InputBarActionBarProps): React.JSX.Element {
  const showStop = canStop ?? isThinking;
  const { colors } = useThemeContext();
  const { t } = useTranslation();
  const { pinnedIds, togglePin } = useActionBarPins();

  // ── Voice recording pulse ─────────────────────────────────────────────────
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);

  useEffect(() => {
    if (isVoiceRecording) {
      pulseOpacity.value = 0.45;
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.25, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
      pulseScale.value = withTiming(1, { duration: 150 });
      pulseOpacity.value = withTiming(0, { duration: 150 });
    }
  }, [isVoiceRecording, pulseScale, pulseOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  // ── Expand / collapse + edit mode ─────────────────────────────────────────
  const expandedAnim = useSharedValue(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const toggleExpanded = useCallback((): void => {
    hapticLight();
    const next = !isExpanded;
    setIsExpanded(next);
    if (!next) setIsEditing(false);
    expandedAnim.value = withTiming(next ? 1 : 0, { duration: 200 });
  }, [isExpanded, expandedAnim]);

  const toggleEditing = useCallback((): void => {
    hapticLight();
    setIsEditing((prev) => !prev);
  }, []);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(expandedAnim.value, [0, 1], [0, 90])}deg` }],
  }));

  // expandedAnim still drives the chevron rotation; expanded items now mount/unmount.

  // ── Command dispatch ───────────────────────────────────────────────────────
  const commandHandlers: Record<ExpandableCommandId, () => void> = {
    slash: onSlash,
    reset: onReset ?? (() => {}),
    compact: onCompact ?? (() => {}),
  };

  const pinnedCommands = EXPANDABLE_COMMANDS.filter((c) => pinnedIds.has(c.id));
  const unpinnedCommands = EXPANDABLE_COMMANDS.filter((c) => !pinnedIds.has(c.id));

  // ── Send / stop ───────────────────────────────────────────────────────────
  const handleSend = useCallback((): void => {
    if (canSend) hapticLight();
    onSend();
  }, [canSend, onSend]);

  const handleStop = useCallback((): void => {
    hapticMedium();
    onStop?.();
  }, [onStop]);

  return (
    <View style={styles.actionBar}>
      <View style={styles.actionLeft}>
        {/* Paperclip — not expandable, always visible */}
        <Pressable onPress={onPaperclip} style={styles.actionIcon} hitSlop={8}>
          <Paperclip size={14} color={colors.mutedForeground} />
        </Pressable>
        <Text style={[styles.pipe, { color: colors.mutedForeground }]}>|</Text>

        {/* Pinned commands — always visible, show pin glyph when expanded */}
        {pinnedCommands.map(({ id, Icon }) => (
          <ExpandableButton
            key={id}
            id={id}
            Icon={Icon}
            isPinned
            showPinGlyph={isExpanded}
            isEditing={isEditing}
            onTrigger={commandHandlers[id]}
            onTogglePin={() => { togglePin(id); }}
            colors={colors}
          />
        ))}

        {/* Unpinned commands + edit button — mounted only when expanded */}
        {isExpanded ? (
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(140)}
            style={styles.expandedItems}
          >
            {unpinnedCommands.map(({ id, Icon }) => (
              <ExpandableButton
                key={id}
                id={id}
                Icon={Icon}
                isPinned={false}
                showPinGlyph
                isEditing={isEditing}
                onTrigger={commandHandlers[id]}
                onTogglePin={() => { togglePin(id); }}
                colors={colors}
              />
            ))}

            {/* Edit / pin-mode toggle — visually demoted as a meta-control */}
            <Text style={[styles.pipe, { color: colors.mutedForeground }]}>|</Text>
            <Pressable
              onPress={toggleEditing}
              style={[styles.editButton, { backgroundColor: colors.mutedForeground + '24' }]}
              accessibilityLabel={isEditing ? t('input.actionBar.exitEditMode') : t('input.actionBar.enterEditMode')}
              accessibilityRole="button"
            >
              <Pencil
                size={12}
                color={isEditing ? colors.primary : colors.mutedForeground + '70'}
                strokeWidth={2.5}
              />
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Chevron — always visible; rotates on expand, slides with layout */}
        <Animated.View layout={LinearTransition.duration(200)}>
          <Pressable
            onPress={toggleExpanded}
            style={styles.actionIcon}
            hitSlop={{ top: 8, bottom: 8, right: 8, left: 0 }}
            accessibilityLabel={isExpanded ? t('input.actionBar.collapseCommands') : t('input.actionBar.expandCommands')}
            accessibilityRole="button"
          >
            <Animated.View style={chevronStyle}>
              <ChevronRight size={14} color={colors.mutedForeground + '70'} />
            </Animated.View>
          </Pressable>
        </Animated.View>
      </View>

      {/* ── Right side ────────────────────────────────────────────────────── */}
      <View style={styles.actionRight}>
        <Pressable onPress={onCamera} style={styles.actionIcon} hitSlop={8}>
          <Camera size={14} color={colors.mutedForeground} />
        </Pressable>
        <Pressable
          onPressIn={onMicPressIn}
          onPressOut={onMicPressOut}
          style={styles.micWrapper}
          hitSlop={8}
          accessibilityLabel={t('input.actionBar.holdToRecord')}
          accessibilityRole="button"
          accessibilityState={{ busy: isVoiceRecording }}
        >
          <Animated.View style={[styles.micPulse, { backgroundColor: colors.primary }, pulseStyle]} />
          <Mic size={14} color={isVoiceRecording ? colors.foreground : colors.mutedForeground} />
        </Pressable>
        {showStop ? (
          <Pressable
            onPress={handleStop}
            style={styles.actionIcon}
            hitSlop={8}
            accessibilityLabel={t('input.actionBar.stopResponse')}
            accessibilityRole="button"
          >
            <Square size={14} color={colors.foreground} />
          </Pressable>
        ) : null}
        <View style={styles.sendWrap}>
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            style={({ pressed }) => [
              styles.sendBtn,
              !canSend && {
                backgroundColor: colors.mutedForeground + '24',
                opacity: 0.4,
              },
              canSend && !isThinking && { backgroundColor: colors.foreground, opacity: pressed ? 0.9 : 1 },
              canSend && isThinking && { backgroundColor: 'transparent' },
            ]}
            accessibilityLabel={canSend ? t('input.actionBar.sendMessage') : t('input.actionBar.sendDisconnected')}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend }}
          >
            {canSend && isThinking ? (
              <LinearGradient
                colors={[colors.primary, colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendGradient}
              >
                <ListPlus size={14} color={colors.primaryForeground} strokeWidth={2.5} />
              </LinearGradient>
            ) : (
              <View
                style={[
                  styles.sendInner,
                  !canSend && { backgroundColor: 'transparent' },
                  canSend && !isThinking && { backgroundColor: 'transparent' },
                ]}
              >
                <ArrowUp
                  size={14}
                  color={canSend ? colors.background : colors.mutedForeground}
                  strokeWidth={2.5}
                />
              </View>
            )}
          </Pressable>
          {annotationCount > 0 ? (
            <View
              style={[styles.annotationBadge, { backgroundColor: colors.primary }]}
              pointerEvents="none"
            >
              <Text style={[styles.annotationBadgeText, { color: colors.primaryForeground }]}>
                {annotationCount > 9 ? '9+' : String(annotationCount)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  actionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionIcon: {
    padding: 8,
    borderRadius: BorderRadius.sm,
  },
  expandableButtonWrapper: {
    position: 'relative',
  },
  pinGlyph: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
    // Non-interactive (pointerEvents="none" set on the Animated.View)
  },
  expandedItems: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editButton: {
    padding: 8,
    marginLeft: 8,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micWrapper: {
    padding: 8,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micPulse: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  pipe: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm + 1,
    marginHorizontal: 0,
    opacity: 0.55,
  },
  sendWrap: {
    marginLeft: 4,
    position: 'relative',
  },
  sendBtn: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  annotationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  annotationBadgeText: {
    fontSize: 9,
    fontWeight: '700' as const,
    lineHeight: 12,
  },
  sendGradient: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendInner: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
