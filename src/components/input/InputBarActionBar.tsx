import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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

interface InputBarActionBarProps {
  isThinking: boolean;
  canSend: boolean;
  onSend: () => void;
  onStop?: () => void;
  onPaperclip: () => void;
  onSlash: () => void;
  onCamera: () => void;
  onMic: () => void;
}

export function InputBarActionBar({
  isThinking,
  canSend,
  onSend,
  onStop,
  onPaperclip,
  onSlash,
  onCamera,
  onMic,
}: InputBarActionBarProps): React.JSX.Element {
  const { colors } = useThemeContext();

  return (
    <View style={[styles.actionBar, { borderTopColor: colors.border + '80' }]}>
      <View style={styles.actionLeft}>
        <Pressable onPress={onPaperclip} style={styles.actionIcon} hitSlop={8}>
          <Paperclip size={14} color={colors.mutedForeground} />
        </Pressable>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Pressable onPress={onSlash} style={styles.actionIcon} hitSlop={8}>
          <Slash size={14} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <View style={styles.actionRight}>
        <Pressable onPress={onCamera} style={styles.actionIcon} hitSlop={8}>
          <Camera size={14} color={colors.mutedForeground} />
        </Pressable>
        <Pressable onPress={onMic} style={styles.actionIcon} hitSlop={8}>
          <Mic size={14} color={colors.mutedForeground} />
        </Pressable>
        {isThinking ? (
          <Pressable onPress={onStop} style={styles.actionIcon} hitSlop={8}>
            <Square size={14} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendBtn,
            !canSend && { backgroundColor: colors.muted },
            canSend && !isThinking && { backgroundColor: colors.foreground, opacity: pressed ? 0.9 : 1 },
            canSend && isThinking && { backgroundColor: 'transparent' },
          ]}
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
            <View style={styles.sendInner}>
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
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
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
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 14,
    marginHorizontal: 2,
  },
  sendBtn: {
    marginLeft: 4,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendGradient: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendInner: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
