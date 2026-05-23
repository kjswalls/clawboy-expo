import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDevBypassTokenStatus, type DevBypassTokenStatus } from '@/lib/feedback/devBypassToken';

const TAPS_KEY = 'clawboy.dev.tapsRecognized';
const TAP_COUNT = 7;
const TAP_WINDOW_MS = 3000;

export type DeveloperMode = {
  visible: boolean;
  unlocked: boolean;
  tapsRecognized: boolean;
  tokenSet: boolean;
  tokenStatus: DevBypassTokenStatus;
  recognizeTap: () => void;
  refreshTokenStatus: () => void;
  hide: () => void;
};

export function useDeveloperMode(): DeveloperMode {
  const [tapsRecognized, setTapsRecognized] = useState(__DEV__);
  const [tokenStatus, setTokenStatus] = useState<DevBypassTokenStatus>({ set: false, preview: null });
  const tapCountRef = useRef(0);
  const lastTapRef = useRef(0);

  useEffect(() => {
    if (!__DEV__) {
      void AsyncStorage.getItem(TAPS_KEY).then((v) => {
        if (v === '1') setTapsRecognized(true);
      });
    }
    void getDevBypassTokenStatus().then(setTokenStatus);
  }, []);

  const recognizeTap = useCallback(() => {
    if (__DEV__) return;
    const now = Date.now();
    if (now - lastTapRef.current > TAP_WINDOW_MS) tapCountRef.current = 0;
    lastTapRef.current = now;
    tapCountRef.current += 1;
    if (tapCountRef.current >= TAP_COUNT) {
      tapCountRef.current = 0;
      void AsyncStorage.setItem(TAPS_KEY, '1').then(() => setTapsRecognized(true));
    }
  }, []);

  const refreshTokenStatus = useCallback(() => {
    void getDevBypassTokenStatus().then(setTokenStatus);
  }, []);

  const hide = useCallback(() => {
    void AsyncStorage.removeItem(TAPS_KEY).then(() => {
      if (!__DEV__) setTapsRecognized(false);
    });
  }, []);

  const tokenSet = tokenStatus.set;
  const visible = __DEV__ || tapsRecognized;
  const unlocked = __DEV__ || (tapsRecognized && tokenSet);

  return { visible, unlocked, tapsRecognized, tokenSet, tokenStatus, recognizeTap, refreshTokenStatus, hide };
}
