/**
 * Re-exports from TtsPreferencesContext for backward compatibility.
 *
 * State logic and AsyncStorage persistence now live in a single shared
 * context (TtsPreferencesProvider in app/_layout.tsx) so that all call sites
 * react to the same state — toggling auto-speak in Settings is immediately
 * visible in the chat screen without a remount.
 *
 * Import from here or directly from @/contexts/TtsPreferencesContext —
 * both are equivalent.
 */
export type { TtsPreferences } from '@/contexts/TtsPreferencesContext';
export { useTtsPreferencesContext as useTtsPreferences } from '@/contexts/TtsPreferencesContext';
