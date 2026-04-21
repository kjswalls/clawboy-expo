import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type LayoutRectangle } from 'react-native';
import { Check } from 'lucide-react-native';

import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
const ROW_H = 44;

export interface PickerItem {
  key: string;
  title: string;
  dot: string;
  emoji?: string;
}

interface InputBarPickerModalProps {
  visible: boolean;
  anchor: LayoutRectangle | null;
  pickerKind: 'model' | 'agent' | null;
  items: PickerItem[];
  selectedModel: string;
  selectedAgent: string;
  top: number;
  left: number;
  maxHeight: number;
  onClose: () => void;
  onPick: (title: string) => void;
}

export function InputBarPickerModal({
  visible,
  anchor,
  pickerKind,
  items,
  selectedModel,
  selectedAgent,
  top,
  left,
  maxHeight,
  onClose,
  onPick,
}: InputBarPickerModalProps): React.JSX.Element {
  const { colors } = useThemeContext();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {anchor && pickerKind ? (
          <View
            style={[
              styles.dropdown,
              {
                top,
                left,
                width: 192,
                maxHeight,
                borderColor: colors.border,
                backgroundColor: colors.popover,
              },
            ]}
          >
            <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
              {items.map((item) => {
                const selected =
                  pickerKind === 'model'
                    ? selectedModel === item.title
                    : selectedAgent === item.title;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => onPick(item.title)}
                    style={[
                      styles.ddRow,
                      { backgroundColor: selected ? colors.secondary : 'transparent' },
                    ]}
                  >
                    <View style={[styles.ddDot, { backgroundColor: item.dot }]}>
                      {item.emoji ? (
                        <Text style={styles.emojiSm}>{item.emoji}</Text>
                      ) : (
                        <Text style={styles.dotLetterSm}>{item.title.charAt(0)}</Text>
                      )}
                    </View>
                    <Text style={[styles.ddTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {selected ? <Check size={16} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
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
  ddDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ddTitle: {
    fontSize: FontSize.sm,
    flex: 1,
    minWidth: 0,
  },
  dotLetterSm: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emojiSm: {
    fontSize: 10,
  },
});
