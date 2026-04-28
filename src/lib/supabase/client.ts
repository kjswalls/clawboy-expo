/**
 * Supabase client singleton.
 *
 * Reads project URL and anon key from app.json extra (injected at build time
 * via expo-constants).  Falls back to empty strings so the module loads safely
 * on devices that haven't had the keys set yet — all SDK calls will simply fail
 * with a network error, which the app handles gracefully in AccountContext.
 *
 * The client is a singleton so the onAuthStateChange subscription is shared
 * across the app without duplicate WebSocket connections.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { supabaseSecureStorage } from './secureStorage';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

const supabaseUrl: string = extra['supabaseUrl'] ?? '';
const supabaseAnonKey: string = extra['supabaseAnonKey'] ?? '';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: supabaseSecureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
