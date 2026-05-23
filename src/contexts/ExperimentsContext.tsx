import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  IOS_INPUT_SKIP_PASTE_WRAPPER,
  IOS_INPUT_USE_INTRINSIC_HEIGHT,
  IOS_INPUT_STABLE_PROPS,
  IOS_INPUT_LOG_DICTATION,
  IOS_INPUT_BARE_TEXT_INPUT,
  IOS_INPUT_SUPPRESS_ACCESSIBILITY,
} from '@/constants/voiceControlInputExperiments';

const EXPERIMENTS_KEY = 'clawboy-experiments-v1';

interface ExperimentsStored {
  skipPasteWrapper: boolean;
  useIntrinsicHeight: boolean;
  stableProps: boolean;
  logDictation: boolean;
  bareTextInput: boolean;
  suppressInputAccessibility: boolean;
}

interface ExperimentsContextValue {
  skipPasteWrapper: boolean;
  useIntrinsicHeight: boolean;
  stableProps: boolean;
  logDictation: boolean;
  bareTextInput: boolean;
  suppressInputAccessibility: boolean;
  /** True when env var overrides this flag — UI should be read-only. */
  skipPasteWrapperLocked: boolean;
  useIntrinsicHeightLocked: boolean;
  stablePropsLocked: boolean;
  logDictationLocked: boolean;
  bareTextInputLocked: boolean;
  suppressInputAccessibilityLocked: boolean;
  setSkipPasteWrapper: (value: boolean) => void;
  setUseIntrinsicHeight: (value: boolean) => void;
  setStableProps: (value: boolean) => void;
  setLogDictation: (value: boolean) => void;
  setBareTextInput: (value: boolean) => void;
  setSuppressInputAccessibility: (value: boolean) => void;
}

const ExperimentsContext = createContext<ExperimentsContextValue | null>(null);

const ENV_SKIP = IOS_INPUT_SKIP_PASTE_WRAPPER;
const ENV_SKIP_SET = process.env['EXPO_PUBLIC_IOS_INPUT_SKIP_PASTE_WRAPPER'] !== undefined
  && process.env['EXPO_PUBLIC_IOS_INPUT_SKIP_PASTE_WRAPPER'] !== '';
const ENV_INTRINSIC = IOS_INPUT_USE_INTRINSIC_HEIGHT;
const ENV_INTRINSIC_SET = process.env['EXPO_PUBLIC_IOS_INPUT_USE_INTRINSIC_HEIGHT'] !== undefined
  && process.env['EXPO_PUBLIC_IOS_INPUT_USE_INTRINSIC_HEIGHT'] !== '';
const ENV_STABLE = IOS_INPUT_STABLE_PROPS;
const ENV_STABLE_SET = process.env['EXPO_PUBLIC_IOS_INPUT_STABLE_PROPS'] !== undefined
  && process.env['EXPO_PUBLIC_IOS_INPUT_STABLE_PROPS'] !== '';
const ENV_LOG = IOS_INPUT_LOG_DICTATION;
const ENV_LOG_SET = process.env['EXPO_PUBLIC_LOG_DICTATION'] !== undefined
  && process.env['EXPO_PUBLIC_LOG_DICTATION'] !== '';
const ENV_BARE = IOS_INPUT_BARE_TEXT_INPUT;
const ENV_BARE_SET = process.env['EXPO_PUBLIC_IOS_INPUT_BARE_TEXT_INPUT'] !== undefined
  && process.env['EXPO_PUBLIC_IOS_INPUT_BARE_TEXT_INPUT'] !== '';
const ENV_SUPPRESS = IOS_INPUT_SUPPRESS_ACCESSIBILITY;
const ENV_SUPPRESS_SET = process.env['EXPO_PUBLIC_IOS_INPUT_SUPPRESS_ACCESSIBILITY'] !== undefined
  && process.env['EXPO_PUBLIC_IOS_INPUT_SUPPRESS_ACCESSIBILITY'] !== '';

export function ExperimentsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [storedSkip, setStoredSkip] = useState(false);
  const [storedIntrinsic, setStoredIntrinsic] = useState(false);
  const [storedStableProps, setStoredStableProps] = useState(true);
  const [storedLogDictation, setStoredLogDictation] = useState(false);
  const [storedBareTextInput, setStoredBareTextInput] = useState(false);
  const [storedSuppressInputAccessibility, setStoredSuppressInputAccessibility] = useState(true);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const raw = await AsyncStorage.getItem(EXPERIMENTS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<ExperimentsStored>;
          if (typeof parsed.skipPasteWrapper === 'boolean') setStoredSkip(parsed.skipPasteWrapper);
          if (typeof parsed.useIntrinsicHeight === 'boolean') setStoredIntrinsic(parsed.useIntrinsicHeight);
          if (typeof parsed.stableProps === 'boolean') setStoredStableProps(parsed.stableProps);
          if (typeof parsed.logDictation === 'boolean') setStoredLogDictation(parsed.logDictation);
          if (typeof parsed.bareTextInput === 'boolean') setStoredBareTextInput(parsed.bareTextInput);
          if (typeof parsed.suppressInputAccessibility === 'boolean') setStoredSuppressInputAccessibility(parsed.suppressInputAccessibility);
        }
      } catch { /* ignore — defaults remain false */ }
    })();
  }, []);

  const persist = useCallback((
    skip: boolean, intrinsic: boolean, stable: boolean, log: boolean, bare: boolean, suppress: boolean,
  ): void => {
    const payload: ExperimentsStored = {
      skipPasteWrapper: skip,
      useIntrinsicHeight: intrinsic,
      stableProps: stable,
      logDictation: log,
      bareTextInput: bare,
      suppressInputAccessibility: suppress,
    };
    void AsyncStorage.setItem(EXPERIMENTS_KEY, JSON.stringify(payload)).catch(() => { /* ignore */ });
  }, []);

  const setSkipPasteWrapper = useCallback((value: boolean): void => {
    setStoredSkip(value);
    persist(value, storedIntrinsic, storedStableProps, storedLogDictation, storedBareTextInput, storedSuppressInputAccessibility);
  }, [persist, storedIntrinsic, storedStableProps, storedLogDictation, storedBareTextInput, storedSuppressInputAccessibility]);

  const setUseIntrinsicHeight = useCallback((value: boolean): void => {
    setStoredIntrinsic(value);
    persist(storedSkip, value, storedStableProps, storedLogDictation, storedBareTextInput, storedSuppressInputAccessibility);
  }, [persist, storedSkip, storedStableProps, storedLogDictation, storedBareTextInput, storedSuppressInputAccessibility]);

  const setStableProps = useCallback((value: boolean): void => {
    setStoredStableProps(value);
    persist(storedSkip, storedIntrinsic, value, storedLogDictation, storedBareTextInput, storedSuppressInputAccessibility);
  }, [persist, storedSkip, storedIntrinsic, storedLogDictation, storedBareTextInput, storedSuppressInputAccessibility]);

  const setLogDictation = useCallback((value: boolean): void => {
    setStoredLogDictation(value);
    persist(storedSkip, storedIntrinsic, storedStableProps, value, storedBareTextInput, storedSuppressInputAccessibility);
  }, [persist, storedSkip, storedIntrinsic, storedStableProps, storedBareTextInput, storedSuppressInputAccessibility]);

  const setBareTextInput = useCallback((value: boolean): void => {
    setStoredBareTextInput(value);
    persist(storedSkip, storedIntrinsic, storedStableProps, storedLogDictation, value, storedSuppressInputAccessibility);
  }, [persist, storedSkip, storedIntrinsic, storedStableProps, storedLogDictation, storedSuppressInputAccessibility]);

  const setSuppressInputAccessibility = useCallback((value: boolean): void => {
    setStoredSuppressInputAccessibility(value);
    persist(storedSkip, storedIntrinsic, storedStableProps, storedLogDictation, storedBareTextInput, value);
  }, [persist, storedSkip, storedIntrinsic, storedStableProps, storedLogDictation, storedBareTextInput]);

  const skipPasteWrapper = ENV_SKIP_SET ? ENV_SKIP : storedSkip;
  const useIntrinsicHeight = ENV_INTRINSIC_SET ? ENV_INTRINSIC : storedIntrinsic;
  const stableProps = ENV_STABLE_SET ? ENV_STABLE : storedStableProps;
  const logDictation = ENV_LOG_SET ? ENV_LOG : storedLogDictation;
  const bareTextInput = ENV_BARE_SET ? ENV_BARE : storedBareTextInput;
  const suppressInputAccessibility = ENV_SUPPRESS_SET ? ENV_SUPPRESS : storedSuppressInputAccessibility;

  const value = useMemo((): ExperimentsContextValue => ({
    skipPasteWrapper,
    useIntrinsicHeight,
    stableProps,
    logDictation,
    bareTextInput,
    suppressInputAccessibility,
    skipPasteWrapperLocked: ENV_SKIP_SET,
    useIntrinsicHeightLocked: ENV_INTRINSIC_SET,
    stablePropsLocked: ENV_STABLE_SET,
    logDictationLocked: ENV_LOG_SET,
    bareTextInputLocked: ENV_BARE_SET,
    suppressInputAccessibilityLocked: ENV_SUPPRESS_SET,
    setSkipPasteWrapper,
    setUseIntrinsicHeight,
    setStableProps,
    setLogDictation,
    setBareTextInput,
    setSuppressInputAccessibility,
  }), [skipPasteWrapper, useIntrinsicHeight, stableProps, logDictation, bareTextInput, suppressInputAccessibility, setSkipPasteWrapper, setUseIntrinsicHeight, setStableProps, setLogDictation, setBareTextInput, setSuppressInputAccessibility]);

  return <ExperimentsContext.Provider value={value}>{children}</ExperimentsContext.Provider>;
}

export function useExperiments(): ExperimentsContextValue {
  const ctx = useContext(ExperimentsContext);
  if (!ctx) throw new Error('useExperiments must be used within ExperimentsProvider');
  return ctx;
}
