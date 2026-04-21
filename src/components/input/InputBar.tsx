import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { ActionSheetIOS, Alert, Platform, StyleSheet, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeContext } from '@/contexts/ThemeContext';
import { Spacing } from '@/constants/theme';

import { InputBarCard } from './InputBarCard';
import { InputBarHeader, type InputBarHeaderHandle } from './InputBarHeader';
import { InputRainbowGlow } from './InputRainbowGlow';
import { SlashCommandPalette } from './SlashCommandPalette';
import type { SlashCommandItem } from './slashCommands';
import type { InputAttachment } from './types';

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export interface InputBarProps {
  onSend?: (message: string, attachments?: InputAttachment[]) => void;
  disabled?: boolean;
  isThinking?: boolean;
  onStop?: () => void;
  model?: string;
  agent?: string;
  connectionStatus?: 'connected' | 'connecting' | 'disconnected';
  contextUsed?: number;
  contextTotal?: number;
  showThinking?: boolean;
  showToolCalls?: boolean;
  onToggleThinking?: () => void;
  onToggleToolCalls?: () => void;
  onRefreshPress?: () => void;
}

export interface InputBarHandle {
  closePickers: () => void;
}

export const InputBar = forwardRef<InputBarHandle, InputBarProps>(function InputBar(
  {
    onSend,
    disabled = false,
    isThinking = false,
    onStop,
    model = 'Claude 4',
    agent = 'ClawBoy Agent',
    connectionStatus = 'connected',
    contextUsed = 0,
    contextTotal = 200000,
    showThinking = true,
    showToolCalls = true,
    onToggleThinking,
    onToggleToolCalls,
    onRefreshPress,
  },
  ref,
): React.JSX.Element {
  const { colors } = useThemeContext();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const headerRef = useRef<InputBarHeaderHandle>(null);

  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<InputAttachment[]>([]);
  const [inputHeight, setInputHeight] = useState(44);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [selectedModel, setSelectedModel] = useState(model);
  const [selectedAgent, setSelectedAgent] = useState(agent);

  useEffect(() => {
    setSelectedModel(model);
  }, [model]);

  useEffect(() => {
    setSelectedAgent(agent);
  }, [agent]);

  const showCommands = value.startsWith('/');
  const commandQuery = showCommands ? value.slice(1) : '';

  useEffect(() => {
    setSelectedCommandIndex(0);
  }, [commandQuery]);

  useImperativeHandle(ref, () => ({
    closePickers: (): void => {
      headerRef.current?.closePickers();
    },
  }));

  const handleSend = useCallback((): void => {
    if ((!value.trim() && attachments.length === 0) || disabled) {
      return;
    }
    onSend?.(value.trim(), attachments);
    setValue('');
    setAttachments([]);
    setInputHeight(44);
  }, [attachments, disabled, onSend, value]);

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
      preview: a.uri,
    }));
    setAttachments((prev) => [...prev, ...next]);
  }, []);

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
    }));
    setAttachments((prev) => [...prev, ...next]);
  }, []);

  const onPaperclip = useCallback((): void => {
    const run = (): void => {
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Cancel', 'Photo library', 'File'],
            cancelButtonIndex: 0,
          },
          (i) => {
            if (i === 1) {
              void pickFromLibrary();
            } else if (i === 2) {
              void pickDocument();
            }
          },
        );
      } else {
        Alert.alert('Attach', undefined, [
          { text: 'Photo library', onPress: () => void pickFromLibrary() },
          { text: 'File', onPress: () => void pickDocument() },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
    };
    run();
  }, [pickDocument, pickFromLibrary]);

  const onCamera = useCallback(async (): Promise<void> => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (res.canceled || !res.assets[0]) {
      return;
    }
    const a = res.assets[0];
    setAttachments((prev) => [
      ...prev,
      {
        id: makeId(),
        name: a.fileName ?? 'Photo',
        type: 'image',
        preview: a.uri,
      },
    ]);
  }, []);

  const onMic = useCallback((): void => {
    /* Voice input — future scope */
  }, []);

  const onSlash = useCallback((): void => {
    setValue('/');
    inputRef.current?.focus();
  }, []);

  const onSelectCommand = useCallback((cmd: SlashCommandItem): void => {
    setValue(`/${cmd.name} `);
    inputRef.current?.focus();
  }, []);

  const removeAttachment = useCallback((id: string): void => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
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
      {showCommands ? (
        <SlashCommandPalette
          query={commandQuery}
          selectedIndex={selectedCommandIndex}
          onSelect={onSelectCommand}
        />
      ) : null}

      <InputBarHeader
        ref={headerRef}
        selectedModel={selectedModel}
        selectedAgent={selectedAgent}
        onSelectModel={setSelectedModel}
        onSelectAgent={setSelectedAgent}
        showThinking={showThinking}
        showToolCalls={showToolCalls}
        onToggleThinking={onToggleThinking}
        onToggleToolCalls={onToggleToolCalls}
        onRefreshPress={onRefreshPress}
      />

      <View style={styles.cardWrap}>
        {isThinking ? <InputRainbowGlow isThinking /> : null}
        <InputBarCard
          value={value}
          onChangeText={(t) => {
            setValue(t);
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
          connectionStatus={connectionStatus}
          selectedAgent={selectedAgent}
          selectedModel={selectedModel}
          contextUsed={contextUsed}
          contextTotal={contextTotal}
          onStop={onStop}
          onSend={handleSend}
          onPaperclip={onPaperclip}
          onSlash={onSlash}
          onCamera={() => void onCamera()}
          onMic={onMic}
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
  },
});
