import { useCallback, useRef, useState } from 'react';
import type { TextInput } from 'react-native';

export interface TextControllerSetOptions {
  cursor?: 'end' | number;
}

export interface InputTextController {
  /** Ref to attach to the `<TextInput>` element. */
  inputRef: React.RefObject<TextInput | null>;
  /** Always-current text (no async lag). Use for sends, snapshots, guards. */
  textRef: React.MutableRefObject<string>;
  /** React state mirror of textRef — use for rendering derivations (palette, send button). */
  text: string;
  /**
   * Called from `<TextInput onChangeText>`. Updates ref + state without
   * touching the native input (it already has the right text).
   */
  onChangeTextFromNative: (t: string) => void;
  /**
   * Programmatic text edit (slash, palette, clear, restore, etc.).
   * Synchronously updates ref + state AND pushes the text to the native
   * UITextView via setNativeProps so the two stay in sync.
   *
   * Pass `cursor: 'end'` to place the caret at the end of the new text.
   * Pass `cursor: N` to place it at a specific offset.
   * Omit `cursor` to leave native cursor placement to iOS.
   */
  setTextProgrammatic: (next: string, opts?: TextControllerSetOptions) => void;
}

/**
 * Manages text state for an uncontrolled `<TextInput>`.
 *
 * The TextInput is mounted with `defaultValue` (not `value`), so React never
 * re-applies text to the native UITextView after mount. This prevents iOS
 * dictation / Voice Control from losing inter-word spaces, which is a known
 * React Native regression on `multiline` controlled inputs (RN #37991).
 *
 * Architecture:
 *   - User typing:   native → onChangeTextFromNative → ref + state
 *   - Programmatic:  setTextProgrammatic → ref + state + setNativeProps
 */
export function useInputTextController(initialText: string): InputTextController {
  const inputRef = useRef<TextInput>(null);
  const textRef = useRef(initialText);
  const [text, setTextState] = useState(initialText);

  const setTextProgrammatic = useCallback(
    (next: string, opts?: TextControllerSetOptions): void => {
      textRef.current = next;
      setTextState(next);
      // Use clear() for empty strings: on iOS Fabric with multiline TextInput,
      // setNativeProps({ text: '' }) is silently dropped when the prior selection
      // is past the new length (e.g. caret at position 5 with text "hello"),
      // leaving the UITextView visually stale. clear() goes through a separate
      // native code path that reliably empties the field regardless of selection.
      // For non-empty edits (slash inserts, paste, hydration) keep setNativeProps
      // so the two separate calls below remain in separate native batches — some
      // Fabric versions batch combined props differently and can misplace the cursor.
      if (next === '') {
        inputRef.current?.clear();
      } else {
        inputRef.current?.setNativeProps({ text: next });
      }
      if (opts?.cursor !== undefined) {
        const pos = opts.cursor === 'end' ? next.length : opts.cursor;
        inputRef.current?.setNativeProps({ selection: { start: pos, end: pos } });
      }
    },
    [],
  );

  const onChangeTextFromNative = useCallback((t: string): void => {
    textRef.current = t;
    setTextState(t);
  }, []);

  return { inputRef, textRef, text, setTextProgrammatic, onChangeTextFromNative };
}
