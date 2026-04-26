import { useCallback } from 'react';
import { useConnection } from '@/contexts/ConnectionContext';
import { buildAuthedSource, resolveMediaUrl, type AuthedSource } from '@/lib/media/gatewayMedia';

/**
 * Hook that provides helpers for building authenticated media sources from
 * the active gateway connection. Re-evaluates automatically on connect /
 * disconnect / profile-switch because it reads from `useConnection()`.
 *
 * Tokens live only in React state inside `useConnection` — they are never
 * persisted or logged by this hook.
 *
 * `resolveAuthedSource` is memoized with `useCallback` keyed on
 * `[gatewayUrl, gatewayToken]` so consumers (MediaEmbed, VideoEmbed, etc.)
 * receive a stable function reference across renders. This prevents expo-image
 * from treating a structurally-identical `{ uri, headers }` object as a new
 * source and re-fetching on every render.
 */
export function useAuthedMedia(): {
  /** Build an authed `{ uri, headers }` source for a raw media path or URL. */
  resolveAuthedSource: (raw: string | undefined | null) => AuthedSource | null;
  /** The active gateway token (null when disconnected). */
  token: string | null;
  /** The active gateway WebSocket URL (null when disconnected). */
  gatewayUrl: string | null;
} {
  const { gatewayToken, gatewayUrl } = useConnection();

  const resolveAuthedSource = useCallback(
    (raw: string | undefined | null): AuthedSource | null => {
      if (!raw) return null;
      const resolved = resolveMediaUrl(raw, gatewayUrl ?? undefined);
      if (!resolved) return null;
      return buildAuthedSource(resolved.url, gatewayToken);
    },
    [gatewayUrl, gatewayToken],
  );

  return {
    resolveAuthedSource,
    token: gatewayToken,
    gatewayUrl,
  };
}
