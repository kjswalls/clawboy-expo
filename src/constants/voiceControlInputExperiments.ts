/**
 * Opt-in **iOS Voice Control** experiments for the main chat composer (`InputBarCard`).
 *
 * Set at **bundle time** (Metro / EAS), then restart Metro or rebuild:
 *
 * ```bash
 * EXPO_PUBLIC_IOS_INPUT_VOICE_CONTROL_EXPERIMENTS=1 npx expo start
 * ```
 *
 * When `EXPO_PUBLIC_IOS_INPUT_VOICE_CONTROL_EXPERIMENTS=1`:
 *
 * 1. **Skips `expo-paste-input` `TextInputWrapper` on real iOS hardware** — same as
 *    Simulator today; inline image paste from the keyboard may not fire `onPaste`
 *    (users can still attach via the paperclip sheet).
 * 2. **Uses `minHeight` + `maxHeight` on the multiline `TextInput`** instead of the
 *    hidden mirror `Text` + fixed `height` updates — fewer native layout updates
 *    during dictation / Voice Control composition (see RN #37991 class of bugs).
 *
 * Defaults **off** so production and CI behaviour are unchanged.
 */
export const IOS_INPUT_VOICE_CONTROL_EXPERIMENTS =
  process.env.EXPO_PUBLIC_IOS_INPUT_VOICE_CONTROL_EXPERIMENTS === '1';
