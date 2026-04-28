/**
 * Auth helpers for ClawBoy's three sign-in flows.
 *
 * Each function resolves when the flow is complete or throws on failure.
 * AccountContext wraps these in try/catch and surfaces errors to the UI.
 *
 * Flow notes:
 *   Apple  — native iOS sheet via expo-apple-authentication; no browser bounce
 *   Google — in-app browser via expo-auth-session; native UX deferred to later
 *   Email  — magic-link OTP; the deep-link clawboy://auth-callback returns
 *            the user to the app and onAuthStateChange fires automatically
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './client';

// Required for expo-auth-session to handle the browser redirect on iOS.
WebBrowser.maybeCompleteAuthSession();

// ─────────────────────────────────────────────────────────────────────────────
// Apple Sign-In
// ─────────────────────────────────────────────────────────────────────────────

export async function signInWithApple(): Promise<void> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Apple Sign-In did not return an identity token.');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });

  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Sign-In (expo-auth-session browser flow)
// ─────────────────────────────────────────────────────────────────────────────

export async function signInWithGoogle(): Promise<void> {
  // Supabase returns a URL that initiates the Google OAuth flow.
  const { data, error: urlError } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'clawboy://auth-callback',
      skipBrowserRedirect: true,
    },
  });

  if (urlError || !data.url) {
    throw urlError ?? new Error('Could not get Google sign-in URL.');
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, 'clawboy://auth-callback');

  if (result.type !== 'success') {
    throw new Error('Google sign-in was cancelled or failed.');
  }

  // Parse the fragment/query from the callback URL to extract the session.
  // Supabase returns tokens in the URL fragment (#access_token=...&refresh_token=...)
  const url = result.url;
  const fragment = url.split('#')[1] ?? url.split('?')[1] ?? '';
  const params = Object.fromEntries(new URLSearchParams(fragment));
  const accessToken = params['access_token'];
  const refreshToken = params['refresh_token'];

  if (!accessToken || !refreshToken) {
    throw new Error('No tokens returned from Google sign-in.');
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError) throw sessionError;
}

// ─────────────────────────────────────────────────────────────────────────────
// Email magic-link
// ─────────────────────────────────────────────────────────────────────────────

export async function signInWithEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Deep-link back into ClawBoy after the user taps the link in their email.
      emailRedirectTo: 'clawboy://auth-callback',
    },
  });

  if (error) throw error;
  // Resolves here — the actual session is established when the deep-link fires
  // and onAuthStateChange updates AccountContext.
}

// ─────────────────────────────────────────────────────────────────────────────
// Sign-out
// ─────────────────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// Account deletion (via Edge Function)
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('account-delete', {
    method: 'POST',
  });

  if (error) throw error;
  if (!(data as { ok?: boolean })?.ok) {
    throw new Error('Account deletion failed on the server.');
  }

  // The Edge Function deletes the auth.users row which invalidates our session.
  // signOut locally to clear SecureStore tokens.
  await supabase.auth.signOut();
}
