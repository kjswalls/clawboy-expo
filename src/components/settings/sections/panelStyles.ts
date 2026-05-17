import { StyleSheet } from 'react-native';
import { BorderRadius } from '@/constants/theme';
import type { TokenSet } from '@/hooks/useTokens';

export function createPanelStyles(tk: TokenSet) {
  return StyleSheet.create({
    flex: { flex: 1 },
    sectionTitle: { fontSize: tk.fs.sm, fontWeight: '600' as const, marginBottom: 12 },
    card: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: BorderRadius.xl,
      overflow: 'hidden' as const,
    },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: tk.sp.sm,
      paddingHorizontal: tk.sp.md,
      paddingVertical: tk.sp.sm,
      minHeight: tk.minTouch,
    },
    divider: { height: StyleSheet.hairlineWidth, marginHorizontal: tk.sp.md },
    footer: {
      alignItems: 'center' as const,
      paddingVertical: tk.sp['2xl'],
      gap: 0,
    },
    bugBtn: {
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      paddingHorizontal: tk.sp.md,
      paddingVertical: 7,
      marginBottom: tk.sp.md,
    },
  });
}
