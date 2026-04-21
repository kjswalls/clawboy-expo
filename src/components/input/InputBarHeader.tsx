import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutRectangle } from 'react-native';
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
import { MOCK_AGENTS, MOCK_MODELS } from './pickerModels';

const ROW_H = 44;

export interface InputBarHeaderHandle {
  closePickers: () => void;
}

interface InputBarHeaderProps {
  selectedModel: string;
  selectedAgent: string;
  onSelectModel: (name: string) => void;
  onSelectAgent: (name: string) => void;
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

    const modelDot =
      MOCK_MODELS.find((m) => m.name === selectedModel)?.dotBg ?? MOCK_MODELS[0].dotBg;
    const agentMeta = MOCK_AGENTS.find((a) => a.name === selectedAgent) ?? MOCK_AGENTS[0];

    const modalVisible = showModelPicker || showAgentPicker;
    const items: PickerItem[] =
      pickerKind === 'model'
        ? MOCK_MODELS.map((m) => ({
            key: m.id,
            title: m.name,
            dot: m.dotBg,
            emoji: undefined,
          }))
        : pickerKind === 'agent'
          ? MOCK_AGENTS.map((a) => ({
              key: a.id,
              title: a.name,
              dot: a.dotBg,
              emoji: a.emoji,
            }))
          : [];

    const dropdownHeight =
      pickerKind === null ? 0 : Math.min(items.length * ROW_H + 40, 280);

    const top =
      anchor && pickerKind
        ? Math.max(insets.top + 8, anchor.y - dropdownHeight - 8)
        : 0;
    const left = anchor ? anchor.x : 0;

    const onPick = (title: string): void => {
      if (pickerKind === 'model') {
        onSelectModel(title);
      } else if (pickerKind === 'agent') {
        onSelectAgent(title);
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
                  <Text style={styles.dotLetter}>{selectedModel.charAt(0)}</Text>
                </View>
                <Text style={[styles.pillLabel, { color: colors.foreground }]} numberOfLines={1}>
                  {selectedModel}
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
                <View style={[styles.dot, { backgroundColor: agentMeta.dotBg }]}>
                  <Text style={styles.emoji}>{agentMeta.emoji}</Text>
                </View>
                <Text style={[styles.pillLabel, { color: colors.foreground }]} numberOfLines={1}>
                  {selectedAgent}
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
          top={top}
          left={left}
          maxHeight={dropdownHeight}
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
