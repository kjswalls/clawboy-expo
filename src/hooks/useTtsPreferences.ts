/**
 * Intentional passthrough — re-exports from TtsPreferencesContext to preserve
 * existing import paths across the codebase.
 *
 * State logic and AsyncStorage persistence live in a single shared context
 * (TtsPreferencesProvider in app/_layout.tsx) so that all call sites react to
 * the same state — toggling auto-speak in Settings is immediately visible in
 * the chat screen without a remount.
 *
 * This file exists solely so callers can continue to write:
 *   import { useTtsPreferences } from '@/hooks/useTtsPreferences';
 * rather than importing directly from the context module. Do not add logic
 * here — put it in TtsPreferencesContext instead.
 *
 * Import from here or directly from @/contexts/TtsPreferencesContext —
 * both are equivalent.
 */
export type { TtsPreferences } from '@/contexts/TtsPreferencesContext';
export { useTtsPreferencesContext as useTtsPreferences } from '@/contexts/TtsPreferencesContext';
