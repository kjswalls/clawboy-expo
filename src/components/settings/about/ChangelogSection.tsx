import React, { useCallback, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '@/types';
import type { ChangelogEntry, ChangelogSection as ChangelogBodySection } from '@/constants/changelog';
import { CHANGELOG_ENTRIES } from '@/constants/changelog';
import { CHANGELOG_WEB_URL } from '@/lib/appMeta';
import i18n from '@/i18n';
import { Divider, styles, type LabelItemsSection } from './aboutStyles';

export function parseChangelogEntries(raw: unknown): ChangelogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ChangelogEntry[] = [];
  for (const el of raw) {
    if (!el || typeof el !== 'object') continue;
    const o = el as Record<string, unknown>;
    if (typeof o.version !== 'string') continue;
    const date: string | null =
      o.date === null || typeof o.date === 'string' ? (o.date as string | null) : null;
    const sectionsRaw = o.sections;
    if (!Array.isArray(sectionsRaw)) continue;
    const sections: ChangelogBodySection[] = [];
    for (const s of sectionsRaw) {
      if (!s || typeof s !== 'object') continue;
      const so = s as Record<string, unknown>;
      const title = typeof so.title === 'string' ? so.title : '';
      const itemsRaw = so.items;
      if (!Array.isArray(itemsRaw)) continue;
      const items = itemsRaw.filter((x): x is string => typeof x === 'string');
      sections.push({ title, items });
    }
    const entry: ChangelogEntry = { version: o.version, date, sections };
    if (typeof o.emptyNote === 'string') {
      entry.emptyNote = o.emptyNote;
    }
    out.push(entry);
  }
  return out;
}

export function formatReleaseDate(iso: string): string {
  try {
    // Append T00:00:00 so the date is interpreted as local midnight, not UTC
    const d = new Date(`${iso}T00:00:00`);
    return new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
  } catch {
    return iso;
  }
}

function simplifyChangelogPreviewLine(source: string): string {
  return source
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function firstChangelogPreviewBullets(entry: ChangelogEntry, maxBullets: number): string[] {
  if (maxBullets <= 0) return [];
  if (entry.sections.length === 0) {
    if (entry.emptyNote != null && entry.emptyNote.length > 0) {
      return [simplifyChangelogPreviewLine(entry.emptyNote)];
    }
    return [];
  }
  for (const sec of entry.sections) {
    if (sec.items.length > 0) {
      return sec.items.slice(0, maxBullets).map(simplifyChangelogPreviewLine);
    }
  }
  return [];
}

export function LabelItemsCollapsiblePreview({
  sections,
  colors,
}: {
  sections: LabelItemsSection[];
  colors: ThemeColors;
}): React.JSX.Element | null {
  const s0 = sections[0];
  if (s0 == null) return null;
  return (
    <View style={styles.collapsiblePreviewBlock}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]} numberOfLines={2}>
        {s0.label}
      </Text>
      <View style={styles.itemList}>
        {s0.items.slice(0, 2).map((item, ii) => (
          <View key={ii} style={styles.bulletRow}>
            <Text style={[styles.bullet, { color: colors.mutedForeground }]}>{'•'}</Text>
            <Text style={[styles.bulletText, { color: colors.foreground }]} numberOfLines={4}>
              {item}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ChangelogSection({ colors }: { colors: ThemeColors }): React.JSX.Element {
  const { t, i18n: i18nInstance } = useTranslation();
  const entries = useMemo((): ChangelogEntry[] => {
    const filterEmptyUnreleased = (list: ChangelogEntry[]): ChangelogEntry[] =>
      list.filter(
        (e) =>
          !(
            e.version === 'Unreleased' &&
            e.sections.length === 0 &&
            e.emptyNote != null
          ),
      );

    if (i18nInstance.language.startsWith('zh')) {
      const parsed = parseChangelogEntries(t('about.changelogEntries', { returnObjects: true }));
      if (parsed.length > 0) return filterEmptyUnreleased(parsed);
    }
    return filterEmptyUnreleased(CHANGELOG_ENTRIES);
  }, [i18nInstance.language, t]);

  const head = entries[0];
  const openFullChangelog = useCallback((): void => {
    void WebBrowser.openBrowserAsync(CHANGELOG_WEB_URL);
  }, []);

  const previewLines = head == null ? [] : firstChangelogPreviewBullets(head, 3);
  const isUnreleased = head?.version === 'Unreleased';

  return (
    <View style={styles.changelogOuter}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.changelogCardTitle, { color: colors.foreground }]}>{t('about.changelog')}</Text>
        <Divider color={colors.border} />
        {head != null ? (
          <>
            <View style={styles.entryHeader}>
              <Text style={[styles.entryVersion, { color: colors.foreground }]}>
                {isUnreleased ? t('about.unreleased') : head.version}
              </Text>
              {head.date != null && (
                <Text style={[styles.entryDate, { color: colors.mutedForeground }]}>
                  {formatReleaseDate(head.date)}
                </Text>
              )}
            </View>
            <View style={styles.itemList}>
              {previewLines.map((line, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={[styles.bullet, { color: colors.mutedForeground }]}>{'•'}</Text>
                  <Text style={[styles.bulletText, { color: colors.foreground }]} numberOfLines={5}>
                    {line}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
        <Divider color={colors.border} />
        <Pressable
          onPress={openFullChangelog}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          accessibilityRole="link"
          accessibilityLabel={t('about.fullChangelogA11y')}
        >
          <Text style={[styles.rowLabel, { color: colors.foreground, flex: 1 }]}>{t('about.fullChangelog')}</Text>
          <ChevronRight size={14} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}
