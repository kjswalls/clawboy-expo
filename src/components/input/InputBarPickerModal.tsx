import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, type LayoutRectangle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';

import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { ProviderIcon } from '@/components/common/ProviderIcon';
import type { ProviderSlug } from '@/lib/modelProvider';
import { formatCtxWindow } from '@/lib/formatTokens';
import { useTranslation } from 'react-i18next';

const ROW_H = 44;

export interface PickerItem {
  key: string;
  title: string;
  dot: string;
  emoji?: string;
  /** For model rows: provider slug used to render ProviderIcon instead of a letter dot */
  providerSlug?: ProviderSlug;
  /** Secondary line shown beneath the title (e.g. model ID for aliases) */
  subtitle?: string;
  /** Show a "reasoning" badge on the row */
  reasoning?: boolean;
  /** Context window size in tokens — rendered as a compact label */
  contextWindow?: number;
  /** Whether the model accepts image input */
  supportsImages?: boolean;
}

export interface PickerSection {
  title: string;
  items: PickerItem[];
}

interface InputBarPickerModalProps {
  visible: boolean;
  anchor: LayoutRectangle | null;
  pickerKind: 'model' | 'agent' | null;
  /** Flat list — used by the agent picker */
  items?: PickerItem[];
  /** Grouped sections — used by the model picker */
  sections?: PickerSection[];
  selectedModel?: string;
  selectedAgent?: string;
  bottom: number;
  left: number;
  width: number;
  maxHeight: number;
  isLoading?: boolean;
  onClose: () => void;
  onPick: (title: string) => void;
}

export function InputBarPickerModal({
  visible,
  anchor,
  pickerKind,
  items = [],
  sections,
  selectedModel,
  selectedAgent,
  bottom,
  left,
  width,
  maxHeight,
  isLoading = false,
  onClose,
  onPick,
}: InputBarPickerModalProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const { t } = useTranslation();

  const isSelected = (item: PickerItem): boolean =>
    pickerKind === 'model'
      ? selectedModel === item.title
      : selectedAgent === item.title;

  const renderRow = (item: PickerItem): React.JSX.Element => {
    const selected = isSelected(item);
    const hasMetaLine = item.subtitle || item.contextWindow;
    const hasBadges = item.reasoning || item.supportsImages;
    const hasMeta = hasMetaLine || hasBadges;
    return (
      <Pressable
        key={item.key}
        onPress={() => onPick(item.title)}
        style={[
          styles.ddRow,
          { backgroundColor: selected ? colors.secondary : 'transparent' },
          hasMeta ? styles.ddRowTall : undefined,
        ]}
      >
        {item.providerSlug ? (
          <ProviderIcon
            slug={item.providerSlug}
            color={item.dot}
            fallbackChar={item.title.charAt(0)}
            size={20}
          />
        ) : (
          <View style={[styles.ddDot, { backgroundColor: item.dot }]}>
            {item.emoji ? (
              <Text style={styles.emojiSm}>{item.emoji}</Text>
            ) : (
              <Text style={styles.dotLetterSm}>{item.title.charAt(0)}</Text>
            )}
          </View>
        )}
        <View style={styles.ddText}>
          <Text style={[styles.ddTitle, { color: colors.foreground }]} numberOfLines={1}>
            {item.title}
          </Text>
          {hasMeta ? (
            <View style={styles.ddMeta}>
              {hasMetaLine ? (
                <View style={styles.ddInfoRow}>
                  {item.subtitle ? (
                    <Text style={[styles.ddSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  ) : null}
                  {item.subtitle && item.contextWindow ? (
                    <Text style={[styles.ddDotDivider, { color: colors.mutedForeground }]}>•</Text>
                  ) : null}
                  {item.contextWindow ? (
                    <Text style={[styles.ddCtx, { color: colors.mutedForeground }]}>
                      {formatCtxWindow(item.contextWindow)}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {hasBadges ? (
                <View style={styles.ddBadgeRow}>
                  {item.reasoning ? (
                    <View style={[styles.badge, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '55' }]}>
                    <Text style={[styles.badgeText, { color: colors.primary }]}>{t('input.palette.reasoning')}</Text>
                  </View>
                ) : null}
                  {item.supportsImages ? (
                    <View style={[styles.badge, { backgroundColor: colors.mutedForeground + '18', borderColor: colors.mutedForeground + '40' }]}>
                      <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>{t('input.palette.vision')}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        {selected ? <Check size={16} color={colors.primary} /> : null}
      </Pressable>
    );
  };

  const isEmpty = sections ? sections.every((s) => s.items.length === 0) : items.length === 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {anchor && pickerKind ? (
          <Animated.View
            entering={FadeInDown.duration(150)}
            style={[
              styles.dropdown,
              {
                bottom,
                left,
                width,
                maxHeight,
                borderColor: colors.border,
                backgroundColor: colors.popover,
              },
            ]}
          >
            <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
              {isLoading && isEmpty ? (
                <View style={styles.ddEmpty}>
                  <ActivityIndicator size="small" color={colors.mutedForeground} />
                </View>
              ) : isEmpty ? (
                <View style={styles.ddEmpty}>
                  <Text style={[styles.ddEmptyText, { color: colors.mutedForeground }]}>
                    {pickerKind === 'model' ? t('input.noModels') : t('input.noAgents')}
                  </Text>
                </View>
              ) : sections ? (
                sections.map((section, si) =>
                  section.items.length === 0 ? null : (
                    <View key={section.title}>
                      {(si > 0 || sections.length > 1) && (
                        <Text
                          style={[styles.sectionHeader, { color: colors.mutedForeground, borderTopColor: colors.border }]}
                        >
                          {section.title.toUpperCase()}
                        </Text>
                      )}
                      {section.items.map(renderRow)}
                    </View>
                  ),
                )
              ) : (
                items.map(renderRow)
              )}
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  dropdown: {
    position: 'absolute',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 2,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  ddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    minHeight: ROW_H,
  },
  ddRowTall: {
    minHeight: ROW_H + 10,
    alignItems: 'flex-start',
    paddingTop: 12,
    paddingBottom: 12,
  },
  ddDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ddText: {
    flex: 1,
    minWidth: 0,
  },
  ddTitle: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  ddMeta: {
    flexDirection: 'column',
    gap: 3,
    marginTop: 3,
  },
  ddInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  ddBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ddSubtitle: {
    fontSize: 10,
    opacity: 0.7,
    flexShrink: 1,
  },
  ddDotDivider: {
    fontSize: 10,
    opacity: 0.6,
  },
  ddCtx: {
    fontSize: 10,
    opacity: 0.75,
  },
  badge: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  dotLetterSm: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emojiSm: {
    fontSize: 10,
  },
  ddEmpty: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  ddEmptyText: {
    fontSize: FontSize.xs,
    fontStyle: 'italic',
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
