/**
 * BadgesProvider — React context provider for the badge system.
 * Mount once in app/_layout.tsx, inside PurchasesProvider + AccountProvider.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useBadgeTracker } from './tracker';
import type { BadgesContextValue } from './hooks';
import { BadgesContext, useEntitlements } from './hooks';
import type { BadgeState } from './types';
import { usePurchases } from '@/contexts/PurchasesContext';

export function BadgesProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const tracker = useBadgeTracker();
  const [state, setState] = useState<BadgeState | null>(tracker.state);
  const { foundersPurchasedAt } = usePurchases();
  const { tier } = useEntitlements();
  // Track which purchase timestamp we have already recorded to avoid repeated calls.
  const recordedPurchaseRef = useRef<string | null>(null);

  // Subscribe to all future state changes from the tracker.
  useEffect(() => {
    // Sync current state immediately in case it was loaded before we subscribed.
    setState(tracker.state);
    return tracker.subscribe((s) => {
      setState(s);
    });
  // tracker ref is stable across renders; subscribe is memoized.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep tracker's entitlementRef in sync with the live tier from RC/Supabase.
  useEffect(() => {
    tracker.setEntitlementTier(tier);
  }, [tier, tracker]);

  // When RC reports a founders purchase date that the badge state hasn't recorded yet, persist it.
  useEffect(() => {
    if (!foundersPurchasedAt) return;
    if (recordedPurchaseRef.current === foundersPurchasedAt) return;
    const currentPurchasedAt = state?.counters.foundersPurchasedAt;
    if (currentPurchasedAt === foundersPurchasedAt) {
      recordedPurchaseRef.current = foundersPurchasedAt;
      return;
    }
    recordedPurchaseRef.current = foundersPurchasedAt;
    void tracker.recordFoundersPurchase(foundersPurchasedAt);
  }, [foundersPurchasedAt, state?.counters.foundersPurchasedAt, tracker]);

  const value: BadgesContextValue = {
    ...tracker,
    state,
  };

  return (
    <BadgesContext.Provider value={value}>
      {children}
    </BadgesContext.Provider>
  );
}
