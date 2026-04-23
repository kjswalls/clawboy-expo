import React from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputContentSizeChangeEvent } from 'react-native';

import type { ConnectionDotStatus } from '@/components/common/ConnectionStatus';
import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

import { InputBarActionBar } from './InputBarActionBar';
import { InputBarAttachmentPreviews } from './InputBarAttachmentPreviews';
import { InputBarInfoRow } from './InputBarInfoRow';
import type { InputAttachment } from './types';

const MAX_INPUT_HEIGHT = 120;

interface InputBarCardProps {
  value: string;
  onChangeText: (text: string) => void;
  inputHeight: number;
  setInputHeight: (h: number) => void;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  inputRef: React.RefObject<TextInput | null>;
  isThinking: boolean;
  disabled: boolean;
  attachments: InputAttachment[];
  onRemoveAttachment: (id: string) => void;
  connectionStatus: ConnectionDotStatus;
  selectedAgent?: string;
  selectedModel?: string;
  contextUsed: number;
  contextTotal: number;
  onStop?: () => void;
  onSend: () => void;
  onPaperclip: () => void;
  onSlash: () => void;
  onCamera: () => void;
  onMic: () => void;
}

export function InputBarCard({
  value,
  onChangeText,
  inputHeight,
  setInputHeight,
  isFocused,
  onFocus,
  onBlur,
  inputRef,
  isThinking,
  disabled,
  attachments,
  onRemoveAttachment,
  connectionStatus,
  selectedAgent,
  selectedModel,
  contextUsed,
  contextTotal,
  onStop,
  onSend,
  onPaperclip,
  onSlash,
  onCamera,
  onMic,
}: InputBarCardProps): React.JSX.Element {
  const { colors } = useThemeContext();

  const placeholder = isThinking
    ? 'Queue a follow-up message ...'
    : 'Ask anything, @models, /prompts ...';

  const hasContent = value.trim().length > 0 || attachments.length > 0;
  const canSend = hasContent && !disabled;

  const onContentSizeChange = (e: TextInputContentSizeChangeEvent): void => {
    const h = Math.min(e.nativeEvent.contentSize.height, MAX_INPUT_HEIGHT);
    setInputHeight(Math.max(44, h));
  };

  return (
    <View
      style={[
        styles.cardOuter,
        {
          zIndex: 1,
          borderColor: isThinking
            ? 'transparent'
            : isFocused
              ? 'rgba(245,245,245,0.3)'
              : colors.border,
          backgroundColor: colors.secondary,
        },
      ]}
    >
      <View style={[styles.inputSurface, { backgroundColor: colors.secondary }]}>
        <InputBarAttachmentPreviews
          attachments={attachments}
          onRemoveAttachment={onRemoveAttachment}
        />

        <Pressable onPress={() => inputRef.current?.focus()} style={styles.textTap}>
          <View style={styles.textWrap}>
            <TextInput
              ref={inputRef}
              value={value}
              onChangeText={onChangeText}
              onFocus={onFocus}
              onBlur={onBlur}
              onContentSizeChange={onContentSizeChange}
              placeholder={placeholder}
              placeholderTextColor={colors.mutedForeground}
              multiline
              blurOnSubmit={false}
              editable={!disabled}
              style={[
                styles.textInput,
                {
                  color: colors.foreground,
                  height: inputHeight,
                  maxHeight: MAX_INPUT_HEIGHT,
                },
              ]}
              textAlignVertical="top"
            />
          </View>
        </Pressable>
        <View style={[styles.bottomSection, { borderTopColor: colors.mutedForeground + '4D' }]}>
          <InputBarActionBar
            isThinking={isThinking}
            canSend={canSend}
            onSend={onSend}
            onStop={onStop}
            onPaperclip={onPaperclip}
            onSlash={onSlash}
            onCamera={onCamera}
            onMic={onMic}
          />

          <InputBarInfoRow
            selectedAgent={selectedAgent}
            selectedModel={selectedModel}
            connectionStatus={connectionStatus}
            contextUsed={contextUsed}
            contextTotal={contextTotal}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    borderRadius: BorderRadius['2xl'],
    borderWidth: 1,
    overflow: 'hidden',
  },
  inputSurface: {
    overflow: 'hidden',
  },
  textTap: {
    minHeight: 44,
  },
  textWrap: {
    position: 'relative',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  bottomSection: {
    borderTopWidth: 1,
  },
  textInput: {
    fontSize: FontSize.base,
    lineHeight: 20,
    padding: 0,
  },
});
