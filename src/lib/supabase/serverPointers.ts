/**
 * Server pointer helpers — thin data API over public.server_profile_pointers.
 *
 * Each row stores only the gateway URL + label for a signed-in account.
 * Auth tokens, Ed25519 private keys, and chat content NEVER go here.
 *
 * All functions are safe to call when not signed in — they will simply fail
 * at the Supabase RLS layer. Callers are expected to gate on auth status
 * before calling these, or swallow the errors for best-effort sync.
 */

import { supabase } from './client';

export interface ServerPointer {
  id: string;
  url: string;
  label: string;
}

/**
 * Fetch all server pointers for the currently signed-in account.
 * Returns an empty array if the user is not signed in or on network failure.
 */
export async function listServerPointers(): Promise<ServerPointer[]> {
  const { data, error } = await supabase
    .from('server_profile_pointers')
    .select('id, url, label')
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return (data as ServerPointer[]);
}

/**
 * Insert or update a single server pointer by URL (unique per account).
 * No-op if the Supabase call fails (e.g. signed out, offline).
 */
export async function upsertServerPointer(input: { url: string; label: string }): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('server_profile_pointers')
    .upsert(
      { account_id: user.id, url: input.url, label: input.label },
      { onConflict: 'account_id,url' }
    );
}

/**
 * Remove a server pointer by URL for the current account.
 * No-op if the Supabase call fails.
 */
export async function deleteServerPointerByUrl(url: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('server_profile_pointers')
    .delete()
    .eq('account_id', user.id)
    .eq('url', url);
}

/**
 * Insert or update multiple server pointers in one request.
 * Used on sign-in to seed the cloud with all existing local profiles.
 * No-op if the list is empty or the call fails.
 */
export async function bulkUpsertServerPointers(
  items: { url: string; label: string }[]
): Promise<void> {
  if (items.length === 0) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const rows = items.map((item) => ({
    account_id: user.id,
    url: item.url,
    label: item.label,
  }));

  await supabase
    .from('server_profile_pointers')
    .upsert(rows, { onConflict: 'account_id,url' });
}
