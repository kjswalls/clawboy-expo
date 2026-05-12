import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface BootReadyContextValue {
  diskHydrationAttempted: boolean;
  markDiskHydrationAttempted: () => void;
}

const BootReadyContext = createContext<BootReadyContextValue | null>(null);

export function BootReadyProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [diskHydrationAttempted, setDiskHydrationAttempted] = useState(false);

  const markDiskHydrationAttempted = useCallback(() => {
    setDiskHydrationAttempted(true);
  }, []);

  const value = useMemo(
    () => ({ diskHydrationAttempted, markDiskHydrationAttempted }),
    [diskHydrationAttempted, markDiskHydrationAttempted],
  );

  return (
    <BootReadyContext.Provider value={value}>
      {children}
    </BootReadyContext.Provider>
  );
}

export function useBootReady(): BootReadyContextValue {
  const ctx = useContext(BootReadyContext);
  if (!ctx) {
    throw new Error('useBootReady must be used inside BootReadyProvider');
  }
  return ctx;
}
