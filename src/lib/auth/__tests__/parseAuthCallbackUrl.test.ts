import { parseAuthCallbackUrl, AuthCallbackResult } from '../parseAuthCallbackUrl';

describe('parseAuthCallbackUrl', () => {
  // ── Rejection / ignore cases ────────────────────────────────────────────────

  it('ignores non-clawboy scheme', () => {
    const result = parseAuthCallbackUrl(
      'https://example.com/auth-callback#access_token=x&refresh_token=y',
    );
    expect(result).toEqual<AuthCallbackResult>({ kind: 'ignore' });
  });

  it('ignores wrong host/path', () => {
    const result = parseAuthCallbackUrl(
      'clawboy://settings#access_token=x&refresh_token=y',
    );
    expect(result).toEqual<AuthCallbackResult>({ kind: 'ignore' });
  });

  it('returns error when error fragment is present', () => {
    const result = parseAuthCallbackUrl(
      'clawboy://auth-callback#error=access_denied',
    );
    expect(result).toEqual<AuthCallbackResult>({ kind: 'error', error: 'access_denied' });
  });

  it('ignores empty fragment with no tokens or code', () => {
    const result = parseAuthCallbackUrl('clawboy://auth-callback');
    expect(result).toEqual<AuthCallbackResult>({ kind: 'ignore' });
  });

  it('ignores partial implicit flow (only access_token, no refresh_token)', () => {
    const result = parseAuthCallbackUrl(
      'clawboy://auth-callback#access_token=abc',
    );
    expect(result).toEqual<AuthCallbackResult>({ kind: 'ignore' });
  });

  it('ignores partial implicit flow (only refresh_token, no access_token)', () => {
    const result = parseAuthCallbackUrl(
      'clawboy://auth-callback#refresh_token=xyz',
    );
    expect(result).toEqual<AuthCallbackResult>({ kind: 'ignore' });
  });

  // ── Happy paths ─────────────────────────────────────────────────────────────

  it('handles implicit flow (access_token + refresh_token in fragment)', () => {
    const result = parseAuthCallbackUrl(
      'clawboy://auth-callback#access_token=abc&refresh_token=xyz',
    );
    expect(result).toEqual<AuthCallbackResult>({
      kind: 'implicit',
      accessToken: 'abc',
      refreshToken: 'xyz',
    });
  });

  it('handles PKCE flow (code in query string)', () => {
    const result = parseAuthCallbackUrl(
      'clawboy://auth-callback?code=mycode',
    );
    expect(result).toEqual<AuthCallbackResult>({ kind: 'pkce', code: 'mycode' });
  });

  it('preserves token values containing = (base64-padded)', () => {
    const result = parseAuthCallbackUrl(
      'clawboy://auth-callback#access_token=ab%3D%3D&refresh_token=cd%3D%3D',
    );
    expect(result).toEqual<AuthCallbackResult>({
      kind: 'implicit',
      accessToken: 'ab==',
      refreshToken: 'cd==',
    });
  });

  it('preserves token values with literal = (unencoded base64 padding)', () => {
    // Some Supabase deployments send tokens with unencoded = padding.
    const result = parseAuthCallbackUrl(
      'clawboy://auth-callback#access_token=ab==&refresh_token=cd==',
    );
    expect(result).toEqual<AuthCallbackResult>({
      kind: 'implicit',
      accessToken: 'ab==',
      refreshToken: 'cd==',
    });
  });

  // ── Platform variants ────────────────────────────────────────────────────────

  it('handles triple-slash path variant (clawboy:///auth-callback)', () => {
    const result = parseAuthCallbackUrl(
      'clawboy:///auth-callback#access_token=abc&refresh_token=xyz',
    );
    expect(result).toEqual<AuthCallbackResult>({
      kind: 'implicit',
      accessToken: 'abc',
      refreshToken: 'xyz',
    });
  });

  it('handles PKCE with triple-slash path variant', () => {
    const result = parseAuthCallbackUrl(
      'clawboy:///auth-callback?code=mycode',
    );
    expect(result).toEqual<AuthCallbackResult>({ kind: 'pkce', code: 'mycode' });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────

  it('ignores unknown deep-link host (not auth-callback)', () => {
    const result = parseAuthCallbackUrl('clawboy://dashboard');
    expect(result).toEqual<AuthCallbackResult>({ kind: 'ignore' });
  });

  it('ignores fragment with only unknown keys', () => {
    const result = parseAuthCallbackUrl(
      'clawboy://auth-callback#foo=bar&baz=qux',
    );
    expect(result).toEqual<AuthCallbackResult>({ kind: 'ignore' });
  });

  it('error takes priority over tokens in same fragment', () => {
    const result = parseAuthCallbackUrl(
      'clawboy://auth-callback#error=expired&access_token=abc&refresh_token=xyz',
    );
    expect(result).toEqual<AuthCallbackResult>({ kind: 'error', error: 'expired' });
  });

  it('handles PKCE with both query code and fragment (code wins)', () => {
    // If both are present, code is checked only when implicit tokens are absent.
    const result = parseAuthCallbackUrl(
      'clawboy://auth-callback?code=mycode#something=else',
    );
    expect(result).toEqual<AuthCallbackResult>({ kind: 'pkce', code: 'mycode' });
  });
});
