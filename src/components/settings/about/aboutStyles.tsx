import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';

export type LabelItemsSection = {
  label: string;
  items: string[];
};

export function parseLabelItemSections(raw: unknown): LabelItemsSection[] {
  if (!Array.isArray(raw)) return [];
  const out: LabelItemsSection[] = [];
  for (const el of raw) {
    if (!el || typeof el !== 'object') continue;
    const o = el as Record<string, unknown>;
    if (typeof o.label !== 'string' || !Array.isArray(o.items)) continue;
    const items = o.items.filter((x): x is string => typeof x === 'string');
    out.push({ label: o.label, items });
  }
  return out;
}

export function Divider({ color }: { color: string }): React.JSX.Element {
  return <View style={[styles.divider, { backgroundColor: color }]} />;
}

export const styles = StyleSheet.create({
  root: { flex: 1 },
  fieldLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.md, paddingTop: Spacing.xs },
  logoWrap: { alignItems: 'center', marginBottom: Spacing.sm },
  logo: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: { width: '100%', height: '100%' },
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
  // Collapsible
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  collapsibleHeaderContent: {
    flex: 1,
  },
  collapsibleBody: {
    position: 'relative',
    alignSelf: 'stretch',
  },
  fadeGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 52,
  },
  chevronToggleRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // Changelog section
  changelogOuter: {
    marginTop: Spacing.xl,
  },
  changelogCardTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 2,
  },
  collapsiblePreviewBlock: {
    paddingBottom: 4,
  },
  // Privacy card
  privacyHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  privacyTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
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
  threatModelLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  threatModelLinkText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
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
  footnoteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  footnoteLink: {
    fontSize: FontSize.xs,
    textDecorationLine: 'none',
    borderBottomWidth: 1,
  },
});
