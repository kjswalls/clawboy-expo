import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
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
  ListPlus,
  Mic,
  Paperclip,
  Slash,
  Square,
} from 'lucide-react-native';

import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius } from '@/constants/theme';

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

interface InputBarActionBarProps {
  isThinking: boolean;
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
}

export function InputBarActionBar({
  isThinking,
  canSend,
  onSend,
  onStop,
  onPaperclip,
  onSlash,
  onCamera,
  isVoiceRecording = false,
  onMicPressIn,
  onMicPressOut,
}: InputBarActionBarProps): React.JSX.Element {
  const { colors } = useThemeContext();

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
        <Pressable onPress={onPaperclip} style={styles.actionIcon} hitSlop={8}>
          <Paperclip size={14} color={colors.mutedForeground} />
        </Pressable>
        <Text style={[styles.pipe, { color: colors.mutedForeground }]}>|</Text>
        <Pressable onPress={onSlash} style={styles.actionIcon} hitSlop={8}>
          <Slash size={14} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <View style={styles.actionRight}>
        <Pressable onPress={onCamera} style={styles.actionIcon} hitSlop={8}>
          <Camera size={14} color={colors.mutedForeground} />
        </Pressable>
        <Pressable
          onPressIn={onMicPressIn}
          onPressOut={onMicPressOut}
          style={styles.micWrapper}
          hitSlop={8}
          accessibilityLabel="Hold to record voice"
          accessibilityRole="button"
          accessibilityState={{ busy: isVoiceRecording }}
        >
          <Animated.View style={[styles.micPulse, { backgroundColor: colors.primary }, pulseStyle]} />
          <Mic size={14} color={isVoiceRecording ? colors.foreground : colors.mutedForeground} />
        </Pressable>
        {isThinking ? (
          <Pressable
            onPress={handleStop}
            style={styles.actionIcon}
            hitSlop={8}
            accessibilityLabel="Stop response"
            accessibilityRole="button"
          >
            <Square size={14} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
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
          accessibilityLabel={canSend ? 'Send message' : 'Send (disconnected)'}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
        >
          {canSend && isThinking ? (
            <LinearGradient
              colors={[colors.primary, colors.accentBlue]}
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
    fontSize: 13,
    lineHeight: 14,
    marginHorizontal: 0,
    opacity: 0.55,
  },
  sendBtn: {
    marginLeft: 4,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
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
