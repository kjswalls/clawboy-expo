/**
 * Thin selector hook over AccountContext.
 *
 * Usage:
 *   const { status, user, signInWithApple, signOut } = useAccount();
 */

import { useAccountContext } from '@/contexts/AccountContext';
import type { AccountContextValue } from '@/lib/supabase/types';

export function useAccount(): AccountContextValue {
  return useAccountContext();
}
