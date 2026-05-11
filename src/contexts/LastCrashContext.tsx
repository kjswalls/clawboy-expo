/**
 * LastCrashContext — provides access to the most recent encrypted crash
 * record (if any) to the UI. The record is read once on mount, persisted
 * across cold starts in AsyncStorage (encrypted), and cleared after the user
 * dismisses the recovery banner or submits a feedback report.
 *
 * Architecture note: this is a lightweight provider that wraps
 * `crashRecorder.ts`. It does NOT read from the network or hold sensitive
 * state — it only exposes the safe CrashRecord fields.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  clearLastCrash,
  readLastCrash,
  type CrashRecord,
} from '@/lib/diagnostics/crashRecorder';

interface LastCrashValue {
  /** The most recent crash record, or `null` if none / expired. */
  lastCrash: CrashRecord | null;
  /** `true` while the initial async read is in progress. */
  isLoading: boolean;
  /** Dismiss the banner and erase the record from storage. */
  dismiss: () => Promise<void>;
}

const LastCrashContext = createContext<LastCrashValue>({
  lastCrash: null,
  isLoading: true,
  dismiss: async () => {},
});

export function LastCrashProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [lastCrash, setLastCrash] = useState<CrashRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void readLastCrash().then((record) => {
      setLastCrash(record);
      setIsLoading(false);
    });
  }, []);

  const dismiss = useCallback(async () => {
    setLastCrash(null);
    await clearLastCrash();
  }, []);

  return (
    <LastCrashContext.Provider value={{ lastCrash, isLoading, dismiss }}>
      {children}
    </LastCrashContext.Provider>
  );
}

export function useLastCrash(): LastCrashValue {
  return useContext(LastCrashContext);
}
