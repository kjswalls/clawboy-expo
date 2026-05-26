import { useCallback, useContext } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { HapticsPreferencesContext } from '@/contexts/HapticsPreferencesContext';

export type HapticAction =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'selection'
  | 'success'
  | 'error'
  | 'warning';

export function useHaptics() {
  // Soft read: if the provider isn't mounted (tests, storybook, web builds
  // that skip the root layout), default to enabled so behaviour matches the
  // pre-toggle state. When the provider IS mounted, also gate on `hydrated`
  // so opted-out users don't feel a pulse during the AsyncStorage read.
  const ctx = useContext(HapticsPreferencesContext);
  const enabled = ctx ? ctx.hapticsEnabled && ctx.hydrated : true;

  return useCallback((action: HapticAction) => {
    if (!enabled) return;
    if (Platform.OS === 'web') return;
    try {
      switch (action) {
        case 'light':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          break;
        case 'medium':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          break;
        case 'heavy':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          break;
        case 'selection':
          Haptics.selectionAsync().catch(() => {});
          break;
        case 'success':
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          break;
        case 'error':
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          break;
        case 'warning':
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          break;
      }
    } catch {
      /* silent */
    }
  }, [enabled]);
}
