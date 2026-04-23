import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutRectangle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ChevronDown } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

import { InputBarPickerModal, type PickerItem } from './InputBarPickerModal';
import { InputBarHeaderToggles } from './InputBarHeaderToggles';

const ROW_H = 44;
/** Gap between picker bottom edge and top of anchor pill */
const PICKER_GAP = 8;

/** Neutral dot color used when no model/agent metadata is available. */
const EMPTY_DOT = '#6B7280';
const MODEL_PLACEHOLDER = 'Select model';
const AGENT_PLACEHOLDER = 'Select agent';

export interface InputBarHeaderHandle {
  closePickers: () => void;
}

export interface DynamicPickerItem {
  id: string;
  name: string;
  dotBg?: string;
  emoji?: string;
}

interface InputBarHeaderProps {
  selectedModel?: string;
  selectedAgent?: string;
  onSelectModel: (id: string, name: string) => void;
  onSelectAgent: (id: string, name: string) => void;
  modelItems?: DynamicPickerItem[];
  agentItems?: DynamicPickerItem[];
  showThinking: boolean;
  showToolCalls: boolean;
  onToggleThinking?: () => void;
  onToggleToolCalls?: () => void;
  onRefreshPress?: () => void;
}

export const InputBarHeader = forwardRef<InputBarHeaderHandle, InputBarHeaderProps>(
  function InputBarHeader(
    {
      selectedModel,
      selectedAgent,
      onSelectModel,
      onSelectAgent,
      modelItems,
      agentItems,
      showThinking,
      showToolCalls,
      onToggleThinking,
      onToggleToolCalls,
      onRefreshPress,
    },
    ref,
  ): React.JSX.Element {
    const { colors } = useThemeContext();
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [showAgentPicker, setShowAgentPicker] = useState(false);
    const [anchor, setAnchor] = useState<LayoutRectangle | null>(null);
    const [pickerKind, setPickerKind] = useState<'model' | 'agent' | null>(null);

    const modelWrapRef = useRef<View>(null);
    const agentWrapRef = useRef<View>(null);

    const modelChevron = useSharedValue(0);
    const agentChevron = useSharedValue(0);

    const modelChevronStyle = useAnimatedStyle(() => ({
      transform: [{ rotate: `${modelChevron.value}deg` }],
    }));
    const agentChevronStyle = useAnimatedStyle(() => ({
      transform: [{ rotate: `${agentChevron.value}deg` }],
    }));

    const closePickers = useCallback((): void => {
      setShowModelPicker(false);
      setShowAgentPicker(false);
      setPickerKind(null);
      setAnchor(null);
      modelChevron.value = withTiming(0, { duration: 200 });
      agentChevron.value = withTiming(0, { duration: 200 });
    }, [agentChevron, modelChevron]);

    useImperativeHandle(ref, () => ({ closePickers }), [closePickers]);

    const openModel = useCallback((): void => {
      setShowAgentPicker(false);
      modelWrapRef.current?.measureInWindow((x, y, width, height) => {
        setAnchor({ x, y, width, height });
        setPickerKind('model');
        setShowModelPicker(true);
        modelChevron.value = withTiming(180, { duration: 200 });
        agentChevron.value = withTiming(0, { duration: 200 });
      });
    }, [agentChevron, modelChevron]);

    const openAgent = useCallback((): void => {
      setShowModelPicker(false);
      agentWrapRef.current?.measureInWindow((x, y, width, height) => {
        setAnchor({ x, y, width, height });
        setPickerKind('agent');
        setShowAgentPicker(true);
        agentChevron.value = withTiming(180, { duration: 200 });
        modelChevron.value = withTiming(0, { duration: 200 });
      });
    }, [agentChevron, modelChevron]);

    const toggleModel = useCallback((): void => {
      if (showModelPicker) {
        closePickers();
      } else {
        openModel();
      }
    }, [closePickers, openModel, showModelPicker]);

    const toggleAgent = useCallback((): void => {
      if (showAgentPicker) {
        closePickers();
      } else {
        openAgent();
      }
    }, [closePickers, openAgent, showAgentPicker]);

    const resolvedModelItems = modelItems ?? [];
    const resolvedAgentItems = agentItems ?? [];

    const modelMatch = selectedModel
      ? resolvedModelItems.find((m) => m.name === selectedModel)
      : undefined;
    const agentMatch = selectedAgent
      ? resolvedAgentItems.find((a) => a.name === selectedAgent)
      : undefined;

    const modelLabel = selectedModel ?? MODEL_PLACEHOLDER;
    const agentLabel = selectedAgent ?? AGENT_PLACEHOLDER;
    const modelDot = modelMatch?.dotBg ?? EMPTY_DOT;
    const agentDot = agentMatch?.dotBg ?? EMPTY_DOT;
    const agentEmoji = agentMatch?.emoji;

    const modalVisible = showModelPicker || showAgentPicker;
    const items: PickerItem[] =
      pickerKind === 'model'
        ? resolvedModelItems.map((m) => ({
            key: m.id,
            title: m.name,
            dot: m.dotBg ?? EMPTY_DOT,
            emoji: undefined,
          }))
        : pickerKind === 'agent'
          ? resolvedAgentItems.map((a) => ({
              key: a.id,
              title: a.name,
              dot: a.dotBg ?? EMPTY_DOT,
              emoji: a.emoji,
            }))
          : [];

    const dropdownHeight =
      pickerKind === null
        ? 0
        : items.length === 0
          ? 60
          : Math.min(items.length * ROW_H + 40, 280);

    /** Anchor dropdown bottom to the pill — avoids gaps from estimated vs actual menu height */
    const bottom =
      anchor && pickerKind ? windowHeight - anchor.y + PICKER_GAP : 0;
    const left = anchor ? anchor.x : 0;

    const maxDropdownHeight =
      anchor && pickerKind
        ? Math.min(
            dropdownHeight,
            Math.max(0, anchor.y - insets.top - PICKER_GAP - 8),
          )
        : dropdownHeight;

    const onPick = (title: string): void => {
      if (pickerKind === 'model') {
        const item = resolvedModelItems.find((m) => m.name === title);
        onSelectModel(item?.id ?? title, title);
      } else if (pickerKind === 'agent') {
        const item = resolvedAgentItems.find((a) => a.name === title);
        onSelectAgent(item?.id ?? title, title);
      }
      closePickers();
    };

    return (
      <>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View ref={modelWrapRef} collapsable={false}>
              <Pressable
                onPress={toggleModel}
                style={[
                  styles.pill,
                  {
                    borderColor: showModelPicker ? colors.foreground + '4D' : colors.border,
                    backgroundColor: colors.secondary,
                  },
                ]}
              >
                <View style={[styles.dot, { backgroundColor: modelDot }]}>
                  <Text style={styles.dotLetter}>
                    {selectedModel ? selectedModel.charAt(0) : '?'}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.pillLabel,
                    { color: selectedModel ? colors.foreground : colors.mutedForeground },
                  ]}
                  numberOfLines={1}
                >
                  {modelLabel}
                </Text>
                <Animated.View style={modelChevronStyle}>
                  <ChevronDown size={12} color={colors.mutedForeground} />
                </Animated.View>
              </Pressable>
            </View>

            <View ref={agentWrapRef} collapsable={false}>
              <Pressable
                onPress={toggleAgent}
                style={[
                  styles.pill,
                  {
                    borderColor: showAgentPicker ? colors.foreground + '4D' : colors.border,
                    backgroundColor: colors.secondary,
                  },
                ]}
              >
                <View style={[styles.dot, { backgroundColor: agentDot }]}>
                  {agentEmoji ? (
                    <Text style={styles.emoji}>{agentEmoji}</Text>
                  ) : (
                    <Text style={styles.dotLetter}>
                      {selectedAgent ? selectedAgent.charAt(0) : '?'}
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.pillLabel,
                    { color: selectedAgent ? colors.foreground : colors.mutedForeground },
                  ]}
                  numberOfLines={1}
                >
                  {agentLabel}
                </Text>
                <Animated.View style={agentChevronStyle}>
                  <ChevronDown size={12} color={colors.mutedForeground} />
                </Animated.View>
              </Pressable>
            </View>
          </View>

          <InputBarHeaderToggles
            showThinking={showThinking}
            showToolCalls={showToolCalls}
            onToggleThinking={onToggleThinking}
            onToggleToolCalls={onToggleToolCalls}
            onRefreshPress={onRefreshPress}
          />
        </View>

        <InputBarPickerModal
          visible={modalVisible}
          anchor={anchor}
          pickerKind={pickerKind}
          items={items}
          selectedModel={selectedModel}
          selectedAgent={selectedAgent}
          bottom={bottom}
          left={left}
          maxHeight={maxDropdownHeight}
          onClose={closePickers}
          onPick={onPick}
        />
      </>
    );
  },
);

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
    flexShrink: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    maxWidth: 160,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotLetter: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emoji: {
    fontSize: 9,
  },
  pillLabel: {
    fontSize: FontSize.xs,
    flexShrink: 1,
  },
});
