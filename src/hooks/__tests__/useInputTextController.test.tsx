import { renderHook, act } from '@testing-library/react-native';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { TextInput } from 'react-native';
import { useInputTextController } from '../useInputTextController';

describe('useInputTextController', () => {
  let mockSetNativeProps: ReturnType<typeof jest.fn>;
  let mockClear: ReturnType<typeof jest.fn>;

  // Helper: attach a fake TextInput with mocked setNativeProps and clear to the hook's inputRef.
  function attachFakeInput(inputRef: React.MutableRefObject<TextInput | null>): void {
    inputRef.current = {
      setNativeProps: mockSetNativeProps,
      clear: mockClear,
    } as unknown as TextInput;
  }

  beforeEach(() => {
    mockSetNativeProps = jest.fn();
    mockClear = jest.fn();
  });

  it('initialises text state and textRef from initialText', () => {
    const { result } = renderHook(() => useInputTextController('hello'));
    expect(result.current.text).toBe('hello');
    expect(result.current.textRef.current).toBe('hello');
  });

  it('onChangeTextFromNative updates text state and textRef synchronously', () => {
    const { result } = renderHook(() => useInputTextController(''));
    act(() => {
      result.current.onChangeTextFromNative('what time is it?');
    });
    expect(result.current.text).toBe('what time is it?');
    expect(result.current.textRef.current).toBe('what time is it?');
  });

  it('onChangeTextFromNative correctly tracks sequential updates (dictation simulation)', () => {
    const { result } = renderHook(() => useInputTextController(''));
    act(() => { result.current.onChangeTextFromNative('what '); });
    act(() => { result.current.onChangeTextFromNative('what time is it?'); });
    expect(result.current.text).toBe('what time is it?');
    expect(result.current.textRef.current).toBe('what time is it?');
  });

  it('setTextProgrammatic updates text state and textRef', () => {
    const { result } = renderHook(() => useInputTextController(''));
    act(() => { result.current.setTextProgrammatic('/ '); });
    expect(result.current.text).toBe('/ ');
    expect(result.current.textRef.current).toBe('/ ');
  });

  it('setTextProgrammatic calls setNativeProps with the new text when inputRef is attached', () => {
    const { result } = renderHook(() => useInputTextController(''));
    attachFakeInput(result.current.inputRef as React.MutableRefObject<TextInput | null>);

    act(() => { result.current.setTextProgrammatic('/reset'); });

    expect(mockSetNativeProps).toHaveBeenCalledWith({ text: '/reset' });
  });

  it('setTextProgrammatic with cursor "end" also calls setNativeProps with selection at text length', () => {
    const { result } = renderHook(() => useInputTextController(''));
    attachFakeInput(result.current.inputRef as React.MutableRefObject<TextInput | null>);

    act(() => { result.current.setTextProgrammatic('/model ', { cursor: 'end' }); });

    expect(mockSetNativeProps).toHaveBeenCalledWith({ text: '/model ' });
    expect(mockSetNativeProps).toHaveBeenCalledWith({ selection: { start: 7, end: 7 } });
  });

  it('setTextProgrammatic with cursor number places caret at that exact offset', () => {
    const { result } = renderHook(() => useInputTextController(''));
    attachFakeInput(result.current.inputRef as React.MutableRefObject<TextInput | null>);

    act(() => { result.current.setTextProgrammatic('hello world', { cursor: 5 }); });

    expect(mockSetNativeProps).toHaveBeenCalledWith({ text: 'hello world' });
    expect(mockSetNativeProps).toHaveBeenCalledWith({ selection: { start: 5, end: 5 } });
  });

  it('setTextProgrammatic without cursor option omits the selection call', () => {
    const { result } = renderHook(() => useInputTextController(''));
    attachFakeInput(result.current.inputRef as React.MutableRefObject<TextInput | null>);

    act(() => { result.current.setTextProgrammatic('hello'); });

    expect(mockSetNativeProps).toHaveBeenCalledTimes(1);
    expect(mockSetNativeProps).toHaveBeenCalledWith({ text: 'hello' });
  });

  it('setTextProgrammatic("") calls clear() and NOT setNativeProps({ text: "" })', () => {
    const { result } = renderHook(() => useInputTextController('hello'));
    attachFakeInput(result.current.inputRef as React.MutableRefObject<TextInput | null>);

    act(() => { result.current.setTextProgrammatic(''); });

    expect(mockClear).toHaveBeenCalledTimes(1);
    // setNativeProps must not be called with text — that is the path that silently
    // no-ops on Fabric multiline when the prior selection is past the new length.
    const textCalls = mockSetNativeProps.mock.calls.filter(
      (args) => 'text' in (args[0] as Record<string, unknown>)
    );
    expect(textCalls).toHaveLength(0);
    // JS state must also reflect empty.
    expect(result.current.text).toBe('');
    expect(result.current.textRef.current).toBe('');
  });

  it('setTextProgrammatic("") with cursor "end" calls clear() AND selection at position 0', () => {
    const { result } = renderHook(() => useInputTextController('hello'));
    attachFakeInput(result.current.inputRef as React.MutableRefObject<TextInput | null>);

    act(() => { result.current.setTextProgrammatic('', { cursor: 'end' }); });

    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockSetNativeProps).toHaveBeenCalledWith({ selection: { start: 0, end: 0 } });
  });

  it('setTextProgrammatic with non-empty string still uses setNativeProps (regression guard)', () => {
    const { result } = renderHook(() => useInputTextController(''));
    attachFakeInput(result.current.inputRef as React.MutableRefObject<TextInput | null>);

    act(() => { result.current.setTextProgrammatic('/reset'); });

    expect(mockClear).not.toHaveBeenCalled();
    expect(mockSetNativeProps).toHaveBeenCalledWith({ text: '/reset' });
  });

  it('setTextProgrammatic does not throw when inputRef is null (pre-mount)', () => {
    const { result } = renderHook(() => useInputTextController(''));
    // inputRef.current is null by default — no TextInput mounted yet.
    expect(() => {
      act(() => { result.current.setTextProgrammatic('safe'); });
    }).not.toThrow();
    expect(result.current.text).toBe('safe');
  });

  it('inputRef object is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useInputTextController(''));
    const ref1 = result.current.inputRef;
    rerender({});
    expect(result.current.inputRef).toBe(ref1);
  });

  it('setTextProgrammatic callback is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useInputTextController(''));
    const fn1 = result.current.setTextProgrammatic;
    act(() => { result.current.onChangeTextFromNative('changed'); });
    rerender({});
    expect(result.current.setTextProgrammatic).toBe(fn1);
  });

  it('onChangeTextFromNative callback is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useInputTextController(''));
    const fn1 = result.current.onChangeTextFromNative;
    act(() => { result.current.setTextProgrammatic('changed'); });
    rerender({});
    expect(result.current.onChangeTextFromNative).toBe(fn1);
  });
});
