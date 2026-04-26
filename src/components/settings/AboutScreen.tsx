import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Updates from 'expo-updates';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, RefreshCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_NAME, APP_VERSION, BUILD_NUMBER, UPDATE_ID } from '@/lib/appMeta';
import { CHANGELOG_ENTRIES } from '@/constants/changelog';
import type { ChangelogEntry } from '@/constants/changelog';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function formatReleaseDate(iso: string): string {
  try {
    // Append T00:00:00 so the date is interpreted as local midnight, not UTC
    const d = new Date(`${iso}T00:00:00`);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
  } catch {
    return iso;
  }
}

// ── Check-for-updates state ────────────────────────────────────────────────

type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; critical: boolean }
  | { kind: 'none' }
  | { kind: 'error'; message: string };

// ── Main component ─────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function AboutScreen({ visible, onClose }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ kind: 'idle' });
  const [reloading, setReloading] = useState(false);

  const checkForUpdates = useCallback(async (): Promise<void> => {
    if (!Updates.isEnabled) {
      Alert.alert('Updates disabled', 'OTA updates are not active in this build (e.g. Expo Go or local dev build).');
      return;
    }
    setUpdateStatus({ kind: 'checking' });
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        setUpdateStatus({ kind: 'none' });
        return;
      }
      const fetched = await Updates.fetchUpdateAsync();
      const extra = (fetched.manifest as Record<string, unknown> | null | undefined);
      const critical = extra?.['extra'] != null && (extra['extra'] as Record<string, unknown>)['critical'] === true;
      setUpdateStatus({ kind: 'available', critical });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUpdateStatus({ kind: 'error', message: msg });
    }
  }, []);

  const applyUpdate = useCallback(async (): Promise<void> => {
    setReloading(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setReloading(false);
    }
  }, []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Close about screen"
            accessibilityRole="button"
          >
            <ArrowLeft size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>About</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom + Spacing.lg, 32) }]}
          showsVerticalScrollIndicator={false}
        >
          {/* App identity */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MetaRow label="App" value={APP_NAME} colors={{ fg: colors.foreground, muted: colors.mutedForeground }} />
            <Divider color={colors.border} />
            <MetaRow label="Version" value={APP_VERSION} mono colors={{ fg: colors.foreground, muted: colors.mutedForeground }} />
            <Divider color={colors.border} />
            <MetaRow label="Build" value={BUILD_NUMBER} mono colors={{ fg: colors.foreground, muted: colors.mutedForeground }} />
            <Divider color={colors.border} />
            <MetaRow
              label="Update ID"
              value={UPDATE_ID ?? 'embedded (store build)'}
              mono
              colors={{ fg: colors.foreground, muted: colors.mutedForeground }}
            />
          </View>

          {/* Check for updates */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: Spacing.md }]}>
            <Pressable
              onPress={() => { void checkForUpdates(); }}
              disabled={updateStatus.kind === 'checking'}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
              accessibilityLabel="Check for updates"
              accessibilityRole="button"
            >
              <RefreshCw size={16} color={colors.mutedForeground} />
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>
                Check for updates
              </Text>
              {updateStatus.kind === 'checking' && (
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              )}
            </Pressable>

            <UpdateBadge status={updateStatus} colors={colors} onApply={() => { void applyUpdate(); }} reloading={reloading} />
          </View>

          {/* Changelog */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Changelog</Text>

          {CHANGELOG_ENTRIES.map((entry, i) => (
            <ChangelogEntryCard
              key={entry.version}
              entry={entry}
              colors={colors}
              style={i > 0 ? { marginTop: Spacing.sm } : undefined}
            />
          ))}

          <ChangelogFootnote colors={colors} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── ChangelogEntryCard ─────────────────────────────────────────────────────

function ChangelogEntryCard({
  entry,
  colors,
  style,
}: {
  entry: ChangelogEntry;
  colors: ThemeColors;
  style?: object;
}): React.JSX.Element {
  const isUnreleased = entry.version === 'Unreleased';

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      {/* Version header row */}
      <View style={styles.entryHeader}>
        <Text style={[styles.entryVersion, { color: colors.foreground }]}>
          {isUnreleased ? 'Unreleased' : entry.version}
        </Text>
        {entry.date != null && (
          <Text style={[styles.entryDate, { color: colors.mutedForeground }]}>
            {formatReleaseDate(entry.date)}
          </Text>
        )}
      </View>

      {/* Empty note (e.g. Unreleased with no items) */}
      {entry.sections.length === 0 && entry.emptyNote != null && (
        <>
          <Divider color={colors.border} />
          <Text style={[styles.emptyNote, { color: colors.mutedForeground }]}>
            {entry.emptyNote}
          </Text>
        </>
      )}

      {/* Sections */}
      {entry.sections.map((section, si) => (
        <View key={si}>
          <Divider color={colors.border} />
          {section.title !== '' && (
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {section.title.toUpperCase()}
            </Text>
          )}
          <View style={styles.itemList}>
            {section.items.map((item, ii) => (
              <View key={ii} style={styles.bulletRow}>
                <Text style={[styles.bullet, { color: colors.mutedForeground }]}>{'•'}</Text>
                <Text style={[styles.bulletText, { color: colors.foreground }]}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// ── ChangelogFootnote ──────────────────────────────────────────────────────

function ChangelogFootnote({ colors }: { colors: ThemeColors }): React.JSX.Element {
  return (
    <View style={styles.footnote}>
      <Text style={[styles.footnoteText, { color: colors.mutedForeground }]}>
        Format:{' '}
        <Text
          style={[styles.footnoteLink, { color: colors.mutedForeground }]}
          onPress={() => { void WebBrowser.openBrowserAsync('https://keepachangelog.com/en/1.1.0/'); }}
          accessibilityRole="link"
        >
          Keep a Changelog
        </Text>
        {'  ·  '}
        <Text
          style={[styles.footnoteLink, { color: colors.mutedForeground }]}
          onPress={() => { void WebBrowser.openBrowserAsync('https://semver.org/spec/v2.0.0.html'); }}
          accessibilityRole="link"
        >
          Semantic Versioning
        </Text>
      </Text>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MetaRow({
  label,
  value,
  mono = false,
  colors,
}: {
  label: string;
  value: string;
  mono?: boolean;
  colors: { fg: string; muted: string };
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={[styles.metaLabel, { color: colors.muted }]}>{label}</Text>
      <Text
        style={[styles.metaValue, { color: colors.fg }, mono && styles.metaMono]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

function Divider({ color }: { color: string }): React.JSX.Element {
  return <View style={[styles.divider, { backgroundColor: color }]} />;
}

type UpdateBadgeProps = {
  status: UpdateStatus;
  colors: ReturnType<typeof useTheme>['colors'];
  onApply: () => void;
  reloading: boolean;
};

function UpdateBadge({ status, colors, onApply, reloading }: UpdateBadgeProps): React.JSX.Element | null {
  if (status.kind === 'idle' || status.kind === 'checking') return null;

  if (status.kind === 'none') {
    return (
      <View style={[styles.badge, { backgroundColor: `${colors.success}18` }]}>
        <Text style={{ color: colors.success, fontSize: FontSize.xs }}>You're on the latest version.</Text>
      </View>
    );
  }

  if (status.kind === 'error') {
    return (
      <View style={[styles.badge, { backgroundColor: `${colors.destructive}18` }]}>
        <Text style={{ color: colors.destructive, fontSize: FontSize.xs }}>{status.message}</Text>
      </View>
    );
  }

  // available
  const badgeColor = status.critical ? colors.warning : colors.primary;
  const label = status.critical
    ? 'Security update downloaded — restart required.'
    : 'Update downloaded — will apply on next launch.';

  return (
    <View style={[styles.badge, { backgroundColor: `${badgeColor}18` }]}>
      <Text style={{ color: badgeColor, fontSize: FontSize.xs, flex: 1 }}>{label}</Text>
      {status.critical && (
        <Pressable
          onPress={onApply}
          disabled={reloading}
          style={({ pressed }) => [
            styles.restartBtn,
            { backgroundColor: badgeColor, opacity: pressed || reloading ? 0.75 : 1 },
          ]}
          accessibilityLabel="Restart now"
          accessibilityRole="button"
        >
          {reloading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={{ color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.semibold }}>Restart</Text>}
        </Pressable>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.md, paddingTop: Spacing.lg },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  metaLabel: { fontSize: FontSize.sm, width: 80 },
  metaValue: { flex: 1, fontSize: FontSize.sm, textAlign: 'right' },
  metaMono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginTop: Spacing.xl, marginBottom: 12 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
  },
  restartBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
    minWidth: 64,
    alignItems: 'center',
  },
  // Changelog entry card
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  entryVersion: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  entryDate: {
    fontSize: FontSize.xs,
  },
  emptyNote: {
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  itemList: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  bullet: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    width: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  // Footnote
  footnote: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    alignItems: 'center',
  },
  footnoteText: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  footnoteLink: {
    textDecorationLine: 'underline',
  },
});
