import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputContentSizeChangeEvent,
} from 'react-native';
import * as Device from 'expo-device';
import { TextInputWrapper } from 'expo-paste-input';
import type { PasteEventPayload } from 'expo-paste-input';

import type { ConnectionDotStatus } from '@/components/common/ConnectionStatus';
import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { useTranslation } from 'react-i18next';

import { InputBarActionBar } from './InputBarActionBar';
import { InputBarAttachmentPreviews } from './InputBarAttachmentPreviews';
import { InputBarInfoRow } from './InputBarInfoRow';
import type { InputAttachment } from './types';

const MAX_INPUT_HEIGHT = 120;

// expo-paste-input's ExpoPasteInputView calls UITextView.supportsAdaptiveImageGlyph
// during native mount (didAddSubview -> startMonitoring -> enhanceTextInput).
// On the iOS Simulator that getter dispatches a synchronous pasteboard XPC
// (_supportsImagePasteCached -> PBServerConnection localGeneralPasteboard...),
// which can hang the main thread for >5s and trip the iOS launch / scene-update
// watchdogs (8badf00d). Real devices don't exhibit this. We therefore only mount
// the paste wrapper on real iOS hardware.
const ENABLE_PASTE_WRAPPER = Platform.OS === 'ios' && Device.isDevice;

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
  modelSupportsImageInput?: boolean;
  modelSupportsAudioInput?: boolean;
  connectionStatus: ConnectionDotStatus;
  selectedAgent?: string;
  selectedModel?: string;
  contextUsed?: number;
  contextTotal?: number;
  onPressContext?: () => void;
  onStop?: () => void;
  canStop?: boolean;
  onSend: () => void;
  onPaperclip: () => void;
  onSlash: () => void;
  onCamera: () => void;
  isVoiceRecording?: boolean;
  onMicPressIn?: () => void;
  onMicPressOut?: () => void;
  onPaste?: (payload: PasteEventPayload) => void;
  onReset?: () => void;
  onCompact?: () => void;
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
  modelSupportsImageInput,
  modelSupportsAudioInput,
  connectionStatus,
  selectedAgent,
  selectedModel,
  contextUsed,
  contextTotal,
  onPressContext,
  onStop,
  canStop,
  onSend,
  onPaperclip,
  onSlash,
  onCamera,
  isVoiceRecording,
  onMicPressIn,
  onMicPressOut,
  onPaste,
  onReset,
  onCompact,
}: InputBarCardProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const { t } = useTranslation();

  const placeholder = isThinking
    ? t('input.placeholder.thinking')
    : connectionStatus === 'disconnected'
      ? t('input.placeholder.disconnected')
      : connectionStatus === 'connecting'
        ? t('input.placeholder.connecting')
        : t('input.placeholder.default');

  const hasContent = value.trim().length > 0 || attachments.length > 0;
  const canSend = hasContent && !disabled;

  const onContentSizeChange = (e: TextInputContentSizeChangeEvent): void => {
    const h = Math.min(e.nativeEvent.contentSize.height, MAX_INPUT_HEIGHT);
    setInputHeight(Math.max(44, h));
  };

  const textField = (
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
  );

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
          modelSupportsImageInput={modelSupportsImageInput}
          modelSupportsAudioInput={modelSupportsAudioInput}
        />

        <Pressable onPress={() => inputRef.current?.focus()} style={styles.textTap}>
          <View style={styles.textWrap}>
            {ENABLE_PASTE_WRAPPER ? (
              <TextInputWrapper onPaste={onPaste}>{textField}</TextInputWrapper>
            ) : (
              textField
            )}
          </View>
        </Pressable>
        <View style={[styles.bottomSection, { borderTopColor: colors.mutedForeground + '4D' }]}>
          <InputBarActionBar
            isThinking={isThinking}
            canStop={canStop}
            canSend={canSend}
            onSend={onSend}
            onStop={onStop}
            onPaperclip={onPaperclip}
            onSlash={onSlash}
            onCamera={onCamera}
            isVoiceRecording={isVoiceRecording}
            onMicPressIn={onMicPressIn}
            onMicPressOut={onMicPressOut}
            onReset={onReset}
            onCompact={onCompact}
          />

          <InputBarInfoRow
            selectedAgent={selectedAgent}
            selectedModel={selectedModel}
            connectionStatus={connectionStatus}
            contextUsed={contextUsed}
            contextTotal={contextTotal}
            onPressContext={onPressContext}
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
