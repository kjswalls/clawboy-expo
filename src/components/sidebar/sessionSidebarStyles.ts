import { StyleSheet } from 'react-native';

import { BorderRadius, FontWeight } from '@/constants/theme';
import type { TokenSet } from '@/hooks/useTokens';

export function createSessionSidebarStyles(tk: TokenSet) {
  return StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFillObject,
    },
    gestureLayer: {
      flex: 1,
      width: '100%',
      height: '100%',
    },
    sidebar: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      zIndex: 2,
      flexDirection: 'column',
    },
    edgeStrip: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 48,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: tk.sp.lg,
      paddingVertical: tk.sp.sm,
    },
    headerTitle: {
      fontSize: tk.fs.sm,
      fontWeight: FontWeight.medium,
    },
    iconHit: {
      padding: 6,
      borderRadius: BorderRadius.md,
      minWidth: tk.minTouch,
      minHeight: tk.minTouch,
      alignItems: 'center',
      justifyContent: 'center',
    },
    newSessionWrap: {
      paddingHorizontal: tk.sp.md,
      paddingBottom: tk.sp.md,
    },
    newSessionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      paddingHorizontal: tk.sp.md,
      paddingVertical: 6,
      borderRadius: BorderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
    },
    newSessionText: {
      fontSize: tk.fs.xs,
      fontWeight: FontWeight.semibold,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: tk.sp.md,
      paddingVertical: tk.sp.sm,
      gap: 4,
    },
    sectionHeaderLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sectionLabel: {
      fontSize: tk.fs.xs,
      fontWeight: FontWeight.semibold,
    },
    clearBtn: {
      fontSize: tk.fs.xs,
      fontWeight: FontWeight.semibold,
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    selectionBar: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: tk.sp.md,
      paddingVertical: tk.sp.xs,
    },
    emptyBig: {
      flex: 1,
      minHeight: 200,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: tk.sp['3xl'],
      gap: tk.sp.sm,
    },
    emptySmall: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: tk.sp['2xl'],
      gap: tk.sp.sm,
    },
    emptyText: {
      fontSize: tk.fs.sm,
    },
  });
}
