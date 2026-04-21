import React, { createContext, useContext } from 'react';
import { useConnectionController, type ConnectionControllerValue } from '@/hooks/useConnection';

const ConnectionContext = createContext<ConnectionControllerValue | null>(null);

export function ConnectionProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const value = useConnectionController();
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionControllerValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) {
    throw new Error('useConnection must be used within ConnectionProvider');
  }
  return ctx;
}
