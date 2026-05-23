/**
 * Independent iOS Voice Control / dictation experiments for the main chat
 * composer (`InputBarCard`). Each flag isolates one suspected contributor to
 * the RN #37991-class dictation bug on iOS, so a TestFlight build can bisect
 * them on real hardware without conflating variables.
 *
 * All flags are **bundle-time** (Metro / EAS). Set in the build env and
 * restart Metro or rebuild. All default to **off** so `main` ships unchanged
 * until a device QA bisect identifies which flag closes the bug.
 *
 * 1. `IOS_INPUT_SKIP_PASTE_WRAPPER` — when on, skips the `expo-paste-input`
 *    `TextInputWrapper`. Inline image paste from the keyboard stops firing
 *    `onPaste` (paperclip sheet still works). Only meaningful on real iOS
 *    hardware; `InputBarCard` only mounts the wrapper there in the first
 *    place. Env: `EXPO_PUBLIC_IOS_INPUT_SKIP_PASTE_WRAPPER` (`1` enables;
 *    anything else, including unset, leaves it off).
 *
 * 2. `IOS_INPUT_USE_INTRINSIC_HEIGHT` — when on, drops the hidden mirror
 *    `<Text>` + `setMeasuredHeight` path and sizes the `<TextInput>` with
 *    `minHeight` / `maxHeight` only. Fewer native layout updates during
 *    dictation composition; relies on RN's intrinsic content sizing.
 *    Env: `EXPO_PUBLIC_IOS_INPUT_USE_INTRINSIC_HEIGHT` (`1` enables).
 *
 * 3. `IOS_INPUT_STABLE_PROPS` — when on, memoizes the `handleTextChange`
 *    callback, the `style` array, and the `textField` JSX so that their
 *    references are stable across keystrokes. Per-keystroke React re-renders
 *    hand new inline `style` arrays and fresh callback closures to the native
 *    `UITextView`, which can drop in-flight dictation characters on iOS.
 *    Also stabilizes `onFocus`/`onBlur` closures in `InputBar`.
 *    Env: `EXPO_PUBLIC_IOS_INPUT_STABLE_PROPS` (`1` enables).
 *
 * 4. `IOS_INPUT_SUPPRESS_ACCESSIBILITY` — when on, sets `accessible={false}` on
 *    the outer `<Pressable>` and removes the `accessibilityLabel` from the
 *    `<TextInput>`. Targets the hypothesis that Voice Control uses accessibility
 *    labels to route "named control" interactions, and that labelling the field
 *    with the placeholder text prevents it from being treated as a free-dictation
 *    target after the first word. Session-rename (which works) has no
 *    accessibilityLabel. Can be combined with `IOS_INPUT_BARE_TEXT_INPUT` but
 *    test separately to isolate the cause.
 *    Env: `EXPO_PUBLIC_IOS_INPUT_SUPPRESS_ACCESSIBILITY` (`1` enables).
 *
 * 5. `IOS_INPUT_BARE_TEXT_INPUT` — when on, removes the outer `<Pressable>`
 *    around the multiline `<TextInput>` so the input is no longer nested
 *    inside an interactive accessibility ancestor. Targets the iOS Voice
 *    Control bug where progressive `UITextInput.replaceRange` insertions
 *    after the first word land on the wrong target because the Pressable
 *    steals the accessibility focus context. Side effect: tapping the
 *    padding around the text no longer focuses the input — the user must
 *    tap on the input itself or its visible content.
 *    Env: `EXPO_PUBLIC_IOS_INPUT_BARE_TEXT_INPUT` (`1` enables).
 */
export const IOS_INPUT_SKIP_PASTE_WRAPPER: boolean =
  process.env['EXPO_PUBLIC_IOS_INPUT_SKIP_PASTE_WRAPPER'] === '1';

export const IOS_INPUT_USE_INTRINSIC_HEIGHT: boolean =
  process.env['EXPO_PUBLIC_IOS_INPUT_USE_INTRINSIC_HEIGHT'] === '1';

export const IOS_INPUT_STABLE_PROPS: boolean =
  process.env['EXPO_PUBLIC_IOS_INPUT_STABLE_PROPS'] === '1';

export const IOS_INPUT_LOG_DICTATION: boolean =
  process.env['EXPO_PUBLIC_LOG_DICTATION'] === '1';

export const IOS_INPUT_BARE_TEXT_INPUT: boolean =
  process.env['EXPO_PUBLIC_IOS_INPUT_BARE_TEXT_INPUT'] === '1';

export const IOS_INPUT_SUPPRESS_ACCESSIBILITY: boolean =
  process.env['EXPO_PUBLIC_IOS_INPUT_SUPPRESS_ACCESSIBILITY'] === '1';

