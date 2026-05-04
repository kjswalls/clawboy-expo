import type { Session, User } from '@supabase/supabase-js';

/** Auth providers we surface in the UI. */
export type AuthProvider = 'apple' | 'google' | 'email';

/** Account row from public.accounts. */
export interface Account {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
  /** Flexible JSON of user-selected cosmetic preferences. */
  display_preferences: DisplayPreferences;
}

/** Entitlement tier — matches CHECK constraint on public.entitlements. */
export type EntitlementTier = 'free' | 'pro' | 'founder';

/** Entitlements row from public.entitlements. */
export interface Entitlement {
  account_id: string;
  tier: EntitlementTier;
  source: 'revenuecat' | 'apple_iap' | 'stripe' | 'manual' | null;
  expires_at: string | null;
  /** Timestamp of original IAP purchase. Populated by the RC webhook. */
  purchased_at: string | null;
  updated_at: string;
}

/** Row from public.cosmetics_catalog. */
export interface CosmeticPack {
  id: string;
  kind: 'theme' | 'icon' | 'sound' | 'badge' | 'frame' | 'typing_indicator' | string;
  title: string;
  description: string | null;
  product_id: string | null;
  released_at: string;
  founders_inclusive: boolean;
  pro_inclusive_at_purchase: boolean;
  metadata: Record<string, unknown>;
}

/** Row from public.cosmetic_unlocks. */
export interface CosmeticUnlock {
  id: string;
  account_id: string;
  pack_id: string;
  source: 'entitlement_founder' | 'entitlement_pro' | 'individual_purchase' | 'manual' | string;
  unlocked_at: string;
}

/** Row from public.achievement_progress. */
export interface AchievementProgress {
  id: string;
  account_id: string;
  achievement_id: string;
  progress: Record<string, unknown>;
  unlocked_at: string | null;
}

/**
 * User-selected cosmetic preferences stored in accounts.display_preferences.
 * All keys are optional — app defaults apply when absent.
 */
export interface DisplayPreferences {
  app_icon?: string;
  theme?: string;
  accent_color?: string;
  sound_pack?: string;
  typing_indicator?: string;
  badge_frame?: string;
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
