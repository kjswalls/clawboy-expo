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
import { ProviderIcon } from '@/components/common/ProviderIcon';
import type { ProviderSlug } from '@/lib/modelProvider';
import { useTranslation } from 'react-i18next';

import { InputBarPickerModal, type PickerItem, type PickerSection } from './InputBarPickerModal';
import { InputBarHeaderToggles } from './InputBarHeaderToggles';

const ROW_H = 44;
const ROW_H_TALL = 54;
const SECTION_H = 28;
/** Gap between picker bottom edge and top of anchor pill */
const PICKER_GAP = 8;

/** Neutral dot color used when no model/agent metadata is available. */
const EMPTY_DOT = '#6B7280';

export interface InputBarHeaderHandle {
  closePickers: () => void;
}

export interface DynamicPickerItem {
  id: string;
  name: string;
  dotBg?: string;
  emoji?: string;
  providerSlug?: ProviderSlug;
  subtitle?: string;
}

interface InputBarHeaderProps {
  selectedModel?: string;
  selectedAgent?: string;
  onSelectModel: (id: string, name: string) => void;
  onSelectAgent: (id: string, name: string) => void;
  modelItems?: DynamicPickerItem[];
  /** Grouped model sections — takes priority over modelItems when provided */
  modelSections?: PickerSection[];
  agentItems?: DynamicPickerItem[];
  showThinking: boolean;
  showToolCalls: boolean;
  /** Show a loading spinner in the picker when items are empty and this is true */
  isLoadingItems?: boolean;
  onToggleThinking?: () => void;
  onToggleToolCalls?: () => void;
  onRefreshPress?: () => void;
  isRefreshing?: boolean;
}

export const InputBarHeader = forwardRef<InputBarHeaderHandle, InputBarHeaderProps>(
  function InputBarHeader(
    {
      selectedModel,
      selectedAgent,
      onSelectModel,
      onSelectAgent,
      modelItems,
      modelSections,
      agentItems,
      showThinking,
      showToolCalls,
      isLoadingItems = false,
      onToggleThinking,
      onToggleToolCalls,
      onRefreshPress,
      isRefreshing,
    },
    ref,
  ): React.JSX.Element {
    const { colors } = useThemeContext();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { height: windowHeight, width: windowWidth } = useWindowDimensions();
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

    // Find the currently selected model entry for pill avatar
    const modelMatch = selectedModel
      ? (modelSections
          ? modelSections.flatMap((s) => s.items).find((m) => m.title === selectedModel)
          : resolvedModelItems.find((m) => m.name === selectedModel))
      : undefined;
    const agentMatch = selectedAgent
      ? resolvedAgentItems.find((a) => a.name === selectedAgent)
      : undefined;

    const modelLabel = selectedModel ?? t('input.selectModel');
    const agentLabel = selectedAgent ?? t('input.selectAgent');
    const modelDot = modelSections
      ? (modelMatch as PickerItem | undefined)?.dot ?? EMPTY_DOT
      : (modelMatch as DynamicPickerItem | undefined)?.dotBg ?? EMPTY_DOT;
    const modelProviderSlug = (modelSections ? (modelMatch as PickerItem | undefined)?.providerSlug : modelMatch?.providerSlug) ?? undefined;
    const agentDot = agentMatch?.dotBg ?? EMPTY_DOT;
    const agentEmoji = agentMatch?.emoji;

    const modalVisible = showModelPicker || showAgentPicker;

    // Build flat items for agent picker; model picker uses sections directly
    const agentPickerItems: PickerItem[] = resolvedAgentItems.map((a) => ({
      key: a.id,
      title: a.name,
      dot: a.dotBg ?? EMPTY_DOT,
      emoji: a.emoji,
    }));

    // Height estimation for the model picker dropdown
    const modelDropdownHeight = (): number => {
      if (!modelSections) {
        return resolvedModelItems.length === 0
          ? 60
          : Math.min(resolvedModelItems.length * ROW_H + 16, 320);
      }
      const totalItems = modelSections.reduce((n, s) => n + s.items.length, 0);
      const totalSections = modelSections.filter((s) => s.items.length > 0).length;
      if (totalItems === 0) return 60;
      const hasSubtitles = modelSections.some((s) => s.items.some((i) => i.subtitle));
      const rowH = hasSubtitles ? ROW_H_TALL : ROW_H;
      return Math.min(totalItems * rowH + totalSections * SECTION_H + 16, 360);
    };

    const agentDropdownHeight =
      resolvedAgentItems.length === 0 ? 60 : Math.min(resolvedAgentItems.length * ROW_H + 16, 280);

    const dropdownHeight = pickerKind === 'model' ? modelDropdownHeight() : agentDropdownHeight;

    const dropdownWidth = pickerKind === 'agent' ? 200 : 240;

    const bottom = anchor && pickerKind ? windowHeight - anchor.y + PICKER_GAP : 0;
    const left = anchor
      ? Math.max(
          Spacing.lg,
          Math.min(anchor.x, windowWidth - dropdownWidth - Spacing.lg),
        )
      : 0;

    const maxDropdownHeight =
      anchor && pickerKind
        ? Math.min(
            dropdownHeight,
            Math.max(0, anchor.y - insets.top - PICKER_GAP - 8),
          )
        : dropdownHeight;

    const onPick = (title: string): void => {
      if (pickerKind === 'model') {
        const allModelItems = modelSections
          ? modelSections.flatMap((s) => s.items)
          : resolvedModelItems.map((m) => ({ key: m.id, title: m.name, dot: '', providerSlug: m.providerSlug }));
        const item = allModelItems.find((m) => m.title === title);
        onSelectModel(item?.key ?? title, title);
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
            <View ref={modelWrapRef} collapsable={false} style={styles.pillWrapper}>
              <Pressable
                onPress={toggleModel}
                style={[
                  styles.pill,
                  {
                    borderColor: showModelPicker ? colors.foreground + '4D' : colors.border,
                    backgroundColor: colors.secondary,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('input.a11y.modelPicker', { model: modelLabel })}
                accessibilityState={{ expanded: showModelPicker }}
              >
                {modelProviderSlug ? (
                  <ProviderIcon
                    slug={modelProviderSlug}
                    color={modelDot}
                    fallbackChar={selectedModel ? selectedModel.charAt(0) : '?'}
                    size={16}
                  />
                ) : (
                  <View style={[styles.dot, { backgroundColor: modelDot }]}>
                    <Text style={styles.dotLetter}>
                      {selectedModel ? selectedModel.charAt(0) : '?'}
                    </Text>
                  </View>
                )}
                <Text
                  style={[
                    styles.pillLabel,
                    { color: selectedModel ? colors.foreground : colors.mutedForeground },
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {modelLabel}
                </Text>
                <Animated.View style={[modelChevronStyle, { flexShrink: 0 }]}>
                  <ChevronDown size={12} color={colors.mutedForeground} />
                </Animated.View>
              </Pressable>
            </View>

            <View ref={agentWrapRef} collapsable={false} style={styles.pillWrapper}>
              <Pressable
                onPress={toggleAgent}
                style={[
                  styles.pill,
                  {
                    borderColor: showAgentPicker ? colors.foreground + '4D' : colors.border,
                    backgroundColor: colors.secondary,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('input.a11y.agentPicker', { agent: agentLabel })}
                accessibilityState={{ expanded: showAgentPicker }}
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
                  ellipsizeMode="tail"
                >
                  {agentLabel}
                </Text>
                <Animated.View style={[agentChevronStyle, { flexShrink: 0 }]}>
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
            isRefreshing={isRefreshing}
          />
        </View>

        <InputBarPickerModal
          visible={modalVisible}
          anchor={anchor}
          pickerKind={pickerKind}
          items={pickerKind === 'agent' ? agentPickerItems : undefined}
          sections={pickerKind === 'model' ? modelSections : undefined}
          selectedModel={selectedModel}
          selectedAgent={selectedAgent}
          bottom={bottom}
          left={left}
          width={dropdownWidth}
          maxHeight={maxDropdownHeight}
          isLoading={isLoadingItems}
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
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  pillWrapper: {
    flexShrink: 1,
    minWidth: 0,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotLetter: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emoji: {
    fontSize: 11,
  },
  pillLabel: {
    fontSize: FontSize.xs,
    flexShrink: 1,
    minWidth: 0,
  },
});
