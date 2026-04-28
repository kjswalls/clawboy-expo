import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useConnectionController, type ConnectionControllerValue } from '@/hooks/useConnection';
import { useServerConfig } from '@/hooks/useServerConfig';

const ConnectionContext = createContext<ConnectionControllerValue | null>(null);

/**
 * Provides the WebSocket connection lifecycle to the component tree.
 * Also wires TOFU SPKI recording: when the native layer observes a gateway
 * certificate hash for the first time, it is persisted to the active server
 * profile's `security.firstSeenSpkiSha256` field.
 *
 * Must be rendered inside `ServerConfigProvider`.
 */
export function ConnectionProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const value = useConnectionController();
  const { serverProfiles, updateProfileSecurity } = useServerConfig();

  // Keep a stable ref to avoid re-registering the observer on every render.
  const activeProfileRef = useRef(serverProfiles.find((p) => p.isActive) ?? null);
  useEffect(() => {
    activeProfileRef.current = serverProfiles.find((p) => p.isActive) ?? null;
  }, [serverProfiles]);

  useEffect(() => {
    value.setSpkiObserver((hash) => {
      const profile = activeProfileRef.current;
      if (!profile) return;
      // Only record the first-seen hash — never overwrite once set.
      if (profile.security?.firstSeenSpkiSha256) return;
      const ts = Date.now();
      void updateProfileSecurity(profile.id, {
        firstSeenSpkiSha256: hash,
        firstSeenAt: ts,
      });
      // Update the ref immediately so rapid re-fires don't re-record.
      activeProfileRef.current = {
        ...profile,
        security: { ...profile.security, firstSeenSpkiSha256: hash, firstSeenAt: ts },
      };
    });
  }, [value.setSpkiObserver, updateProfileSecurity]);

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionControllerValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) {
    throw new Error('useConnection must be used within ConnectionProvider');
  }
  return ctx;
}
