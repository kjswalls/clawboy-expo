import { StyleSheet } from 'react-native';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';

export const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius['2xl'],
    paddingVertical: Spacing.xs,
    overflow: 'hidden',
  },
  // ── Header bar (shared by multi-Q and single-Q) ────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.xs,
  },
  headerSingle: {
    justifyContent: 'flex-start',
  },
  headerMulti: {
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  multiHeaderTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
  counter: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
  navButtons: {
    flexDirection: 'row',
    gap: 2,
  },
  navBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.sm,
  },
  // ── Collapse / expand ────────────────────────────────────────────────────
  measureHidden: {
    position: 'absolute',
    opacity: 0,
    zIndex: -1,
    left: 0,
    right: 0,
  },
  summaryGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 40,
  },
  collapsedPromptCompact: {
    paddingTop: 2,
  },
  // ── Question prompt ───────────────────────────────────────────────────────
  promptLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
    paddingBottom: 2,
  },
  questionSeparator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.sm,
    marginTop: Spacing.xs,
    marginBottom: 2,
  },
  skippedLabel: {
    fontSize: FontSize.xs,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
    fontStyle: 'italic',
  },
  // ── Choice rows ──────────────────────────────────────────────────────────
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    minHeight: 40,
    borderRadius: BorderRadius.md,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badgeLetter: {
    fontSize: FontSize.xs,
    lineHeight: FontSize.xs + 2,
  },
  choiceLabelWrap: {
    flex: 1,
    gap: 2,
  },
  choiceLabel: {
    fontSize: FontSize.sm,
  },
  choiceHint: {
    fontSize: FontSize.xs,
  },
  // ── Free-form row ─────────────────────────────────────────────────────────
  freeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  freeInput: {
    flex: 1,
    fontSize: FontSize.sm,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  // ── Send footer ───────────────────────────────────────────────────────────
  sendFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    minHeight: 30,
  },
  footerSideText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  footerSpacer: {
    flex: 1,
  },
  sendBtn: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    height: 34,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    flexShrink: 0,
  },
  sendBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  // ── Consumed quote pill ───────────────────────────────────────────────────
  quotePill: {
    marginHorizontal: Spacing.sm,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: 2,
  },
  quotePillCaption: {
    fontSize: FontSize.xs,
  },
  quotePillValue: {
    fontSize: FontSize.sm,
  },
});
