/**
 * purchases-webhook — RevenueCat → Supabase entitlements sync.
 *
 * Deploy:
 *   supabase functions deploy purchases-webhook --no-verify-jwt
 *
 * Required env vars (set in Supabase dashboard → Edge Functions → Secrets):
 *   REVENUECAT_WEBHOOK_SECRET  — shared secret from RC dashboard webhook config
 *   SUPABASE_SERVICE_ROLE_KEY  — auto-injected by Supabase runtime
 *   SUPABASE_URL               — auto-injected by Supabase runtime
 *
 * RevenueCat webhook docs:
 *   https://www.revenuecat.com/docs/integrations/webhooks
 *
 * Handled events:
 *   INITIAL_PURCHASE, NON_RENEWING_PURCHASE  → upsert entitlements tier
 *   TRANSFER                                  → re-upsert after RC aliasing
 *   CANCELLATION, BILLING_ISSUE              → no-op for non-consumable IAP
 *
 * Skipped:
 *   Anonymous appUserID ($RCAnonymousID:*) — no Supabase row yet.
 *   Subscription RENEWAL / EXPIRATION — not applicable to our products.
 *
 * Note: cosmetic_unlocks grants are handled automatically by the
 * grant_cosmetics_for_entitlement DB trigger on entitlements upsert.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// Tier resolution — mirrors src/lib/purchases/products.ts
// ─────────────────────────────────────────────────────────────────────────────

const ENTITLEMENT_TO_TIER: Record<string, string> = {
  founder: 'founder',
  pro: 'pro',
};

/** Returns the highest tier from a list of active entitlement IDs, or null if none. */
function resolveHighestTier(entitlementIds: string[]): string | null {
  if (entitlementIds.includes('founder')) return 'founder';
  if (entitlementIds.includes('pro')) return 'pro';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook types (simplified — only fields we use)
// ─────────────────────────────────────────────────────────────────────────────

interface RCWebhookEvent {
  event: {
    type: string;
    app_user_id: string;
    product_id: string;
    entitlement_ids: string[] | null;
    purchased_at_ms: number;
    expiration_at_ms: number | null;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // ── Verify RevenueCat shared secret ───────────────────────────────────────
  const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  if (webhookSecret) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || authHeader !== webhookSecret) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  let body: RCWebhookEvent;
  try {
    body = await req.json() as RCWebhookEvent;
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const { type, app_user_id, entitlement_ids, purchased_at_ms, expiration_at_ms } =
    body.event;

  // ── Skip anonymous IDs — no Supabase row exists yet ───────────────────────
  if (app_user_id.startsWith('$RCAnonymousID:')) {
    return new Response(JSON.stringify({ skipped: 'anonymous_user' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Only handle purchase / transfer events ────────────────────────────────
  const handled = ['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE', 'TRANSFER'];
  if (!handled.includes(type)) {
    return new Response(JSON.stringify({ skipped: `event_type_${type}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const activeEntitlements = entitlement_ids ?? [];
  const tier = resolveHighestTier(activeEntitlements);

  if (!tier) {
    return new Response(JSON.stringify({ skipped: 'no_recognized_entitlement' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Unused at runtime but kept for documentation: confirms the tier string
  // is one we deliberately mapped (TypeScript-level safety at build time).
  void (ENTITLEMENT_TO_TIER[tier]);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await supabase.from('entitlements').upsert(
    {
      account_id: app_user_id,
      tier,
      source: 'revenuecat',
      purchased_at: new Date(purchased_at_ms).toISOString(),
      expires_at: expiration_at_ms ? new Date(expiration_at_ms).toISOString() : null,
    },
    { onConflict: 'account_id' }
  );

  if (error) {
    console.error('[purchases-webhook] entitlements upsert failed:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, account_id: app_user_id, tier }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
