/**
 * AccountContext — optional Supabase identity layer.
 *
 * Sits OUTSIDE ConnectionProvider so it is completely independent of any
 * gateway connection.  All gateway features work with status === 'signed-out'.
 *
 * State transitions:
 *   mount → 'unknown'
 *   SecureStore read complete → 'signed-in' | 'signed-out'
 *   sign-in / sign-out events → update accordingly
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import * as SupabaseAuth from '@/lib/supabase/auth';
import type { Account, AccountContextValue, Entitlement } from '@/lib/supabase/types';

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const AccountContext = createContext<AccountContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function AccountProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [status, setStatus] = useState<AccountContextValue['status']>('unknown');
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);

  // Prevent concurrent profile fetches.
  const fetchingRef = useRef(false);

  const fetchProfile = useCallback(async (uid: string): Promise<void> => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const [accountRes, entitlementRes] = await Promise.all([
        supabase.from('accounts').select('*').eq('id', uid).single(),
        supabase.from('entitlements').select('*').eq('account_id', uid).single(),
      ]);
      setAccount((accountRes.data as Account | null) ?? null);
      setEntitlement((entitlementRes.data as Entitlement | null) ?? null);
    } catch {
      // Network failure while fetching profile is non-fatal — app works without it.
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Restore any existing session from SecureStore.
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const s = data.session;
      if (s) {
        setSession(s);
        setUser(s.user);
        setStatus('signed-in');
        void fetchProfile(s.user.id);
      } else {
        setStatus('signed-out');
      }
    });

    // Subscribe to auth state changes (sign-in, sign-out, token refresh).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      if (s) {
        setSession(s);
        setUser(s.user);
        setStatus('signed-in');
        void fetchProfile(s.user.id);
      } else {
        setSession(null);
        setUser(null);
        setAccount(null);
        setEntitlement(null);
        setStatus('signed-out');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleSignInWithApple = useCallback(async (): Promise<void> => {
    await SupabaseAuth.signInWithApple();
  }, []);

  const handleSignInWithGoogle = useCallback(async (): Promise<void> => {
    await SupabaseAuth.signInWithGoogle();
  }, []);

  const handleSignInWithEmail = useCallback(async (email: string): Promise<void> => {
    await SupabaseAuth.signInWithEmail(email);
  }, []);

  const handleSignOut = useCallback(async (): Promise<void> => {
    await SupabaseAuth.signOut();
    // onAuthStateChange will clear local state.
  }, []);

  const handleDeleteAccount = useCallback(async (): Promise<void> => {
    await SupabaseAuth.deleteAccount();
    // deleteAccount signs out locally too; onAuthStateChange clears state.
  }, []);

  const value = useMemo(
    (): AccountContextValue => ({
      status,
      user,
      session,
      account,
      entitlement,
      signInWithApple: handleSignInWithApple,
      signInWithGoogle: handleSignInWithGoogle,
      signInWithEmail: handleSignInWithEmail,
      signOut: handleSignOut,
      deleteAccount: handleDeleteAccount,
    }),
    [status, user, session, account, entitlement, handleSignInWithApple, handleSignInWithGoogle, handleSignInWithEmail, handleSignOut, handleDeleteAccount],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useAccountContext(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccountContext must be used within AccountProvider');
  return ctx;
}
