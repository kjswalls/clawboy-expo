import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection } from '@/contexts/ConnectionContext';

export interface TtsProvider {
  id: string;
  name: string;
}

export interface ServerTtsState {
  /** Whether server-side TTS is enabled on the gateway. null while loading. */
  enabled: boolean | null;
  /** Configured TTS provider name, e.g. "openai", "elevenlabs". null when unknown. */
  currentProvider: string | null;
  /** Available providers the gateway supports. Empty while loading or disconnected. */
  providers: TtsProvider[];
  /** True while a status/provider fetch is in-flight. */
  loading: boolean;
  /** True when disconnected and gateway queries cannot be made. */
  disconnected: boolean;
  setEnabled: (enable: boolean) => Promise<boolean>;
  setProvider: (providerId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

function normaliseProviders(raw: unknown): TtsProvider[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (typeof p === 'string') return { id: p, name: p };
      if (p && typeof p === 'object') {
        const id = String((p as Record<string, unknown>).id ?? (p as Record<string, unknown>).name ?? '');
        const name = String((p as Record<string, unknown>).name ?? id);
        return id ? { id, name } : null;
      }
      return null;
    })
    .filter((p): p is TtsProvider => p !== null);
}

function normaliseEnabled(raw: unknown): boolean | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if ('enabled' in r) return Boolean(r.enabled);
  if ('active' in r) return Boolean(r.active);
  return null;
}

function normaliseProvider(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.provider === 'string') return r.provider;
  if (typeof r.current === 'string') return r.current;
  return null;
}

/**
 * Wraps the gateway's `tts.*` RPC calls and exposes reactive state.
 *
 * Re-fetches status automatically on reconnect (tracked via `connectGeneration`).
 * Tolerates connection loss — all setters no-op when disconnected.
 */
export function useServerTts(): ServerTtsState {
  const { client, connectionState, connectGeneration } = useConnection();

  const [enabled, setEnabledState] = useState<boolean | null>(null);
  const [currentProvider, setCurrentProvider] = useState<string | null>(null);
  const [providers, setProviders] = useState<TtsProvider[]>([]);
  const [loading, setLoading] = useState(false);

  const isConnected = connectionState.status === 'connected';
  const fetchGenRef = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const c = client.current;
    if (!c) return;

    const myGen = ++fetchGenRef.current;
    setLoading(true);

    try {
      const [statusRaw, providersRaw] = await Promise.all([
        c.getTtsStatus().catch(() => null),
        c.getTtsProviders().catch(() => null),
      ]);

      if (fetchGenRef.current !== myGen) return;
      setEnabledState(normaliseEnabled(statusRaw));
      setCurrentProvider(normaliseProvider(statusRaw));
      setProviders(normaliseProviders(providersRaw));
    } catch {
      // Silently ignore — caller can try again
    } finally {
      if (fetchGenRef.current === myGen) setLoading(false);
    }
  }, [client]);

  // Re-fetch on every successful connection (connectGeneration increments on connect/disconnect)
  useEffect(() => {
    if (!isConnected) return;
    void refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectGeneration, isConnected]);

  const setEnabled = useCallback(async (enable: boolean): Promise<boolean> => {
    const c = client.current;
    if (!c) return false;
    try {
      await c.setTtsEnable(enable);
      setEnabledState(enable);
      return true;
    } catch {
      return false;
    }
  }, [client]);

  const setProvider = useCallback(async (providerId: string): Promise<boolean> => {
    const c = client.current;
    if (!c) return false;
    try {
      await c.setTtsProvider(providerId);
      setCurrentProvider(providerId);
      return true;
    } catch {
      return false;
    }
  }, [client]);

  return {
    enabled,
    currentProvider,
    providers,
    loading,
    disconnected: !isConnected,
    setEnabled,
    setProvider,
    refresh,
  };
}
