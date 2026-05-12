/**
 * PurchasesContext — wraps RevenueCat SDK.
 *
 * Design:
 * - Anonymous-by-default: RC creates an anonymous appUserID at first launch.
 *   Entitlements work without any Supabase account.
 * - On sign-in: Purchases.logIn(supabase.user.id) aliases the anonymous ID
 *   to the Supabase user ID. RC transfers purchase history to the new alias.
 * - On sign-out: Purchases.logOut() reverts to a fresh anonymous ID.
 * - Local-first: tier is read directly from RC customerInfo, not from Supabase.
 *   The Supabase entitlements row is populated by the RC webhook separately.
 * - Founders window: launchAt date is fetched from Supabase app_config table
 *   on mount. The window open/close state is recomputed every 60 seconds.
 *
 * Mount this AFTER AccountProvider so it can react to auth state changes.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import Purchases, {
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
  PURCHASES_ERROR_CODE,
} from 'react-native-purchases';
import { configurePurchases } from '@/lib/purchases/client';
import {
  resolveTier,
  isFoundersWindowOpen,
  foundersWindowRemainingMs,
  FOUNDERS_PRODUCT,
  PRO_PRODUCT,
} from '@/lib/purchases/products';
import type { EntitlementTier, PurchaseResult } from '@/lib/purchases/types';
import { supabase } from '@/lib/supabase/client';
import { useAccountContext } from './AccountContext';
import { PURCHASES_ENABLED } from '@/constants/featureFlags';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PurchasesContextValue {
  /** Current tier resolved from RC customer info. */
  tier: EntitlementTier;
  /** True while offerings or customerInfo are loading. */
  isLoading: boolean;
  /** RC offerings payload; null until loaded. */
  offerings: PurchasesOfferings | null;
  /** Launch date fetched from Supabase app_config; null until loaded. */
  foundersLaunchAt: Date | null;
  /** Whether the Founders Edition purchase window is currently open. */
  foundersWindowOpen: boolean;
  /** Milliseconds until the Founders window closes, clamped to >= 0. */
  foundersWindowRemainingMs: number;
  /**
   * ISO8601 date of original Founders Edition IAP; null if not a founder.
   * Used by BadgesProvider to record the purchase timestamp.
   */
  foundersPurchasedAt: string | null;
  /**
   * True when the App Store receipt's originalApplicationVersion starts with
   * "0", meaning this Apple ID first downloaded the app on a pre-v1.0 build.
   *
   * Used by useEntitlements() to automatically grant a Pro-level entitlement
   * to v0.x early adopters once PURCHASES_ENABLED is flipped on, without
   * requiring any action from the user.
   *
   * Note: TestFlight/sandbox always returns "1.0" regardless of actual version,
   * so this flag is only meaningful for public App Store receipts.
   * Treat as a derived value — it updates via addCustomerInfoUpdateListener,
   * so do not gate any UI synchronously on the very first render.
   */
  isV0Grandfather: boolean;
  /** Purchase the Founders Edition non-consumable. */
  purchaseFounders: () => Promise<PurchaseResult>;
  /** Purchase the ClawBoy Pro non-consumable. */
  purchasePro: () => Promise<PurchaseResult>;
  /** Trigger RC restore purchases flow. */
  restore: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const PurchasesContext = createContext<PurchasesContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function tierFromCustomerInfo(info: CustomerInfo): EntitlementTier {
  const entitlementIds = Object.keys(info.entitlements.active);
  return resolveTier(entitlementIds);
}

/**
 * Returns true when this Apple ID first downloaded the app on a pre-v1.0 build.
 * See PurchasesContextValue.isV0Grandfather for full semantics.
 */
function isV0OriginalApplicationVersion(info: CustomerInfo): boolean {
  const v = info.originalApplicationVersion ?? '';
  return v.startsWith('0');
}

/** Extract the original founders IAP purchase date from customerInfo, or null. */
function foundersOriginalPurchaseDate(info: CustomerInfo): string | null {
  const entitlement = info.entitlements.active[FOUNDERS_PRODUCT.entitlementId];
  if (!entitlement) return null;
  // RC provides originalPurchaseDate as ISO8601 string.
  return entitlement.originalPurchaseDate ?? entitlement.latestPurchaseDate ?? null;
}

async function findPackageForProductId(
  offerings: PurchasesOfferings | null,
  productId: string
): Promise<PurchasesPackage | null> {
  if (!offerings) return null;
  for (const offering of Object.values(offerings.all)) {
    for (const pkg of offering.availablePackages) {
      if (pkg.product.identifier === productId) return pkg;
    }
  }
  return null;
}

/** Fetch the founders_launch_at timestamp from the Supabase app_config table. */
async function fetchFoundersLaunchAt(): Promise<Date | null> {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'founders_launch_at')
      .single();

    if (error || !data?.value) return null;

    // Value is stored as a jsonb string: "\"2026-05-01T10:00:00Z\""
    // data.value is already parsed from JSON, so it's a string.
    const raw = typeof data.value === 'string' ? data.value : String(data.value);
    const date = new Date(raw);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Disabled stub value (used when PURCHASES_ENABLED = false)
// ─────────────────────────────────────────────────────────────────────────────

const DISABLED_VALUE: PurchasesContextValue = {
  tier: 'free',
  isLoading: false,
  offerings: null,
  foundersLaunchAt: null,
  foundersWindowOpen: false,
  foundersWindowRemainingMs: 0,
  foundersPurchasedAt: null,
  isV0Grandfather: false,
  purchaseFounders: async () => ({ status: 'error', message: 'Purchases disabled' }),
  purchasePro: async () => ({ status: 'error', message: 'Purchases disabled' }),
  restore: async () => {},
};

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function PurchasesProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  if (!PURCHASES_ENABLED) {
    return (
      <PurchasesContext.Provider value={DISABLED_VALUE}>
        {children}
      </PurchasesContext.Provider>
    );
  }

  return <PurchasesProviderActive>{children}</PurchasesProviderActive>;
}

function PurchasesProviderActive({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { status, user } = useAccountContext();

  const [tier, setTier] = useState<EntitlementTier>('free');
  const [isLoading, setIsLoading] = useState(true);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [foundersLaunchAt, setFoundersLaunchAt] = useState<Date | null>(null);
  const [windowRemainingMs, setWindowRemainingMs] = useState(0);
  const [foundersPurchasedAt, setFoundersPurchasedAt] = useState<string | null>(null);
  const [isV0Grandfather, setIsV0Grandfather] = useState(false);

  const aliasedUserIdRef = useRef<string | null>(null);
  const configuredRef = useRef(false);

  // ── Configure RC + fetch offerings + fetch launch date on mount ───────────
  useEffect(() => {
    if (configuredRef.current) return;
    configuredRef.current = true;
    configurePurchases();

    let mounted = true;

    void (async (): Promise<void> => {
      try {
        const [info, offs, launchAt] = await Promise.all([
          Purchases.getCustomerInfo(),
          Purchases.getOfferings(),
          fetchFoundersLaunchAt(),
        ]);
        if (!mounted) return;
        setTier(tierFromCustomerInfo(info));
        setIsV0Grandfather(isV0OriginalApplicationVersion(info));
        setFoundersPurchasedAt(foundersOriginalPurchaseDate(info));
        setOfferings(offs);
        setFoundersLaunchAt(launchAt);
        setWindowRemainingMs(foundersWindowRemainingMs(launchAt));
      } catch {
        // RC not configured (missing API key in dev) — stay at defaults.
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, []);

  // ── Recompute window remaining every 60 seconds ───────────────────────────
  useEffect(() => {
    if (!foundersLaunchAt) return;
    const tick = (): void => {
      setWindowRemainingMs(foundersWindowRemainingMs(foundersLaunchAt));
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [foundersLaunchAt]);

  // ── Listen for RC customerInfo updates ────────────────────────────────────
  useEffect(() => {
    const listener = (info: CustomerInfo): void => {
      setTier(tierFromCustomerInfo(info));
      setIsV0Grandfather(isV0OriginalApplicationVersion(info));
      setFoundersPurchasedAt(foundersOriginalPurchaseDate(info));
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  // ── Alias anonymous ID → Supabase user ID on sign-in ─────────────────────
  useEffect(() => {
    if (status === 'signed-in' && user && aliasedUserIdRef.current !== user.id) {
      aliasedUserIdRef.current = user.id;
      void (async (): Promise<void> => {
        try {
          const { customerInfo } = await Purchases.logIn(user.id);
          setTier(tierFromCustomerInfo(customerInfo));
          setIsV0Grandfather(isV0OriginalApplicationVersion(customerInfo));
          setFoundersPurchasedAt(foundersOriginalPurchaseDate(customerInfo));
        } catch {
          // Non-fatal — local entitlement is still correct.
        }
      })();
    }

    if (status === 'signed-out' && aliasedUserIdRef.current !== null) {
      aliasedUserIdRef.current = null;
      void (async (): Promise<void> => {
        try {
          const info = await Purchases.logOut();
          setTier(tierFromCustomerInfo(info));
          setIsV0Grandfather(isV0OriginalApplicationVersion(info));
        } catch {
          // Non-fatal.
        }
      })();
    }
  }, [status, user]);

  // ── purchaseFounders ──────────────────────────────────────────────────────
  const purchaseFounders = useCallback(async (): Promise<PurchaseResult> => {
    const pkg = await findPackageForProductId(offerings, FOUNDERS_PRODUCT.productId);
    if (!pkg) return { status: 'error', message: 'Founders Edition is not available' };

    try {
      await Purchases.purchasePackage(pkg);
      return { status: 'success' };
    } catch (e: unknown) {
      const err = e as { userCancelled?: boolean; code?: number; message?: string };
      if (err.userCancelled) return { status: 'cancelled' };
      if (
        typeof err.code === 'number' &&
        err.code === (PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR as unknown as number)
      ) {
        return { status: 'success' };
      }
      return { status: 'error', message: err.message ?? 'Purchase failed' };
    }
  }, [offerings]);

  // ── purchasePro ───────────────────────────────────────────────────────────
  const purchasePro = useCallback(async (): Promise<PurchaseResult> => {
    const pkg = await findPackageForProductId(offerings, PRO_PRODUCT.productId);
    if (!pkg) return { status: 'error', message: 'ClawBoy Pro is not available' };

    try {
      await Purchases.purchasePackage(pkg);
      return { status: 'success' };
    } catch (e: unknown) {
      const err = e as { userCancelled?: boolean; code?: number; message?: string };
      if (err.userCancelled) return { status: 'cancelled' };
      if (
        typeof err.code === 'number' &&
        err.code === (PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR as unknown as number)
      ) {
        return { status: 'success' };
      }
      return { status: 'error', message: err.message ?? 'Purchase failed' };
    }
  }, [offerings]);

  // ── restore ───────────────────────────────────────────────────────────────
  const restore = useCallback(async (): Promise<void> => {
    try {
      const info = await Purchases.restorePurchases();
      setTier(tierFromCustomerInfo(info));
      setIsV0Grandfather(isV0OriginalApplicationVersion(info));
      setFoundersPurchasedAt(foundersOriginalPurchaseDate(info));
    } catch {
      // Non-fatal — let callers handle UI feedback.
    }
  }, []);

  const value: PurchasesContextValue = {
    tier,
    isLoading,
    offerings,
    foundersLaunchAt,
    foundersWindowOpen: isFoundersWindowOpen(foundersLaunchAt),
    foundersWindowRemainingMs: windowRemainingMs,
    foundersPurchasedAt,
    isV0Grandfather,
    purchaseFounders,
    purchasePro,
    restore,
  };

  return (
    <PurchasesContext.Provider value={value}>
      {children}
    </PurchasesContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function usePurchases(): PurchasesContextValue {
  const ctx = useContext(PurchasesContext);
  if (!ctx) throw new Error('usePurchases must be used within PurchasesProvider');
  return ctx;
}
