import * as Clipboard from 'expo-clipboard';
import type { PasteEventPayload } from 'expo-paste-input';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { emitSlashCmdExec, emitClipboardAction } from '@/badges/events';
import { useThemeContext } from '@/contexts/ThemeContext';
import { Spacing } from '@/constants/theme';
import { useTranslation } from 'react-i18next';
import { useDraft } from '@/hooks/useDraft';
import { useInputTextController } from '@/hooks/useInputTextController';
import { useCommandConfirmations } from '@/hooks/useCommandConfirmations';

import { persistPastedImageUris } from '@/lib/attachments/persistPastedImages';

import { AttachmentSheet } from './attachmentSheet';
import { InputBarCard } from './InputBarCard';
import { InputBarHeader, type InputBarHeaderHandle, type DynamicPickerItem } from './InputBarHeader';
import type { PickerItem, PickerSection } from './InputBarPickerModal';
import { InputRainbowGlow, type GlowVariant } from './InputRainbowGlow';
import { SlashCommandPalette, type PaletteMode } from './SlashCommandPalette';
import { ContextUsageSheet } from './ContextUsageSheet';
import {
  BUILTIN_SLASH_COMMANDS,
  filterCommands,
  type SlashCommandItem,
} from './slashCommands';
import type { InputAttachment } from './types';
import { useVoiceRecorder } from './useVoiceRecorder';
import { useAttachmentPicker } from './useAttachmentPicker';
import { usePaletteMode } from './usePaletteMode';
import { makeId } from './palette/shared';

export interface InputBarProps {
  onSend?: (message: string, attachments?: InputAttachment[], onAbort?: () => void) => void;
  /** Current session key — used to persist and restore per-session drafts. */
  sessionKey?: string | null;
  disabled?: boolean;
  /** Full list of slash commands (built-ins + remote). Defaults to BUILTIN_SLASH_COMMANDS. */
  commands?: SlashCommandItem[];
  isThinking?: boolean;
  /**
   * Controls the input border glow.
   * - `'response'` — animated rainbow pulse (agent streaming / awaiting reply).
   * - `'background'` — calm fixed ring (maintenance work: reset, compact, agentBusy).
   * - `null` / omitted — no glow; falls back to `'response'` when `isThinking` is true.
   */
  glowVariant?: GlowVariant;
  onStop?: () => void;
  /** When true, the stop button is shown. Defaults to `isThinking` if omitted. */
  canStop?: boolean;
  model?: string;
  agent?: string;
  modelItems?: DynamicPickerItem[];
  /** Grouped model sections — takes priority over modelItems when provided */
  modelSections?: PickerSection[];
  agentItems?: DynamicPickerItem[];
  onModelChange?: (modelId: string) => void;
  onAgentChange?: (agentId: string) => void;
  connectionStatus?: 'connected' | 'connecting' | 'disconnected';
  contextUsed?: number;
  contextTotal?: number;
  /** Cumulative session input tokens — shown in the context details sheet */
  sessionInputTokens?: number;
  /** Cumulative session output tokens — shown in the context details sheet */
  sessionOutputTokens?: number;
  /** Cumulative session total tokens — shown in the context details sheet */
  sessionTotalTokens?: number;
  showThinking?: boolean;
  showToolCalls?: boolean;
  onToggleThinking?: () => void;
  onToggleToolCalls?: () => void;
  onRefreshPress?: () => void;
  isRefreshing?: boolean;
  /**
   * When `false`, a small warning is shown near image attachments indicating
   * the active model may not process them. Pass the result of checking
   * `Model.input` — treat `undefined`/empty as `true` (capability unknown).
   */
  modelSupportsImageInput?: boolean;
  /**
   * When `false`, voice-note pills show "Will transcribe to text". Passed
   * straight through to `InputBarAttachmentPreviews`.
   */
  modelSupportsAudioInput?: boolean;
  /**
   * Number of pending annotation replies — forwarded to the send button badge.
   * Composition of annotations into the outgoing message is handled by the caller
   * via the `onSend` prop (wrap to call composeAnnotatedReply before sending).
   */
  annotationCount?: number;
}

export interface InputBarHandle {
  closePickers: () => void;
  openContextSheet: () => void;
  setDraftText: (text: string) => void;
  /** Returns the current draft text (reads synchronously from ref). */
  getDraftText: () => string;
  /** Programmatically trigger a send — equivalent to tapping the Send button. */
  submit: () => void;
}

export const InputBar = forwardRef<InputBarHandle, InputBarProps>(function InputBar(
  {
    onSend,
    sessionKey = null,
    disabled = false,
    isThinking = false,
    glowVariant,
    onStop,
    canStop,
    model,
    agent,
    modelItems,
    modelSections,
    agentItems,
    onModelChange,
    onAgentChange,
    connectionStatus = 'connected',
    contextUsed,
    contextTotal,
    sessionInputTokens,
    sessionOutputTokens,
    sessionTotalTokens,
    showThinking = true,
    showToolCalls = true,
    onToggleThinking,
    onToggleToolCalls,
    onRefreshPress,
    isRefreshing,
    commands = BUILTIN_SLASH_COMMANDS,
    modelSupportsImageInput,
    modelSupportsAudioInput,
    annotationCount = 0,
  },
  ref,
): React.JSX.Element {
  const { colors } = useThemeContext();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { confirmDestructiveCommands } = useCommandConfirmations();
  const headerRef = useRef<InputBarHeaderHandle>(null);

  // --- Text controller (uncontrolled TextInput) ---
  // The TextInput mounts with defaultValue and is never re-driven by a `value`
  // prop. This prevents RN from re-applying attributedText to the native
  // UITextView on every keystroke, which is what causes iOS Voice Control /
  // dictation to lose the auto-spacing between phrases (RN #37991).
  const {
    inputRef,
    textRef,
    text: controllerText,
    setTextProgrammatic,
    onChangeTextFromNative,
  } = useInputTextController('');

  // --- Draft persistence (attachments + on-disk text) ---
  const { hydratedText, hydrationGen, persistText, attachments, setAttachments, clearDraft } =
    useDraft(sessionKey);

  const attachmentsRef = useRef<InputAttachment[]>([]);
  const argsCmdRef = useRef<SlashCommandItem | null>(null);
  const lastResolvedModeRef = useRef<PaletteMode | null>(null);

  attachmentsRef.current = attachments;

  const [isFocused, setIsFocused] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(model);
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>(agent);
  const [contextSheetVisible, setContextSheetVisible] = useState(false);
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);

  useEffect(() => {
    setSelectedModel(model);
  }, [model]);

  useEffect(() => {
    setSelectedAgent(agent);
  }, [agent]);

  // --- Hydration effect ---
  // Push the draft text for the current session into the native input whenever
  // useDraft signals a fresh load (initial disk read or session key change).
  // Guard: don't clobber the field if the user is actively typing in it.
  useEffect(() => {
    if (hydrationGen === 0) {
      return;
    }
    if (textRef.current === '' || !isFocused) {
      setTextProgrammatic(hydratedText);
    }
  // hydrationGen changing is the signal that hydratedText is newly relevant.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrationGen]);

  // --- Palette mode derivation ---
  const { paletteMode, selectedCommandIndex, onHighlightCommand } = usePaletteMode({
    controllerText,
    commands,
    modelSections,
  });

  if (paletteMode?.kind === 'args') {
    argsCmdRef.current = paletteMode.command;
  }

  const handleSend = useCallback((): void => {
    // Read from ref for latest value — no async state lag risk.
    const currentText = textRef.current;
    const hasAnnotations = annotationCount > 0;
    if ((!currentText.trim() && attachmentsRef.current.length === 0 && !hasAnnotations) || disabled) {
      return;
    }
    const snapshotText = currentText;
    const snapshotAttachments = attachmentsRef.current;
    const onAbort = (): void => {
      setTextProgrammatic(snapshotText, { cursor: 'end' });
      setAttachments(snapshotAttachments);
      persistText(snapshotText);
    };
    onSend?.(currentText.trim(), attachmentsRef.current, onAbort);
    setTextProgrammatic('');
    if (sessionKey) {
      clearDraft(sessionKey);
    } else {
      setAttachments([]);
    }
  }, [annotationCount, clearDraft, disabled, onSend, persistText, sessionKey, setAttachments, setTextProgrammatic]);

  useImperativeHandle(
    ref,
    () => ({
      closePickers: (): void => {
        headerRef.current?.closePickers();
      },
      openContextSheet: (): void => {
        setContextSheetVisible(true);
      },
      setDraftText: (text: string): void => {
        setTextProgrammatic(text, { cursor: 'end' });
        persistText(text);
      },
      getDraftText: (): string => textRef.current,
      submit: (): void => { handleSend(); },
    }),
    [setTextProgrammatic, persistText, textRef, handleSend],
  );

  // --- Attachment picker ---
  const {
    pickFromLibrary,
    pickVideoLibrary,
    pickDocument,
    takeVideo,
    takeMedia,
    attachRecentAssets,
    pasteImageFromClipboard,
    onCamera,
    removeAttachment,
  } = useAttachmentPicker({ setAttachments, attachmentsRef });

  // --- Paste handler ---
  const handlePaste = useCallback(async (payload: PasteEventPayload): Promise<void> => {
    emitClipboardAction();
    if (payload.type === 'text') {
      return;
    }

    if (payload.type === 'images') {
      const capped = payload.uris.slice(0, 10);
      try {
        const persisted = await persistPastedImageUris(capped);
        const next = persisted.map((img, i) => ({
          id: makeId(),
          name:
            persisted.length === 1
              ? t('input.clipboard.pastedImage')
              : t('input.clipboard.pastedImageN', { n: i + 1 }),
          type: 'image' as const,
          uri: img.uri,
          preview: img.uri,
          mimeType: img.mimeType,
        }));
        setAttachments([...attachmentsRef.current, ...next]);
      } catch {
        Alert.alert(t('input.clipboard.title'), t('input.clipboard.attachError'));
      }
      return;
    }

    // type === 'unsupported' — URL fallback via expo-clipboard
    try {
      const hasUrl = await Clipboard.hasUrlAsync();
      if (hasUrl) {
        const url = await Clipboard.getUrlAsync();
        if (url) {
          const current = textRef.current;
          const combined = current ? `${current} ${url}` : url;
          setTextProgrammatic(combined, { cursor: 'end' });
          persistText(combined);
          inputRef.current?.focus();
          return;
        }
      }
    } catch {
      /* ignore clipboard errors */
    }
    Alert.alert(t('input.clipboard.title'), t('input.clipboard.unsupportedType'));
  }, [inputRef, persistText, setAttachments, setTextProgrammatic, textRef, t]);

  // --- Voice recorder ---
  const { isVoiceRecording, onMicPressIn, onMicPressOut } = useVoiceRecorder({
    setAttachments,
    attachmentsRef,
    disabled,
    isThinking,
  });

  // --- Category B: programmatic text edits ---

  const onSlash = useCallback((): void => {
    setTextProgrammatic('/', { cursor: 'end' });
    persistText('/');
    inputRef.current?.focus();
  }, [inputRef, persistText, setTextProgrammatic]);

  const onReset = useCallback((): void => {
    if (!confirmDestructiveCommands) {
      onSend?.('/reset');
      return;
    }
    Alert.alert(
      t('input.resetAlert.title'),
      t('input.resetAlert.body'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('input.resetAlert.confirm'), style: 'destructive', onPress: () => { onSend?.('/reset'); } },
      ],
    );
  }, [confirmDestructiveCommands, onSend, t]);

  const onCompact = useCallback((): void => {
    if (!confirmDestructiveCommands) {
      onSend?.('/compact');
      return;
    }
    Alert.alert(
      t('input.compactAlert.title'),
      t('input.compactAlert.body'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('input.compactAlert.confirm'), onPress: () => { onSend?.('/compact'); } },
      ],
    );
  }, [confirmDestructiveCommands, onSend, t]);

  const handleSelectModel = useCallback((id: string, name: string): void => {
    setSelectedModel(name);
    onModelChange?.(id);
  }, [onModelChange]);

  const handleSelectAgent = useCallback((id: string, name: string): void => {
    setSelectedAgent(name);
    onAgentChange?.(id);
  }, [onAgentChange]);

  const onSelectArgStable = useCallback((option: string): void => {
    const cmd = argsCmdRef.current;
    if (!cmd) return;
    const next = `/${cmd.name} ${option}`;
    setTextProgrammatic(next, { cursor: 'end' });
    persistText(next);
    setTimeout(() => { handleSend(); }, 0);
  }, [handleSend, persistText, setTextProgrammatic]);

  const onSelectModelFromPalette = useCallback((item: PickerItem): void => {
    handleSelectModel(item.key, item.title);
    setTextProgrammatic('');
    persistText('');
  }, [handleSelectModel, persistText, setTextProgrammatic]);

  const onSelectCommand = useCallback((cmd: SlashCommandItem): void => {
    emitSlashCmdExec(cmd.id);
    let next: string;
    if (cmd.argOptions?.length) {
      next = `/${cmd.name} `;
    } else if (cmd.id === 'model') {
      next = `/${cmd.name} `;
    } else if (cmd.executeLocal && !cmd.args) {
      next = `/${cmd.name}`;
      setTextProgrammatic(next, { cursor: 'end' });
      persistText(next);
      setTimeout(() => { handleSend(); }, 0);
      inputRef.current?.focus();
      return;
    } else {
      next = `/${cmd.name} `;
    }
    setTextProgrammatic(next, { cursor: 'end' });
    persistText(next);
    inputRef.current?.focus();
  }, [handleSend, inputRef, persistText, setTextProgrammatic]);

  // onChangeText from native input — apply normalization then persist.
  const onNativeChangeText = useCallback((t: string): void => {
    // Collapse "/ " or "/  " (user deleted command name) back to "/" so the
    // palette re-opens cleanly.
    const normalized =
      t.includes('/') && /^[/\s]+$/u.test(t) ? '/' : t;

    if (normalized !== t) {
      // Override what the user typed with the normalized value.
      setTextProgrammatic(normalized, { cursor: 'end' });
    } else {
      onChangeTextFromNative(t);
    }

    persistText(normalized);
  }, [onChangeTextFromNative, persistText, setTextProgrammatic]);

  // --- Palette mode with stable callbacks ---
  const resolvedMode: PaletteMode | null =
    paletteMode === null
      ? null
      : paletteMode.kind === 'commands'
        ? { ...paletteMode, selectedIndex: selectedCommandIndex, onHighlight: onHighlightCommand, onSelect: onSelectCommand }
        : paletteMode.kind === 'args'
          ? { ...paletteMode, selectedIndex: selectedCommandIndex, onHighlight: onHighlightCommand, onSelect: onSelectArgStable }
          : { ...paletteMode, selectedIndex: selectedCommandIndex, onHighlight: onHighlightCommand, onSelect: onSelectModelFromPalette };

  if (resolvedMode !== null) {
    lastResolvedModeRef.current = resolvedMode;
  }

  const paletteDisplayMode: PaletteMode = lastResolvedModeRef.current ?? {
    kind: 'commands',
    commands: filterCommands(commands, '', { showPower: false }),
    selectedIndex: -1,
    onHighlight: onHighlightCommand,
    onSelect: onSelectCommand,
  };

  const onPaperclip = useCallback((): void => {
    setAttachSheetVisible(true);
  }, []);

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingBottom: Math.max(insets.bottom, Spacing.md),
          backgroundColor: colors.background,
        },
      ]}
    >
      <SlashCommandPalette
        visible={paletteMode !== null && isFocused}
        mode={paletteDisplayMode}
      />

      <InputBarHeader
        ref={headerRef}
        selectedModel={selectedModel}
        selectedAgent={selectedAgent}
        onSelectModel={handleSelectModel}
        onSelectAgent={handleSelectAgent}
        modelItems={modelItems}
        modelSections={modelSections}
        agentItems={agentItems}
        showThinking={showThinking}
        showToolCalls={showToolCalls}
        isLoadingItems={connectionStatus === 'connecting'}
        onToggleThinking={onToggleThinking}
        onToggleToolCalls={onToggleToolCalls}
        onRefreshPress={onRefreshPress}
        isRefreshing={isRefreshing}
      />

      <View style={styles.cardWrap}>
        {(() => {
          const v: GlowVariant = glowVariant !== undefined ? glowVariant : (isThinking ? 'response' : null);
          return v ? <InputRainbowGlow variant={v} /> : null;
        })()}
        <InputBarCard
          defaultValue={''}
          text={controllerText}
          onTextChange={onNativeChangeText}
          isFocused={isFocused}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          inputRef={inputRef}
          isThinking={isThinking}
          disabled={disabled}
          attachments={attachments}
          onRemoveAttachment={removeAttachment}
          modelSupportsImageInput={modelSupportsImageInput}
          modelSupportsAudioInput={modelSupportsAudioInput}
          connectionStatus={connectionStatus}
          selectedAgent={selectedAgent}
          selectedModel={selectedModel}
          contextUsed={contextUsed}
          contextTotal={contextTotal}
          onPressContext={() => setContextSheetVisible(true)}
          onStop={onStop}
          canStop={canStop}
          onSend={handleSend}
          onPaperclip={onPaperclip}
          onSlash={onSlash}
          onCamera={() => { void onCamera(); }}
          isVoiceRecording={isVoiceRecording}
          onMicPressIn={onMicPressIn}
          onMicPressOut={onMicPressOut}
          onPaste={(payload) => { void handlePaste(payload); }}
          onReset={onReset}
          onCompact={onCompact}
          annotationCount={annotationCount}
        />

        <ContextUsageSheet
          visible={contextSheetVisible}
          onClose={() => setContextSheetVisible(false)}
          modelName={selectedModel}
          contextWindow={contextTotal}
          contextUsed={contextUsed}
          inputTokens={sessionInputTokens}
          outputTokens={sessionOutputTokens}
          totalTokens={sessionTotalTokens}
        />

        <AttachmentSheet
          visible={attachSheetVisible}
          onClose={() => setAttachSheetVisible(false)}
          onPickPhoto={() => void pickFromLibrary()}
          onPickVideo={() => void pickVideoLibrary()}
          onTakeVideo={() => void takeVideo()}
          onPickFile={() => void pickDocument()}
          onPasteImage={() => void pasteImageFromClipboard()}
          onTakeMedia={() => void takeMedia()}
          onAttachRecentAssets={(assets) => void attachRecentAssets(assets)}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  cardWrap: {
    position: 'relative',
    overflow: 'visible',
  },
});
