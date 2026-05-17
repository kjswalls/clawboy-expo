import React, { useCallback, useSyncExternalStore } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/useTheme';
import { useTokens } from '@/hooks/useTokens';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import {
  clearDictationEntries,
  getDictationEntries,
  subscribeDictation,
  type DictationEntry,
} from '@/lib/dictationProbe';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function EntryRow({ item }: { item: DictationEntry }): React.JSX.Element {
  const { colors } = useTheme();
  const tk = useTokens();
  const display = item.tail ? `${item.head}…${item.tail}` : item.head;
  return (
    <View style={styles.entryRow}>
      <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, fontFamily: 'monospace' }}>
        {formatTs(item.ts)}
      </Text>
      <Text style={{ color: colors.foreground, fontSize: tk.fs.xs, fontFamily: 'monospace', flex: 1 }}>
        {` [${item.len}] ${display}`}
      </Text>
    </View>
  );
}

export function DictationProbeModal({ visible, onClose }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const tk = useTokens();
  const insets = useSafeAreaInsets();

  const entries = useSyncExternalStore(subscribeDictation, getDictationEntries, getDictationEntries);

  const handleCopyAll = useCallback((): void => {
    void Clipboard.setStringAsync(JSON.stringify(entries, null, 2));
  }, [entries]);

  const handleClear = useCallback((): void => {
    clearDictationEntries();
  }, []);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={{ color: colors.foreground, fontSize: tk.fs.base, fontWeight: '600' }}>
            Dictation Probe Log
          </Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={{ color: colors.primary, fontSize: tk.fs.base }}>Close</Text>
          </Pressable>
        </View>

        <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={handleCopyAll}
            style={({ pressed }) => [styles.toolbarBtn, { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
          >
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm }}>Copy all</Text>
          </Pressable>
          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [styles.toolbarBtn, { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
          >
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm }}>Clear</Text>
          </Pressable>
          <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs }}>
            {entries.length} tick{entries.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {entries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.sm, textAlign: 'center', lineHeight: 20 }}>
              No dictation ticks captured.{'\n'}Enable "Log dictation ticks" in Experiments and dictate into the composer.
            </Text>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => <EntryRow item={item} />}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    padding: Spacing.sm,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  listContent: {
    padding: Spacing.sm,
  },
  entryRow: {
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 2,
  },
});
