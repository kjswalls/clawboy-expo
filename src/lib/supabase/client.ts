/**
 * Supabase client singleton.
 *
 * Reads project URL and anon key from, in order:
 * - `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Metro inlines
 *   these; use when bare iOS builds do not embed app.json `extra` yet)
 * - `expo.extra` in app.json (via `Constants.expoConfig` when the embedded
 *   app config is present)
 *
 * When nothing real is configured (missing values or `REPLACE_WITH_*` templates),
 * `isSupabaseConfigured` is `false` and a placeholder URL + key are passed to
 * `createClient` so the SDK never throws on import. Account and auth code must
 * guard on `isSupabaseConfigured` so we do not call the network.
 *
 * The client is a singleton so the onAuthStateChange subscription is shared
 * across the app without duplicate WebSocket connections.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { supabaseSecureStorage } from './secureStorage';

const PLACEHOLDER_URL = 'https://clawboy.unconfigured.supabase.local/';
const PLACEHOLDER_ANON_KEY = 'unconfigured';

function readEnvString(key: string): string {
  if (typeof process === 'undefined' || !process.env) return '';
  const v = process.env[key];
  return typeof v === 'string' ? v.trim() : '';
}

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

const fromEnvUrl = readEnvString('EXPO_PUBLIC_SUPABASE_URL');
const fromEnvKey = readEnvString('EXPO_PUBLIC_SUPABASE_ANON_KEY');
const fromExtraUrl = (extra['supabaseUrl'] ?? '').trim();
const fromExtraKey = (extra['supabaseAnonKey'] ?? '').trim();

const resolvedUrl = fromEnvUrl || fromExtraUrl;
const resolvedKey = fromEnvKey || fromExtraKey;

const isTemplate = (s: string): boolean =>
  s.length === 0 || s.includes('REPLACE_WITH') || s.startsWith('REPLACE_');

const looksLikeHttpUrl = (s: string): boolean => /^https?:\/\//i.test(s);

export const isSupabaseConfigured: boolean =
  looksLikeHttpUrl(resolvedUrl) && !isTemplate(resolvedUrl) && !isTemplate(resolvedKey);

const supabaseUrl: string = isSupabaseConfigured ? resolvedUrl : PLACEHOLDER_URL;
const supabaseAnonKey: string = isSupabaseConfigured ? resolvedKey : PLACEHOLDER_ANON_KEY;

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: supabaseSecureStorage,
    autoRefreshToken: isSupabaseConfigured,
    persistSession: isSupabaseConfigured,
    detectSessionInUrl: false,
  },
});
