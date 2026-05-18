import React, { useCallback, useMemo, useState } from 'react';
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
import { useExperiments } from '@/contexts/ExperimentsContext';
import { useTranslation } from 'react-i18next';
import { recordDictationTick } from '@/lib/dictationProbe';

import { CollapseWhen } from '@/components/common/CollapseWhen';
import { useIsAnnotationFocusActive } from '@/contexts/AnnotationDraftContext';

import { InputBarActionBar } from './InputBarActionBar';
import { InputBarAnnotationStrip } from './InputBarAnnotationStrip';
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
  annotationTargetMode?: boolean;
  onCyclePrevAnnotations?: () => void;
  onCycleAnnotations?: () => void;
  onPreviewAnnotations?: () => void;
  onClearAnnotations?: () => void;
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
  annotationTargetMode = false,
  onCyclePrevAnnotations,
  onCycleAnnotations,
  onPreviewAnnotations,
  onClearAnnotations,
}: InputBarCardProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation();
  const { height: winH } = useWindowDimensions();
  const { skipPasteWrapper, useIntrinsicHeight, stableProps, logDictation } = useExperiments();
  const focusModeActive = useIsAnnotationFocusActive();
  const minInputHeight = lineHeightFromTokens(tokens) * 2;
  const maxInputHeight = Math.max(160, Math.min(winH * 0.32, 320));

  // lineHeight must match on both the mirror <Text> and the <TextInput>.
  // iOS UITextView uses its own font-metric for line height unless told
  // explicitly; without this the mirror and the input diverge per line.
  const lineHeight = Math.round(tokens.fs.base * 1.35);

  const [measuredHeight, setMeasuredHeight] = useState(minInputHeight);
  const useMirrorHeight = !useIntrinsicHeight;
  const USE_IOS_PASTE_WRAPPER = ENABLE_PASTE_WRAPPER && !skipPasteWrapper;

  // Stable memoized version (IOS_INPUT_STABLE_PROPS path) — always called to
  // satisfy Rules of Hooks; only used as the active handler when stableProps=true.
  const stableHandleTextChange = useCallback((next: string) => {
    if (logDictation) {
      recordDictationTick(next);
    }
    onTextChange(next);
  }, [logDictation, onTextChange]);

  const handleTextChange = stableProps
    ? stableHandleTextChange
    : (next: string) => {
        if (logDictation) {
          recordDictationTick(next);
        }
        onTextChange(next);
      };

  const placeholder = annotationTargetMode
    ? t('chat.annotate.writeComment')
    : isThinking
      ? t('input.placeholder.thinking')
      : t('input.placeholder.default');

  const hasContent = annotationTargetMode
    ? text.trim().length > 0
    : (text.trim().length > 0 || attachments.length > 0 || (annotationCount ?? 0) > 0);
  const canSend = hasContent && !disabled;

  // Stable memoized style — always computed, used when stableProps=true.
  // measuredHeight dep drops out when useIntrinsicHeight=true, making the
  // ref fully stable across keystrokes in that combined configuration.
  const stableStyle = useMemo(() => [
    styles.textInput,
    {
      color: colors.foreground,
      lineHeight,
      maxHeight: maxInputHeight,
      ...(useMirrorHeight
        ? { height: measuredHeight }
        : { minHeight: minInputHeight }),
    },
  ], [styles.textInput, colors.foreground, lineHeight, maxInputHeight, useMirrorHeight, measuredHeight, minInputHeight]);

  // Stable memoized textField element — avoids handing a new element reference
  // to the native UITextView on every keystroke when stableProps=true.
  const stableTextField = useMemo(() => (
    <TextInput
      ref={inputRef}
      defaultValue={defaultValue}
      onChangeText={stableHandleTextChange}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      placeholderTextColor={colors.mutedForeground}
      multiline
      blurOnSubmit={false}
      style={stableStyle}
      textAlignVertical="top"
      scrollEnabled
      accessibilityLabel={placeholder}
    />
  ), [inputRef, defaultValue, stableHandleTextChange, onFocus, onBlur, placeholder, colors.mutedForeground, stableStyle]);

  const textField = stableProps ? stableTextField : (
    <TextInput
      ref={inputRef}
      defaultValue={defaultValue}
      onChangeText={handleTextChange}
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
          maxHeight: maxInputHeight,
          ...(useMirrorHeight
            ? { height: measuredHeight }
            : { minHeight: minInputHeight }),
        },
      ]}
      textAlignVertical="top"
      scrollEnabled
      accessibilityLabel={placeholder}
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

        <InputBarAnnotationStrip
          annotationCount={annotationCount ?? 0}
          onCyclePrev={onCyclePrevAnnotations ?? (() => {})}
          onCycleNext={onCycleAnnotations ?? (() => {})}
          onPreview={onPreviewAnnotations ?? (() => {})}
          onClear={onClearAnnotations ?? (() => {})}
        />

        <Pressable onPress={() => inputRef.current?.focus()} style={styles.textTap}>
          <View style={styles.textWrap}>
            {useMirrorHeight ? (
              /* Hidden mirror — measures wrap-adjusted text height via onLayout.
                 onContentSizeChange on uncontrolled multiline TextInput is
                 unreliable on iOS Fabric (RN 0.83). Text.onLayout fires
                 reliably after every re-render that changes children. */
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
            ) : null}
            {USE_IOS_PASTE_WRAPPER ? (
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
            annotationTargetMode={annotationTargetMode}
          />

          <CollapseWhen collapsed={focusModeActive}>
            <InputBarInfoRow
              selectedAgent={selectedAgent}
              selectedModel={selectedModel}
              connectionStatus={connectionStatus}
              contextUsed={contextUsed}
              contextTotal={contextTotal}
              onPressContext={onPressContext}
            />
          </CollapseWhen>
        </View>
      </View>
    </View>
  );
}
