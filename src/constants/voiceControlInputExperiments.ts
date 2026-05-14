import { Platform } from 'react-native';

/**
 * **iOS Voice Control** / dictation-friendly layout for the main chat composer
 * (`InputBarCard`). See RN #37991 class of bugs (multiline + native churn).
 *
 * When **enabled** (see below):
 *
 * 1. **Skips `expo-paste-input` `TextInputWrapper` on real iOS hardware** — same as
 *    Simulator today; inline image paste from the keyboard may not fire `onPaste`
 *    (users can still attach via the paperclip sheet).
 * 2. **Uses `minHeight` + `maxHeight` on the multiline `TextInput`** instead of the
 *    hidden mirror `Text` + fixed `height` updates — fewer native layout updates
 *    during dictation / Voice Control composition.
 *
 * **Default:** **On** for **iOS** production and device builds (no env var required).
 * **Android** keeps the mirror height path and unchanged paste behaviour.
 *
 * **Overrides** (bundle time — Metro / EAS — then restart Metro or rebuild):
 *
 * - `EXPO_PUBLIC_IOS_INPUT_VOICE_CONTROL_EXPERIMENTS=0` — restore legacy iOS
 *   behaviour (paste wrapper + mirror-measured height).
 * - `EXPO_PUBLIC_IOS_INPUT_VOICE_CONTROL_EXPERIMENTS=1` — force experiments **on**
 *   on every platform (QA / bisection only).
 */
export function resolveIosInputVoiceControlExperiments(): boolean {
  const raw = process.env.EXPO_PUBLIC_IOS_INPUT_VOICE_CONTROL_EXPERIMENTS;
  if (raw === '0') {
    return false;
  }
  if (raw === '1') {
    return true;
  }
  return Platform.OS === 'ios';
}

export const IOS_INPUT_VOICE_CONTROL_EXPERIMENTS = resolveIosInputVoiceControlExperiments();
