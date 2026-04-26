/**
 * ClawBoy — account-delete Edge Function
 *
 * Performs a complete cascade delete for the requesting authenticated user:
 *   1. Validates the caller's JWT (must be the account owner).
 *   2. Deletes all rows in public.accounts (cascades to server_profile_pointers
 *      and entitlements via FK + ON DELETE CASCADE).
 *   3. Deletes the auth.users row via the service-role admin API, which also
 *      invalidates all existing sessions/tokens.
 *
 * The public.accounts ON DELETE CASCADE from auth.users handles steps 2 in the
 * reverse direction when step 3 runs — both paths are safe.
 *
 * Deploy:
 *   supabase functions deploy account-delete --no-verify-jwt
 *   (JWT verification is done manually below so we can return a structured error)
 *
 * Required env vars (set in Supabase dashboard → Settings → Edge Functions):
 *   SUPABASE_URL           — your project URL
 *   SUPABASE_ANON_KEY      — public anon key (used for user JWT validation)
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (used for admin delete)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // Validate caller JWT using the anon client
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing authorization header' }, 401);
  }
  const token = authHeader.slice(7);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Verify caller identity via their access token
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return json({ error: 'Unauthorized', detail: userError?.message }, 401);
  }

  // Service-role client for privileged operations
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Delete the auth.users row — cascades to public.accounts, server_profile_pointers,
  // and entitlements via FK ON DELETE CASCADE.
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('[account-delete] auth.admin.deleteUser failed', deleteError);
    return json({ error: 'Failed to delete account', detail: deleteError.message }, 500);
  }

  return json({ ok: true, deleted_user_id: user.id });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
