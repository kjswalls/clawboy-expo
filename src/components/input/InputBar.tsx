import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import type { PasteEventPayload } from 'expo-paste-input';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, StyleSheet, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeContext } from '@/contexts/ThemeContext';
import { Spacing } from '@/constants/theme';
import { VIDEO_PICK_MAX_DURATION_SECONDS, VOICE_RECORDING_MAX_SECONDS } from '@/constants/attachmentsGateway';
import { useDraft } from '@/hooks/useDraft';
import * as MediaLibrary from 'expo-media-library';

import { writeClipboardDataImageToCache } from '@/lib/attachments/prepareChatAttachments';
import { persistPastedImageUris } from '@/lib/attachments/persistPastedImages';

import { AttachmentSheet } from './attachmentSheet';
import { InputBarCard } from './InputBarCard';
import { InputBarHeader, type InputBarHeaderHandle, type DynamicPickerItem } from './InputBarHeader';
import type { PickerSection } from './InputBarPickerModal';
import { InputRainbowGlow } from './InputRainbowGlow';
import { SlashCommandPalette, type PaletteMode } from './SlashCommandPalette';
import { ContextUsageSheet } from './ContextUsageSheet';
import {
  BUILTIN_SLASH_COMMANDS,
  filterCommands,
  type SlashCommandItem,
} from './slashCommands';
import type { InputAttachment } from './types';

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export interface InputBarProps {
  onSend?: (message: string, attachments?: InputAttachment[], onAbort?: () => void) => void;
  /** Current session key — used to persist and restore per-session drafts. */
  sessionKey?: string | null;
  disabled?: boolean;
  /** Full list of slash commands (built-ins + remote). Defaults to BUILTIN_SLASH_COMMANDS. */
  commands?: SlashCommandItem[];
  isThinking?: boolean;
  /** Show rainbow glow border — defaults to `isThinking`. Pass false to suppress for non-streaming activity. */
  showRainbow?: boolean;
  onStop?: () => void;
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
}

export interface InputBarHandle {
  closePickers: () => void;
  openContextSheet: () => void;
  setDraftText: (text: string) => void;
}

export const InputBar = forwardRef<InputBarHandle, InputBarProps>(function InputBar(
  {
    onSend,
    sessionKey = null,
    disabled = false,
    isThinking = false,
    showRainbow,
    onStop,
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
  },
  ref,
): React.JSX.Element {
  const { colors } = useThemeContext();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const headerRef = useRef<InputBarHeaderHandle>(null);

  const { draft, setDraft, clearDraft } = useDraft(sessionKey);
  const value = draft.text;
  const attachments = draft.attachments;

  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const attachmentsRef = useRef<InputAttachment[]>([]);
  const valueRef = useRef('');
  const voiceStartRef = useRef(0);
  const voiceMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micPressActiveRef = useRef(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);

  attachmentsRef.current = attachments;
  valueRef.current = value;

  const clearVoiceMaxTimer = useCallback((): void => {
    if (voiceMaxTimerRef.current) {
      clearTimeout(voiceMaxTimerRef.current);
      voiceMaxTimerRef.current = null;
    }
  }, []);

  const [inputHeight, setInputHeight] = useState(44);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
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

  useEffect(() => {
    return () => {
      clearVoiceMaxTimer();
    };
  }, [clearVoiceMaxTimer]);

  // Derive palette mode — mirrors web's updateSlashMenu logic.
  const paletteMode = useMemo((): PaletteMode | null => {
    const argMatch = value.match(/^\/(\S+)\s(.*)$/u);
    const cmdMatch = !argMatch && value.match(/^\/(\S*)$/u);

    if (argMatch) {
      const cmd = commands.find((c) => c.name === argMatch[1].toLowerCase());
      if (cmd?.argOptions?.length) {
        const typed = argMatch[2].toLowerCase();
        const filtered = typed
          ? cmd.argOptions.filter((o) => o.toLowerCase().startsWith(typed))
          : cmd.argOptions;
        if (filtered.length) {
          return { kind: 'args', command: cmd, options: filtered, selectedIndex: selectedCommandIndex, onSelect: () => {} };
        }
      }
    } else if (cmdMatch) {
      const items = filterCommands(commands, cmdMatch[1], { showPower: cmdMatch[1].length > 0 });
      if (items.length) {
        return { kind: 'commands', commands: items, selectedIndex: selectedCommandIndex, onSelect: () => {} };
      }
    }
    return null;
  }, [value, commands, selectedCommandIndex]);

  const paletteKey = paletteMode?.kind ?? 'none';
  const paletteCount = paletteMode?.kind === 'commands'
    ? paletteMode.commands.length
    : paletteMode?.kind === 'args'
      ? paletteMode.options.length
      : 0;

  useEffect(() => {
    setSelectedCommandIndex(0);
  }, [paletteKey, paletteCount]);

  useImperativeHandle(ref, () => ({
    closePickers: (): void => {
      headerRef.current?.closePickers();
    },
    openContextSheet: (): void => {
      setContextSheetVisible(true);
    },
    setDraftText: (text: string): void => {
      setDraft({ text, attachments });
    },
  }));

  const handleSend = useCallback((): void => {
    if ((!value.trim() && attachments.length === 0) || disabled) {
      return;
    }
    const snapshot = { text: value, attachments };
    onSend?.(value.trim(), attachments, () => setDraft(snapshot));
    if (sessionKey) {
      clearDraft(sessionKey);
    } else {
      setDraft({ text: '', attachments: [] });
    }
    setInputHeight(44);
  }, [attachments, clearDraft, disabled, onSend, sessionKey, setDraft, value]);

  const pickFromLibrary = useCallback(async (): Promise<void> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (res.canceled) {
      return;
    }
    const next: InputAttachment[] = res.assets.map((a) => ({
      id: makeId(),
      name: a.fileName ?? 'Image',
      type: 'image' as const,
      uri: a.uri,
      preview: a.uri,
      mimeType: a.mimeType ?? undefined,
      sizeBytes: a.fileSize,
    }));
    setDraft({ text: value, attachments: [...attachments, ...next] });
  }, [attachments, setDraft, value]);

  const pickVideoLibrary = useCallback(async (): Promise<void> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: false,
      videoMaxDuration: VIDEO_PICK_MAX_DURATION_SECONDS,
      quality: 0.8,
    });
    if (res.canceled || !res.assets[0]) {
      return;
    }
    const a = res.assets[0];
    const next: InputAttachment = {
      id: makeId(),
      name: a.fileName ?? 'Video',
      type: 'video',
      uri: a.uri,
      preview: a.uri,
      mimeType: a.mimeType ?? undefined,
      sizeBytes: a.fileSize,
    };
    setDraft({ text: value, attachments: [...attachments, next] });
  }, [attachments, setDraft, value]);

  const pickDocument = useCallback(async (): Promise<void> => {
    const res = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (res.canceled || !res.assets?.length) {
      return;
    }
    const next: InputAttachment[] = res.assets.map((a) => ({
      id: makeId(),
      name: a.name,
      type: 'file' as const,
      uri: a.uri,
      mimeType: a.mimeType,
      sizeBytes: a.size,
    }));
    setDraft({ text: value, attachments: [...attachments, ...next] });
  }, [attachments, setDraft, value]);

  const takeVideo = useCallback(async (): Promise<void> => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: VIDEO_PICK_MAX_DURATION_SECONDS,
      quality: 0.8,
    });
    if (res.canceled || !res.assets[0]) {
      return;
    }
    const a = res.assets[0];
    setDraft({
      text: value,
      attachments: [
        ...attachments,
        {
          id: makeId(),
          name: a.fileName ?? 'Video',
          type: 'video',
          uri: a.uri,
          preview: a.uri,
          mimeType: a.mimeType ?? undefined,
          sizeBytes: a.fileSize,
        },
      ],
    });
  }, [attachments, setDraft, value]);

  const takeMedia = useCallback(async (): Promise<void> => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      videoMaxDuration: VIDEO_PICK_MAX_DURATION_SECONDS,
      quality: 0.85,
    });
    if (res.canceled || !res.assets[0]) {
      return;
    }
    const a = res.assets[0];
    const isVideo = a.type === 'video';
    setDraft({
      text: value,
      attachments: [
        ...attachments,
        {
          id: makeId(),
          name: a.fileName ?? (isVideo ? 'Video' : 'Photo'),
          type: isVideo ? 'video' : 'image',
          uri: a.uri,
          preview: a.uri,
          mimeType: a.mimeType ?? undefined,
          sizeBytes: a.fileSize,
        },
      ],
    });
  }, [attachments, setDraft, value]);

  const attachRecentAssets = useCallback(async (assets: MediaLibrary.Asset[]): Promise<void> => {
    const next: InputAttachment[] = [];
    for (const asset of assets) {
      try {
        const info = await MediaLibrary.getAssetInfoAsync(asset);
        const uri = info.localUri ?? asset.uri;
        next.push({
          id: makeId(),
          name: asset.filename,
          type: asset.mediaType === MediaLibrary.MediaType.video ? 'video' : 'image',
          uri,
          preview: uri,
        });
      } catch {
        // skip assets that can't be resolved
      }
    }
    if (next.length > 0) {
      setDraft({ text: value, attachments: [...attachments, ...next] });
    }
  }, [attachments, setDraft, value]);

  const pasteImageFromClipboard = useCallback(async (): Promise<void> => {
    const has = await Clipboard.hasImageAsync();
    if (!has) {
      Alert.alert('Clipboard', 'No image in the clipboard.');
      return;
    }
    const img = await Clipboard.getImageAsync({ format: 'jpeg', jpegQuality: 0.88 });
    if (!img?.data) {
      Alert.alert('Clipboard', 'Could not read the clipboard image.');
      return;
    }
    try {
      const uri = await writeClipboardDataImageToCache(img.data);
      const next: InputAttachment = {
        id: makeId(),
        name: 'Pasted image',
        type: 'image',
        uri,
        preview: uri,
        mimeType: 'image/jpeg',
      };
      setDraft({ text: value, attachments: [...attachments, next] });
    } catch {
      Alert.alert('Clipboard', 'Could not attach the clipboard image.');
    }
  }, [attachments, setDraft, value]);

  const handlePaste = useCallback(async (payload: PasteEventPayload): Promise<void> => {
    if (payload.type === 'text') {
      // Text was already inserted by native TextInput — nothing else to do.
      return;
    }

    if (payload.type === 'images') {
      const capped = payload.uris.slice(0, 10);
      try {
        const persisted = await persistPastedImageUris(capped);
        const next = persisted.map((img, i) => ({
          id: makeId(),
          name: persisted.length === 1 ? 'Pasted image' : `Pasted image ${i + 1}`,
          type: 'image' as const,
          uri: img.uri,
          preview: img.uri,
          mimeType: img.mimeType,
        }));
        setDraft({ text: valueRef.current, attachments: [...attachmentsRef.current, ...next] });
      } catch {
        Alert.alert('Clipboard', 'Could not attach the pasted image.');
      }
      return;
    }

    // type === 'unsupported' — try URL fallback via expo-clipboard
    try {
      const hasUrl = await Clipboard.hasUrlAsync();
      if (hasUrl) {
        const url = await Clipboard.getUrlAsync();
        if (url) {
          const current = valueRef.current;
          setDraft({
            text: current ? `${current} ${url}` : url,
            attachments: attachmentsRef.current,
          });
          inputRef.current?.focus();
          return;
        }
      }
    } catch {
      /* ignore clipboard errors */
    }
    Alert.alert('Clipboard', "That clipboard type can't be pasted here — use the paperclip.");
  }, [setDraft, inputRef]);

  const onPaperclip = useCallback((): void => {
    setAttachSheetVisible(true);
  }, []);

  const onCamera = useCallback(async (): Promise<void> => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (res.canceled || !res.assets[0]) {
      return;
    }
    const a = res.assets[0];
    setDraft({
      text: value,
      attachments: [
        ...attachments,
        {
          id: makeId(),
          name: a.fileName ?? 'Photo',
          type: 'image',
          uri: a.uri,
          preview: a.uri,
          mimeType: a.mimeType ?? undefined,
          sizeBytes: a.fileSize,
        },
      ],
    });
  }, [attachments, setDraft, value]);

  const handleSelectModel = useCallback((id: string, name: string): void => {
    setSelectedModel(name);
    onModelChange?.(id);
  }, [onModelChange]);

  const handleSelectAgent = useCallback((id: string, name: string): void => {
    setSelectedAgent(name);
    onAgentChange?.(id);
  }, [onAgentChange]);

  const onMicPressOutRef = useRef<(() => Promise<void>) | null>(null);

  const onMicPressOut = useCallback(async (): Promise<void> => {
    micPressActiveRef.current = false;
    setIsVoiceRecording(false);
    clearVoiceMaxTimer();
    if (!recorder.isRecording) {
      return;
    }
    try {
      await recorder.stop();
    } catch {
      /* ignore */
    }
    const uri = recorder.uri;
    const ms = Date.now() - voiceStartRef.current;
    if (!uri || ms < 400) {
      return;
    }
    const next: InputAttachment = {
      id: makeId(),
      name: `Voice (${Math.max(1, Math.round(ms / 1000))}s)`,
      type: 'audio',
      uri,
      preview: uri,
      mimeType: 'audio/mp4',
    };
    setDraft({
      text: valueRef.current,
      attachments: [...attachmentsRef.current, next],
    });
  }, [clearVoiceMaxTimer, recorder, setDraft]);

  useEffect(() => {
    onMicPressOutRef.current = onMicPressOut;
  }, [onMicPressOut]);

  const onMicPressIn = useCallback(async (): Promise<void> => {
    if (disabled || isThinking) {
      return;
    }
    micPressActiveRef.current = true;
    clearVoiceMaxTimer();
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      micPressActiveRef.current = false;
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    try {
      await recorder.prepareToRecordAsync();
      voiceStartRef.current = Date.now();
      recorder.record();
      if (micPressActiveRef.current) {
        setIsVoiceRecording(true);
      }
      voiceMaxTimerRef.current = setTimeout(() => {
        void onMicPressOutRef.current?.();
      }, VOICE_RECORDING_MAX_SECONDS * 1000);
    } catch {
      micPressActiveRef.current = false;
      /* ignore */
    }
  }, [clearVoiceMaxTimer, disabled, isThinking, recorder]);

  const onSlash = useCallback((): void => {
    setDraft({ text: '/', attachments });
    inputRef.current?.focus();
  }, [attachments, setDraft]);

  const onSelectArg = useCallback((cmd: SlashCommandItem, option: string): void => {
    setDraft({ text: `/${cmd.name} ${option}`, attachments });
    // Execute immediately — matches web's mouse-click-on-option behavior.
    setTimeout(() => {
      handleSend();
    }, 0);
  }, [attachments, handleSend, setDraft]);

  const onSelectCommand = useCallback((cmd: SlashCommandItem): void => {
    if (cmd.argOptions?.length) {
      // Transition palette into args mode.
      setDraft({ text: `/${cmd.name} `, attachments });
    } else if (cmd.executeLocal && !cmd.args) {
      // Instant execution — set draft then send.
      setDraft({ text: `/${cmd.name}`, attachments });
      setTimeout(() => {
        handleSend();
      }, 0);
    } else {
      setDraft({ text: `/${cmd.name} `, attachments });
    }
    inputRef.current?.focus();
  }, [attachments, handleSend, setDraft]);

  const removeAttachment = useCallback((id: string): void => {
    setDraft({ text: value, attachments: attachments.filter((a) => a.id !== id) });
  }, [attachments, setDraft, value]);

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
      {paletteMode ? (
        <SlashCommandPalette
          mode={
            paletteMode.kind === 'commands'
              ? { ...paletteMode, onSelect: onSelectCommand }
              : { ...paletteMode, onSelect: (option) => onSelectArg(paletteMode.command, option) }
          }
        />
      ) : null}

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
        {(showRainbow ?? isThinking) ? <InputRainbowGlow isThinking /> : null}
        <InputBarCard
          value={value}
          onChangeText={(t) => {
            setDraft({ text: t, attachments });
            if (!t.startsWith('/')) {
              setSelectedCommandIndex(0);
            }
          }}
          inputHeight={inputHeight}
          setInputHeight={setInputHeight}
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
          onSend={handleSend}
          onPaperclip={onPaperclip}
          onSlash={onSlash}
          onCamera={() => void onCamera()}
          isVoiceRecording={isVoiceRecording}
          onMicPressIn={() => {
            void onMicPressIn();
          }}
          onMicPressOut={() => {
            void onMicPressOut();
          }}
          onPaste={(payload) => { void handlePaste(payload); }}
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
    paddingTop: Spacing.md,
  },
  cardWrap: {
    position: 'relative',
    overflow: 'visible',
  },
});
