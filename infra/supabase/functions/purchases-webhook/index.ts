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
 *   INITIAL_PURCHASE, NON_RENEWING_PURCHASE  → upsert Founders tier
 *   TRANSFER                                  → re-upsert after aliasing
 *   CANCELLATION, BILLING_ISSUE              → no-op for non-consumable IAP
 *   tip products (no entitlement)            → optionally log to tips_log
 *
 * Skipped:
 *   Anonymous appUserID ($RCAnonymousID:*) — no Supabase row yet.
 *   Subscription RENEWAL / EXPIRATION — not applicable to our products.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// Tier resolution — mirrors src/lib/purchases/products.ts
// ─────────────────────────────────────────────────────────────────────────────

const ENTITLEMENT_TO_TIER: Record<string, string> = {
  founders_bronze: 'founder_bronze',
  founders_silver: 'founder_silver',
  founders_gold: 'founder_gold',
};

const TIP_PRODUCT_IDS = new Set([
  'clawboy.tip.small',
  'clawboy.tip.medium',
  'clawboy.tip.large',
]);

/** Returns the highest tier from a list of active entitlement IDs, or null if none. */
function resolveHighestTier(entitlementIds: string[]): string | null {
  if (entitlementIds.includes('founders_gold')) return 'founder_gold';
  if (entitlementIds.includes('founders_silver')) return 'founder_silver';
  if (entitlementIds.includes('founders_bronze')) return 'founder_bronze';
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

  const { type, app_user_id, product_id, entitlement_ids, purchased_at_ms, expiration_at_ms } =
    body.event;

  // ── Skip anonymous IDs — no Supabase row exists yet ───────────────────────
  if (app_user_id.startsWith('$RCAnonymousID:')) {
    return new Response(JSON.stringify({ skipped: 'anonymous_user' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── Handle tip products — no entitlement change, optionally log ───────────
  if (TIP_PRODUCT_IDS.has(product_id)) {
    if (type === 'INITIAL_PURCHASE' || type === 'NON_RENEWING_PURCHASE') {
      const { error } = await supabase.from('tips_log').insert({
        account_id: app_user_id,
        product_id,
        purchased_at: new Date(purchased_at_ms).toISOString(),
      });
      if (error) {
        // Non-fatal — tips_log is optional and the account_id FK may not exist yet.
        console.warn('[purchases-webhook] tips_log insert failed:', error.message);
      }
    }
    return new Response(JSON.stringify({ handled: 'tip_logged' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Handle Founders products ───────────────────────────────────────────────
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
    return new Response(JSON.stringify({ skipped: 'no_founders_entitlement' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
