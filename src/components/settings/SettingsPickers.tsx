import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bot, Cpu, X } from 'lucide-react-native';
import type { Agent } from '@/lib/openclaw/types';
import type { Model, ThemeColors } from '@/types';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

const MODEL_DOTS = ['#A855F7', '#3B82F6', '#22C55E', '#EAB308'] as const;

function modelColor(id: string): string {
  let n = 0;
  for (let i = 0; i < id.length; i++) {
    n = (n + id.charCodeAt(i)!) % 997;
  }
  return MODEL_DOTS[n % MODEL_DOTS.length]!;
}

export function AgentPickerModal({
  visible,
  onClose,
  colors,
  agents,
  currentId,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ThemeColors;
  agents: Agent[];
  currentId: string | null | undefined;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.cardForeground }]}>Agents</Text>
            <Pressable onPress={onClose} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
              <X size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <FlatList
            data={agents}
            keyExtractor={(a) => a.id}
            renderItem={({ item }) => {
              const active = item.id === currentId;
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    { borderBottomColor: colors.border, backgroundColor: active ? colors.secondary : 'transparent' },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Bot size={16} color={colors.primary} />
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: colors.cardForeground }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.status ? (
                      <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{item.status}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

export function ModelPickerModal({
  visible,
  onClose,
  colors,
  models,
  currentId,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ThemeColors;
  models: Model[];
  currentId: string | null;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.cardForeground }]}>Models</Text>
            <Pressable onPress={onClose}>
              <X size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <FlatList
            data={models}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => {
              const active = item.id === currentId;
              const dot = modelColor(item.id);
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    { borderBottomColor: colors.border, backgroundColor: active ? colors.secondary : 'transparent' },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <View style={[styles.modelDot, { backgroundColor: dot }]} />
                  <Cpu size={14} color={colors.mutedForeground} />
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: colors.cardForeground }]} numberOfLines={1}>
                      {item.name ?? item.id}
                    </Text>
                    {item.provider ? (
                      <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {item.provider}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '72%',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: 1,
    paddingBottom: Spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
  },
  sheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  rowSub: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  modelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
