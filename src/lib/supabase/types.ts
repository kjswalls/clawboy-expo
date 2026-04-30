import type { Session, User } from '@supabase/supabase-js';

/** Auth providers we surface in the UI. */
export type AuthProvider = 'apple' | 'google' | 'email';

/** Account row from public.accounts. */
export interface Account {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Founders Edition tier string. */
export type FounderTier = 'free' | 'founder_bronze' | 'founder_silver' | 'founder_gold';

/** Entitlements row from public.entitlements. */
export interface Entitlement {
  account_id: string;
  tier: FounderTier | string;
  source: 'revenuecat' | 'apple_iap' | 'stripe' | 'manual' | null;
  expires_at: string | null;
  /** Timestamp of original IAP purchase. Populated by the RC webhook. */
  purchased_at: string | null;
  updated_at: string;
}

/** Shape exposed by AccountContext. */
export interface AccountContextValue {
  /** 'unknown' during the initial SecureStore read; transitions to 'signed-in' or 'signed-out'. */
  status: 'unknown' | 'signed-in' | 'signed-out';
  user: User | null;
  session: Session | null;
  account: Account | null;
  entitlement: Entitlement | null;

  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}
