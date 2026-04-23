/**
 * Design tokens for pixel-matching the v0 ClawBoy prototype (`reference/`).
 * Dark defaults use the Prompt 1 palette; light mode mirrors `app/globals.css` :root.
 */

export const Colors = {
  dark: {
    // Core: true black base + neutral grayscale surfaces.
    background: '#000000',
    foreground: '#FFFFFF',
    card: '#141414',
    cardForeground: '#FFFFFF',
    popover: '#141414',
    popoverForeground: '#FFFFFF',
    // Surfaces: input pills, selector buttons, and cards.
    secondary: '#202020',
    muted: '#202020',
    mutedForeground: '#A8A8A8',
    // Borders & inputs
    border: '#303030',
    input: '#202020',
    ring: '#A855F7',
    // Primary CTA / accent (v0 --primary / purple-500)
    primary: '#A855F7',
    primaryForeground: '#FAFAFA',
    accent: '#A855F7',
    accentForeground: '#FAFAFA',
    // User bubble (v0 .dark --user-bubble)
    userBubble: '#262626',
    userBubbleForeground: '#FAFAFA',
    aiBubble: 'transparent',
    aiBubbleForeground: '#FAFAFA',
    // Sidebar (v0 .dark --sidebar)
    sidebar: '#000000',
    sidebarForeground: '#FAFAFA',
    sidebarPrimary: '#A855F7',
    sidebarPrimaryForeground: '#FAFAFA',
    sidebarAccent: '#202020',
    sidebarAccentForeground: '#FAFAFA',
    sidebarBorder: '#2F2F2F',
    // Semantic
    destructive: '#DC2626',
    destructiveForeground: '#FAFAFA',
    success: '#22C55E',
    successForeground: '#000000',
    warning: '#EAB308',
    warningForeground: '#000000',
    thinking: '#A855F7',
    thinkingForeground: '#FAFAFA',
    tool: '#A855F7',
    toolForeground: '#FAFAFA',
    // Inline warning text — readable on the screen background (not on a warning button)
    warningText: '#EAB308',
    // Rainbow / gradient accents (input glow, v0 globals)
    accentViolet: '#8B5CF6',
    accentIndigo: '#6366F1',
    accentBlue: '#3B82F6',
    shimmerBase: '#8C8C8C',
    shimmerHighlight: '#F2F2F2',
  },
  light: {
    background: '#FFFFFF',
    foreground: '#0A0A0A',
    card: '#FFFFFF',
    cardForeground: '#0A0A0A',
    popover: '#FFFFFF',
    popoverForeground: '#0A0A0A',
    secondary: '#F4F4F5',
    muted: '#E4E4E7',
    mutedForeground: '#71717A',
    border: '#E4E4E7',
    input: '#F4F4F5',
    ring: '#A855F7',
    primary: '#A855F7',
    primaryForeground: '#FAFAFA',
    accent: '#A855F7',
    accentForeground: '#FAFAFA',
    userBubble: '#F4F4F5',
    userBubbleForeground: '#0A0A0A',
    aiBubble: 'transparent',
    aiBubbleForeground: '#0A0A0A',
    sidebar: '#FAFAFA',
    sidebarForeground: '#0A0A0A',
    sidebarPrimary: '#A855F7',
    sidebarPrimaryForeground: '#FAFAFA',
    sidebarAccent: '#F4F4F5',
    sidebarAccentForeground: '#0A0A0A',
    sidebarBorder: '#E4E4E7',
    destructive: '#DC2626',
    destructiveForeground: '#FAFAFA',
    success: '#22C55E',
    successForeground: '#FFFFFF',
    warning: '#EAB308',
    warningForeground: '#FFFFFF',
    thinking: '#A855F7',
    thinkingForeground: '#FAFAFA',
    tool: '#A855F7',
    toolForeground: '#FAFAFA',
    // Inline warning text — dark amber (readable on light backgrounds)
    warningText: '#92400E',
    accentViolet: '#8B5CF6',
    accentIndigo: '#6366F1',
    accentBlue: '#3B82F6',
    shimmerBase: '#8C8C8C',
    shimmerHighlight: '#F2F2F2',
  },
} as const;

/** v0 --radius: 0.75rem → 12px */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

export const BorderRadius = {
  sm: 8, // calc(12px - 4px) — v0 radius-sm
  md: 10, // calc(12px - 2px)
  lg: 12, // --radius
  xl: 16, // calc(12px + 4px)
  '2xl': 16, // rounded-2xl message bubbles
  full: 9999,
} as const;

export const FontSize = {
  xs: 12,
  sm: 14,
  base: 15,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
} as const;

export const FontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
} as const;
