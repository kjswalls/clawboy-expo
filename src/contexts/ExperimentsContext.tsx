import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  IOS_INPUT_SKIP_PASTE_WRAPPER,
  IOS_INPUT_USE_INTRINSIC_HEIGHT,
} from '@/constants/voiceControlInputExperiments';

const EXPERIMENTS_KEY = 'clawboy-experiments-v1';

interface ExperimentsStored {
  skipPasteWrapper: boolean;
  useIntrinsicHeight: boolean;
}

interface ExperimentsContextValue {
  skipPasteWrapper: boolean;
  useIntrinsicHeight: boolean;
  /** True when env var overrides this flag — UI should be read-only. */
  skipPasteWrapperLocked: boolean;
  useIntrinsicHeightLocked: boolean;
  setSkipPasteWrapper: (value: boolean) => void;
  setUseIntrinsicHeight: (value: boolean) => void;
}

const ExperimentsContext = createContext<ExperimentsContextValue | null>(null);

const ENV_SKIP = IOS_INPUT_SKIP_PASTE_WRAPPER;
const ENV_SKIP_SET = process.env['EXPO_PUBLIC_IOS_INPUT_SKIP_PASTE_WRAPPER'] !== undefined
  && process.env['EXPO_PUBLIC_IOS_INPUT_SKIP_PASTE_WRAPPER'] !== '';
const ENV_INTRINSIC = IOS_INPUT_USE_INTRINSIC_HEIGHT;
const ENV_INTRINSIC_SET = process.env['EXPO_PUBLIC_IOS_INPUT_USE_INTRINSIC_HEIGHT'] !== undefined
  && process.env['EXPO_PUBLIC_IOS_INPUT_USE_INTRINSIC_HEIGHT'] !== '';

export function ExperimentsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [storedSkip, setStoredSkip] = useState(false);
  const [storedIntrinsic, setStoredIntrinsic] = useState(false);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const raw = await AsyncStorage.getItem(EXPERIMENTS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<ExperimentsStored>;
          if (typeof parsed.skipPasteWrapper === 'boolean') setStoredSkip(parsed.skipPasteWrapper);
          if (typeof parsed.useIntrinsicHeight === 'boolean') setStoredIntrinsic(parsed.useIntrinsicHeight);
        }
      } catch { /* ignore — defaults remain false */ }
    })();
  }, []);

  const persist = useCallback((skip: boolean, intrinsic: boolean): void => {
    const payload: ExperimentsStored = { skipPasteWrapper: skip, useIntrinsicHeight: intrinsic };
    void AsyncStorage.setItem(EXPERIMENTS_KEY, JSON.stringify(payload)).catch(() => { /* ignore */ });
  }, []);

  const setSkipPasteWrapper = useCallback((value: boolean): void => {
    setStoredSkip(value);
    persist(value, storedIntrinsic);
  }, [persist, storedIntrinsic]);

  const setUseIntrinsicHeight = useCallback((value: boolean): void => {
    setStoredIntrinsic(value);
    persist(storedSkip, value);
  }, [persist, storedSkip]);

  const skipPasteWrapper = ENV_SKIP_SET ? ENV_SKIP : storedSkip;
  const useIntrinsicHeight = ENV_INTRINSIC_SET ? ENV_INTRINSIC : storedIntrinsic;

  const value = useMemo((): ExperimentsContextValue => ({
    skipPasteWrapper,
    useIntrinsicHeight,
    skipPasteWrapperLocked: ENV_SKIP_SET,
    useIntrinsicHeightLocked: ENV_INTRINSIC_SET,
    setSkipPasteWrapper,
    setUseIntrinsicHeight,
  }), [skipPasteWrapper, useIntrinsicHeight, setSkipPasteWrapper, setUseIntrinsicHeight]);

  return <ExperimentsContext.Provider value={value}>{children}</ExperimentsContext.Provider>;
}

export function useExperiments(): ExperimentsContextValue {
  const ctx = useContext(ExperimentsContext);
  if (!ctx) throw new Error('useExperiments must be used within ExperimentsProvider');
  return ctx;
}
