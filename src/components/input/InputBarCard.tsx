import React, { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Device from 'expo-device';
import { TextInputWrapper } from 'expo-paste-input';
import type { PasteEventPayload } from 'expo-paste-input';

import type { ConnectionDotStatus } from '@/components/common/ConnectionStatus';
import { useThemeContext } from '@/contexts/ThemeContext';
import { useTokens } from '@/hooks/useTokens';
import type { TokenSet } from '@/hooks/useTokens';
import { BorderRadius } from '@/constants/theme';
import { useTranslation } from 'react-i18next';

import { InputBarActionBar } from './InputBarActionBar';
import { InputBarAttachmentPreviews } from './InputBarAttachmentPreviews';
import { InputBarInfoRow } from './InputBarInfoRow';
import type { InputAttachment } from './types';

// expo-paste-input's ExpoPasteInputView calls UITextView.supportsAdaptiveImageGlyph
// during native mount (didAddSubview -> startMonitoring -> enhanceTextInput).
// On the iOS Simulator that getter dispatches a synchronous pasteboard XPC
// (_supportsImagePasteCached -> PBServerConnection localGeneralPasteboard...),
// which can hang the main thread for >5s and trip the iOS launch / scene-update
// watchdogs (8badf00d). Real devices don't exhibit this. We therefore only mount
// the paste wrapper on real iOS hardware.
const ENABLE_PASTE_WRAPPER = Platform.OS === 'ios' && Device.isDevice;

interface InputBarCardProps {
  /** Initial text for the uncontrolled TextInput. Changes here are ignored
   *  after mount; use the parent's setTextProgrammatic for imperative edits. */
  defaultValue: string;
  /** Current text mirrored from the controller — used only for local
   *  derivations (send-button state). Not fed back into the TextInput. */
  text: string;
  onTextChange: (text: string) => void;
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
  annotationCount?: number;
}

function createStyles(tk: TokenSet) {
  return StyleSheet.create({
    cardOuter: {
      borderRadius: BorderRadius['2xl'],
      borderWidth: 1,
      overflow: 'hidden' as const,
    },
    inputSurface: {
      overflow: 'hidden' as const,
    },
    textTap: {
      minHeight: tk.minTouch,
    },
    textWrap: {
      position: 'relative' as const,
      paddingHorizontal: tk.sp.lg,
      paddingTop: tk.sp.md,
      paddingBottom: tk.sp.sm,
    },
    bottomSection: {
      borderTopWidth: 1,
    },
    textInput: {
      fontSize: tk.fs.base,
      padding: 0,
    },
  });
}

function lineHeightFromTokens(tk: TokenSet): number {
  return Math.round(tk.fs.base * 1.35);
}

export function InputBarCard({
  defaultValue,
  text,
  onTextChange,
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
  annotationCount,
}: InputBarCardProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation();
  const { height: winH } = useWindowDimensions();
  const minInputHeight = lineHeightFromTokens(tokens);
  const maxInputHeight = Math.max(160, Math.min(winH * 0.32, 320));

  // lineHeight must match on both the mirror <Text> and the <TextInput>.
  // iOS UITextView uses its own font-metric for line height unless told
  // explicitly; without this the mirror and the input diverge per line.
  const lineHeight = Math.round(tokens.fs.base * 1.35);

  const [measuredHeight, setMeasuredHeight] = useState(minInputHeight);

  const placeholder = isThinking
    ? t('input.placeholder.thinking')
    : t('input.placeholder.default');

  const hasContent =
    text.trim().length > 0 ||
    attachments.length > 0 ||
    (annotationCount ?? 0) > 0;
  const canSend = hasContent && !disabled;

  const textField = (
    <TextInput
      ref={inputRef}
      defaultValue={defaultValue}
      onChangeText={onTextChange}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      placeholderTextColor={colors.mutedForeground}
      multiline
      blurOnSubmit={false}
      style={[
        styles.textInput,
        {
          color: colors.foreground,
          lineHeight,
          height: measuredHeight,
          maxHeight: maxInputHeight,
        },
      ]}
      textAlignVertical="top"
      scrollEnabled
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
            {/* Hidden mirror — measures wrap-adjusted text height via onLayout.
                onContentSizeChange on uncontrolled multiline TextInput is
                unreliable on iOS Fabric (RN 0.83). Text.onLayout fires
                reliably after every re-render that changes children. */}
            <Text
              aria-hidden
              pointerEvents="none"
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                setMeasuredHeight(Math.min(Math.max(h, minInputHeight), maxInputHeight));
              }}
              style={[
                styles.textInput,
                {
                  lineHeight,
                  color: 'transparent',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                },
              ]}
            >
              {text.length === 0 ? ' ' : text}
            </Text>
            {ENABLE_PASTE_WRAPPER ? (
              <TextInputWrapper onPaste={onPaste}>{textField}</TextInputWrapper>
            ) : (
              textField
            )}
          </View>
        </Pressable>
        <View style={[styles.bottomSection, { borderTopColor: colors.border }]}>
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
            annotationCount={annotationCount}
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

