/**
 * Pure TypeScript helper — no Expo/React Native imports — so it can be
 * unit-tested in a plain Jest environment without any native mocking.
 *
 * Parses a clawboy:// deep-link URL that may carry Supabase auth tokens and
 * returns a discriminated union describing what the caller should do next.
 */

export type AuthCallbackResult =
  | { kind: 'implicit'; accessToken: string; refreshToken: string }
  | { kind: 'pkce'; code: string }
  | { kind: 'error'; error: string }
  | { kind: 'ignore' };

/**
 * Parse a deep-link URL and extract Supabase auth callback parameters.
 *
 * Scheme check: must start with `clawboy://`.
 * Host/path allowlist: only `auth-callback` (host or path variant).
 * Error short-circuit: if `#error=...` is present, return `{ kind: 'error' }`.
 * Implicit flow: `#access_token=...&refresh_token=...` → `{ kind: 'implicit' }`.
 * PKCE flow: `?code=...` → `{ kind: 'pkce' }`.
 * Anything else: `{ kind: 'ignore' }`.
 *
 * Token values containing `=` (base64-padded JWTs) are preserved correctly
 * because the fragment parser uses `indexOf('=')` rather than `split('=')`.
 */
export function parseAuthCallbackUrl(url: string): AuthCallbackResult {
  // Scheme guard — reject anything that isn't our custom scheme.
  if (!url.startsWith('clawboy://')) {
    return { kind: 'ignore' };
  }

  // Strip the scheme to get the rest: `//host/path?query#fragment`
  const withoutScheme = url.slice('clawboy://'.length);

  // Determine host and path.  The OS may hand us either:
  //   clawboy://auth-callback#...   → host = "auth-callback", path = ""
  //   clawboy:///auth-callback#...  → host = "",              path = "/auth-callback"
  // Split off query/fragment first so they don't confuse the host parse.
  const queryStart = withoutScheme.indexOf('?');
  const hashStart = withoutScheme.indexOf('#');
  const authorityEnd =
    queryStart !== -1 && hashStart !== -1
      ? Math.min(queryStart, hashStart)
      : queryStart !== -1
        ? queryStart
        : hashStart !== -1
          ? hashStart
          : withoutScheme.length;

  const authorityAndPath = withoutScheme.slice(0, authorityEnd);

  // Split host from path on the first `/` after the leading `//` (already stripped).
  const slashIdx = authorityAndPath.indexOf('/');
  const host = slashIdx === -1 ? authorityAndPath : authorityAndPath.slice(0, slashIdx);
  const rawPath = slashIdx === -1 ? '' : authorityAndPath.slice(slashIdx);

  // Normalise path: strip leading slashes for comparison.
  const path = rawPath.replace(/^\/+/, '');

  const isAuthCallback = host === 'auth-callback' || path === 'auth-callback';
  if (!isAuthCallback) {
    return { kind: 'ignore' };
  }

  // Extract fragment (everything after `#`).
  const fragment = hashStart !== -1 ? url.slice(url.indexOf('#') + 1) : '';

  // Parse fragment key=value pairs.  Use indexOf('=') so base64-padded values
  // (e.g. `abc==`) are preserved in full.
  const fragParams: Record<string, string> = {};
  if (fragment) {
    for (const pair of fragment.split('&')) {
      const eq = pair.indexOf('=');
      const k = eq === -1 ? pair : pair.slice(0, eq);
      const v = eq === -1 ? '' : pair.slice(eq + 1);
      if (k) fragParams[k] = v ? decodeURIComponent(v) : '';
    }
  }

  // Magic-link / OTP errors arrive in the fragment (e.g. `#error=access_denied`).
  if (fragParams['error']) {
    return { kind: 'error', error: fragParams['error'] };
  }

  const accessToken = fragParams['access_token'];
  const refreshToken = fragParams['refresh_token'];

  // Implicit flow — both tokens required.
  if (accessToken && refreshToken) {
    return { kind: 'implicit', accessToken, refreshToken };
  }

  // PKCE flow — `?code=...` in the query string.
  if (queryStart !== -1) {
    const queryString = url.slice(url.indexOf('?') + 1, hashStart !== -1 ? url.indexOf('#') : undefined);
    const queryParams: Record<string, string> = {};
    for (const pair of queryString.split('&')) {
      const eq = pair.indexOf('=');
      const k = eq === -1 ? pair : pair.slice(0, eq);
      const v = eq === -1 ? '' : pair.slice(eq + 1);
      if (k) queryParams[k] = v ? decodeURIComponent(v) : '';
    }
    if (queryParams['code']) {
      return { kind: 'pkce', code: queryParams['code'] };
    }
  }

  return { kind: 'ignore' };
}
