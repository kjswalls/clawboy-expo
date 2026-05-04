-- Fix missing GRANT statements on public tables.
--
-- The initial migration created tables + RLS policies but omitted the GRANT
-- statements required for the `authenticated` role to perform DML/SELECT.
-- Without these grants, Postgres blocks every query before RLS is evaluated,
-- causing 42501 "permission denied" on all reads and writes from the app.
--
-- GRANTs are idempotent — safe to run on both fresh and existing databases.
-- ────────────────────────────────────────────────────────────────────────────

-- accounts: authenticated users read own row + update display_name.
-- Insert is handled by handle_new_user() trigger (security definer).
-- Delete cascades from auth.users; no direct client delete needed.
grant select, update on public.accounts to authenticated;

-- server_profile_pointers: authenticated users need full CRUD.
grant select, insert, update, delete on public.server_profile_pointers to authenticated;

-- entitlements: authenticated users read-only.
-- Writes come exclusively from Edge Functions running as service_role.
grant select on public.entitlements to authenticated;
grant select, insert, update, delete on public.entitlements to service_role;
