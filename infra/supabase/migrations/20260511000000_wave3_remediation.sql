-- Wave 3 Remediation — forward-only migration
-- Applied: 2026-05-11
--
-- Covers: db-001, db-002, db-003, db-004, db-005, db-006, db-009, db-010
--
-- ── db-007 note (documentation only) ──────────────────────────────────────
-- `DROP TABLE IF EXISTS public.tips_log` in 20260501000000_purchases_v2.sql
-- was intentional — the tips_log table was removed when the v1 tip-purchase
-- SKUs were dropped from the product.  No user-facing data-loss risk: the
-- table had zero GRANT statements and was unreachable from any client
-- (same missing-GRANTs pattern as db-001).  Any historical rows are
-- unrecoverable by design.  Future destructive operations should follow the
-- rename-then-drop pattern; document in CONTRIBUTING.md when written (X1).
--
-- ── db-008 note (documentation only) ──────────────────────────────────────
-- `ALTER TABLE public.entitlements ADD CONSTRAINT entitlements_tier_check …`
-- in 20260501000000_purchases_v2.sql is NOT idempotent — Postgres does not
-- support ADD CONSTRAINT IF NOT EXISTS for CHECK constraints.  Re-applying
-- after `supabase migration repair` will fail with 42710 "already exists".
-- Accepted limitation.  Document in CONTRIBUTING.md when written (X1).
--
-- ── db-011 note (documentation only) ──────────────────────────────────────
-- supabase/migrations/ is a symlink to infra/supabase/migrations/.
-- infra/supabase/migrations/ is the canonical source-of-truth.
-- The symlink exists solely for Supabase CLI compatibility (`supabase db push`
-- resolves it from the project root).  On Windows checkouts with
-- core.symlinks=false the symlink appears as a plain-text file containing the
-- target path; contributors must use infra/supabase/migrations/ directly.
-- Document in CONTRIBUTING.md when written (X1).
-- ──────────────────────────────────────────────────────────────────────────


-- ============================================================
-- db-001  Missing GRANTs on v2 tables  (HIGH)
-- ============================================================
-- The purchases_v2 migration created four new tables but issued no GRANT
-- statements.  Without GRANTs, Postgres rejects every client query before
-- RLS is evaluated (42501 "permission denied").  The existing
-- fix_table_grants migration patched only the v1 tables; this section
-- applies the equivalent fix to the v2 tables.
-- GRANTs are idempotent — safe to run on both fresh and existing databases.

-- app_config: anon + authenticated may read (whitelisted keys per db-003).
--             service_role writes via Edge Functions and admin tooling.
grant select on public.app_config to anon, authenticated;
grant all on public.app_config to service_role;

-- cosmetics_catalog: public catalog read; service_role inserts new packs.
grant select on public.cosmetics_catalog to anon, authenticated;
grant all on public.cosmetics_catalog to service_role;

-- cosmetic_unlocks: authenticated users read their own rows.
--                   service_role writes via triggers and Edge Functions.
grant select on public.cosmetic_unlocks to authenticated;
grant all on public.cosmetic_unlocks to service_role;

-- achievement_progress: authenticated users read their own rows.
--                       service_role writes via triggers and Edge Functions.
grant select on public.achievement_progress to authenticated;
grant all on public.achievement_progress to service_role;


-- ============================================================
-- db-002  SECURITY DEFINER functions missing SET search_path  (HIGH)
-- ============================================================
-- Without an explicit SET search_path, a user who can create objects in a
-- schema that appears earlier in the resolved search path can shadow
-- built-ins and execute privileged code in the function owner's security
-- context.  Supabase's RLS linter flags this as function_search_path_mutable.
--
-- Fix: re-declare all four SECURITY DEFINER trigger functions with
-- SET search_path = public, pg_temp.  Function bodies are verbatim copies
-- from the originating migrations — only the CREATE OR REPLACE header gains
-- the SET clause.

-- handle_new_user — originally in 20260401000000_init.sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.accounts (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- handle_new_account — originally in 20260401000000_init.sql
create or replace function public.handle_new_account()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.entitlements (account_id)
  values (new.id)
  on conflict (account_id) do nothing;
  return new;
end;
$$;

-- grant_cosmetics_for_entitlement — originally in 20260501000000_purchases_v2.sql
create or replace function public.grant_cosmetics_for_entitlement()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Only act when tier actually changes to a paid tier.
  if new.tier = 'founder' and (old is null or old.tier is distinct from 'founder') then
    insert into public.cosmetic_unlocks (account_id, pack_id, source)
    select new.account_id, c.id, 'entitlement_founder'
    from public.cosmetics_catalog c
    where c.founders_inclusive = true
    on conflict (account_id, pack_id) do nothing;

    -- Auto-unlock F1 pioneer achievement for all Founders.
    insert into public.achievement_progress (account_id, achievement_id, progress, unlocked_at)
    values (new.account_id, 'f1_pioneer', '{"completed": true}'::jsonb, now())
    on conflict (account_id, achievement_id) do nothing;
  end if;

  if new.tier = 'pro' and (old is null or old.tier is distinct from 'pro') then
    -- Pro snapshot: only packs that existed at time of purchase.
    insert into public.cosmetic_unlocks (account_id, pack_id, source)
    select new.account_id, c.id, 'entitlement_pro'
    from public.cosmetics_catalog c
    where c.pro_inclusive_at_purchase = true
      and c.released_at <= coalesce(new.purchased_at, now())
    on conflict (account_id, pack_id) do nothing;
  end if;

  return new;
end;
$$;

-- auto_grant_new_cosmetic_to_founders — originally in 20260501000000_purchases_v2.sql
create or replace function public.auto_grant_new_cosmetic_to_founders()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.founders_inclusive = true then
    insert into public.cosmetic_unlocks (account_id, pack_id, source)
    select e.account_id, new.id, 'entitlement_founder'
    from public.entitlements e
    where e.tier = 'founder'
    on conflict (account_id, pack_id) do nothing;
  end if;
  return new;
end;
$$;


-- ============================================================
-- db-003  app_config public-read too permissive  (MED)
-- ============================================================
-- The original `using (true)` policy makes every key in app_config readable
-- by any anon or authenticated client.  The table is a generic key/value
-- store; a future operator who adds a key like `support_api_token` or any
-- other internal config would inadvertently expose it.
--
-- Replace with an explicit whitelist.  To expose a new public key, extend
-- the IN list below — never revert to USING (true).

drop policy if exists "app_config: public read" on public.app_config;

create policy "app_config: public read"
  on public.app_config for select
  using (key in ('founders_launch_at'));


-- ============================================================
-- db-004  UPDATE policies missing WITH CHECK  (MED)
-- ============================================================
-- Postgres falls back to USING-as-WITH-CHECK when WITH CHECK is omitted,
-- so this is not currently exploitable.  The implicit fallback is a footgun:
-- a future maintainer who adds a column-level condition to USING will not
-- realize the same predicate now governs the written row as well.
-- Explicit WITH CHECK makes intent unambiguous and matches the explicit
-- WITH CHECK already present on server_profile_pointers INSERT.
--
-- Note: these recreations also incorporate the (select auth.uid()) wrap
-- from db-005 so each policy is only dropped/recreated once.

-- accounts: self update
drop policy if exists "accounts: self update" on public.accounts;
create policy "accounts: self update"
  on public.accounts for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- server_profile_pointers: self update
drop policy if exists "server_profile_pointers: self update" on public.server_profile_pointers;
create policy "server_profile_pointers: self update"
  on public.server_profile_pointers for update
  using ((select auth.uid()) = account_id)
  with check ((select auth.uid()) = account_id);


-- ============================================================
-- db-005  auth.uid() called per-row  (MED)
-- ============================================================
-- Bare auth.uid() is re-evaluated for every row scanned during an RLS
-- check.  Wrapping it in (select auth.uid()) causes Postgres to treat it
-- as an InitPlan (evaluated once per query) rather than a per-row function
-- call.  On large tables this is measurable; on small tables it is free.
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#use-functions-in-policies
--
-- The UPDATE policies above (db-004) already use the wrapped form.
-- This section covers all remaining SELECT / INSERT / DELETE policies
-- that contained bare auth.uid() calls.

-- accounts: self select
drop policy if exists "accounts: self select" on public.accounts;
create policy "accounts: self select"
  on public.accounts for select
  using ((select auth.uid()) = id);

-- server_profile_pointers: self select
drop policy if exists "server_profile_pointers: self select" on public.server_profile_pointers;
create policy "server_profile_pointers: self select"
  on public.server_profile_pointers for select
  using ((select auth.uid()) = account_id);

-- server_profile_pointers: self insert
drop policy if exists "server_profile_pointers: self insert" on public.server_profile_pointers;
create policy "server_profile_pointers: self insert"
  on public.server_profile_pointers for insert
  with check ((select auth.uid()) = account_id);

-- server_profile_pointers: self delete
drop policy if exists "server_profile_pointers: self delete" on public.server_profile_pointers;
create policy "server_profile_pointers: self delete"
  on public.server_profile_pointers for delete
  using ((select auth.uid()) = account_id);

-- entitlements: self select
drop policy if exists "entitlements: self select" on public.entitlements;
create policy "entitlements: self select"
  on public.entitlements for select
  using ((select auth.uid()) = account_id);

-- cosmetic_unlocks: self select
drop policy if exists "cosmetic_unlocks: self select" on public.cosmetic_unlocks;
create policy "cosmetic_unlocks: self select"
  on public.cosmetic_unlocks for select
  using ((select auth.uid()) = account_id);

-- achievement_progress: self select
drop policy if exists "achievement_progress: self select" on public.achievement_progress;
create policy "achievement_progress: self select"
  on public.achievement_progress for select
  using ((select auth.uid()) = account_id);


-- ============================================================
-- db-006  Missing FK index on cosmetic_unlocks.pack_id  (LOW)
-- ============================================================
-- cosmetic_unlocks has a unique (account_id, pack_id) composite index but
-- pack_id is the trailing column.  Single-column lookups by pack_id alone
-- (e.g. cascade-enforcement scans when a cosmetics_catalog row is deleted)
-- will full-scan cosmetic_unlocks without a dedicated index.
-- CREATE INDEX IF NOT EXISTS is idempotent.

create index if not exists idx_cosmetic_unlocks_pack_id
  on public.cosmetic_unlocks (pack_id);


-- ============================================================
-- db-009  Undocumented intentional policy omissions  (LOW)
-- ============================================================
-- Several tables deliberately lack INSERT / UPDATE / DELETE client policies;
-- writes are handled exclusively by service_role (Edge Functions and triggers).
-- Without documentation a reviewer reading the migrations cold cannot
-- distinguish intentional omission from oversight.
-- COMMENT ON POLICY attaches the rationale directly to the existing SELECT
-- policy on each table so it is visible in pg_policies.

comment on policy "cosmetic_unlocks: self select" on public.cosmetic_unlocks
  is 'SELECT only — INSERT/UPDATE/DELETE intentionally absent. Rows are written exclusively by service_role via the grant_cosmetics_for_entitlement and auto_grant_new_cosmetic_to_founders triggers plus Edge Functions. No direct client write path exists by design.';

comment on policy "achievement_progress: self select" on public.achievement_progress
  is 'SELECT only — INSERT/UPDATE/DELETE intentionally absent. Rows are written exclusively by service_role via Edge Functions and triggers. No direct client write path exists by design.';

comment on policy "app_config: public read" on public.app_config
  is 'Public-read restricted to safe keys. To expose a new key, add it to the IN list in the migration that creates or alters this policy. INSERT/UPDATE/DELETE intentionally absent — written exclusively by service_role / admin tooling.';


-- ============================================================
-- db-010  Optional URL scheme CHECK on server_profile_pointers  (NIT)
-- ============================================================
-- server_profile_pointers.url is stored as untyped text with no CHECK
-- constraint.  The README and inline comment both state "wss:// URL — no
-- token", but nothing currently prevents a client from writing an http://
-- or arbitrary value.  NOT VALID skips the scan of existing rows so this
-- does not block on production data; future inserts and updates are checked.
-- Allows ws:// for local development.  Tighten to ^wss:// when Phase-2
-- certificate pinning lands.

do $$ begin
  alter table public.server_profile_pointers
    add constraint server_profile_pointers_url_scheme_check
    check (url ~ '^wss?://') not valid;
exception when duplicate_object then null;
end $$;
