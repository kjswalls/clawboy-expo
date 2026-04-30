import React, { useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Check, ChevronDown, Lock } from 'lucide-react-native';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';

export interface ThemeVariantOption {
  id: string;
  label: string;
  /** If true, tapping shows a lock alert instead of selecting the variant. */
  locked?: boolean;
  /** Message shown when a locked variant is tapped. */
  lockHint?: string;
}

interface ThemeVariantDropdownProps {
  value: string;
  options: ThemeVariantOption[];
  onChange: (id: string) => void;
  colors: ThemeColors;
}

export function ThemeVariantDropdown({
  value,
  options,
  onChange,
  colors,
}: ThemeVariantDropdownProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<LayoutRectangle | null>(null);
  const triggerRef = useRef<View>(null);

  const selectedLabel = options.find((o) => o.id === value)?.label ?? value;
  const disabled = options.length <= 1;

  const openMenu = (): void => {
    triggerRef.current?.measure((_fx, _fy, w, h, px, py) => {
      setAnchor({ x: px, y: py, width: w, height: h });
      setOpen(true);
    });
  };

  const handlePick = (id: string): void => {
    onChange(id);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={openMenu}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: colors.secondary,
            borderColor: colors.border,
          },
          pressed && { opacity: 0.75 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Theme variant: ${selectedLabel}`}
        accessibilityHint="Opens theme variant picker"
      >
        <Text
          style={[styles.triggerLabel, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {selectedLabel}
        </Text>
        <ChevronDown
          size={12}
          color={colors.mutedForeground}
          style={disabled ? { opacity: 0.4 } : undefined}
        />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          {anchor ? (
            <Animated.View
              entering={FadeIn.duration(120)}
              style={[
                styles.menu,
                {
                  top: anchor.y + anchor.height + 4,
                  right: Math.max(8, Dimensions.get('window').width - (anchor.x + anchor.width)),
                  minWidth: Math.max(anchor.width, 160),
                  backgroundColor: colors.popover,
                  borderColor: colors.border,
                },
              ]}
            >
              {options.map((opt, idx) => {
                const selected = opt.id === value;
                return (
                  <React.Fragment key={opt.id}>
                    {idx > 0 && (
                      <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    )}
                    <Pressable
                      onPress={() => handlePick(opt.id)}
                      style={({ pressed }) => [
                        styles.menuRow,
                        selected && !opt.locked && { backgroundColor: `${colors.primary}12` },
                        opt.locked && { opacity: 0.55 },
                        pressed && { opacity: 0.65 },
                      ]}
                      accessibilityRole="menuitem"
                      accessibilityState={{ selected: selected && !opt.locked, disabled: opt.locked }}
                    >
                      <Text
                        style={[
                          styles.menuLabel,
                          {
                            color: opt.locked
                              ? colors.mutedForeground
                              : selected
                              ? colors.primary
                              : colors.foreground,
                            fontWeight: selected && !opt.locked ? '600' : '400',
                          },
                        ]}
                      >
                        {opt.label}
                      </Text>
                      {opt.locked
                        ? <Lock size={13} color={colors.mutedForeground} />
                        : selected
                        ? <Check size={14} color={colors.primary} />
                        : null}
                    </Pressable>
                  </React.Fragment>
                );
              })}
            </Animated.View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 160,
  },
  triggerLabel: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    flexShrink: 1,
  },
  modalRoot: {
    flex: 1,
  },
  menu: {
    position: 'absolute',
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 10,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    gap: Spacing.sm,
  },
  menuLabel: {
    fontSize: FontSize.sm,
    flexShrink: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.md,
  },
});
