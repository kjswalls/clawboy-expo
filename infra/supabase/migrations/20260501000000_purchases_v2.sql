-- ClawBoy purchases v2 — two-purchase architecture
-- Migration 0003_purchases_v2
--
-- Changes from v1 (founders tiers) to v2 (Founders + Pro):
--   - Drops tips_log (no tip SKUs in new plan)
--   - Migrates entitlements.tier from bronze/silver/gold -> 'founder'
--   - Adds CHECK constraint on tier
--   - Adds app_config table (Supabase-hosted config, e.g. founders_launch_at)
--   - Adds cosmetics_catalog (server-managed pack registry)
--   - Adds cosmetic_unlocks (per-account unlocked packs)
--   - Adds achievement_progress (for F1-F5 + future badge achievements)
--   - Adds accounts.display_preferences (selected icon/theme/etc.)
--   - Adds grant_cosmetics_for_entitlement trigger (auto-grant on tier upsert)
--   - Adds auto_grant_new_cosmetic_to_founders trigger (lifetime free packs)
--
-- Tier values (enforced by CHECK):
--   'free'    — default
--   'pro'     — ClawBoy Pro ($19.99, available day 61+)
--   'founder' — Founders Edition ($9.99, days 1-60 only)
--
-- Source values (informational only, no constraint):
--   'revenuecat' | 'apple_iap' | 'stripe' | 'manual'

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Drop tips_log
-- ────────────────────────────────────────────────────────────────────────────
drop table if exists public.tips_log;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Migrate entitlements.tier values
--    founder_bronze / founder_silver / founder_gold -> 'founder'
--    anything else (free, pro, legacy) stays as-is
-- ────────────────────────────────────────────────────────────────────────────
update public.entitlements
  set tier = 'founder'
  where tier in ('founder_bronze', 'founder_silver', 'founder_gold');

-- Add CHECK constraint now that tier values are clean.
alter table public.entitlements
  add constraint entitlements_tier_check
  check (tier in ('free', 'pro', 'founder'));

-- ────────────────────────────────────────────────────────────────────────────
-- 3. app_config
--    Key-value store for server-managed app configuration.
--    Public SELECT (anon key) so the client can read it without auth.
--    Service-role only for writes.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.app_config (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

create policy "app_config: public read"
  on public.app_config for select
  using (true);

-- Trigger to keep updated_at fresh.
create trigger app_config_updated_at
  before update on public.app_config
  for each row execute function public.touch_updated_at();

-- Seed founders_launch_at.
-- Value is a timestamptz stored as a JSON string in the jsonb column.
-- The client extracts it with: value ->> 0  (or: value::text stripped of quotes)
-- Change this date to match your actual app launch date before going live.
insert into public.app_config (key, value)
  values (
    'founders_launch_at',
    to_jsonb(now()::text)
  )
  on conflict (key) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. cosmetics_catalog
--    Registry of all cosmetic packs (themes, icons, sounds, etc.).
--    Server-managed; inserted by migrations or admin tooling.
--    Public SELECT so the client can display the full catalog (including
--    locked items) for the trophy shelf / "coming soon" preview.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.cosmetics_catalog (
  -- Stable unique identifier, e.g. 'theme_midnight_navy', 'icon_dragon_og'
  id                      text        primary key,
  -- 'theme' | 'icon' | 'sound' | 'badge' | 'frame' | 'typing_indicator'
  kind                    text        not null,
  title                   text        not null,
  description             text,
  -- App Store / Play Console product_id if sold individually; null for bundled perks.
  product_id              text,
  -- When this pack was added to the catalog (used for pro_inclusive snapshot logic).
  released_at             timestamptz not null default now(),
  -- true -> Founders get this pack for free (including future packs via trigger).
  founders_inclusive      boolean     not null default true,
  -- true -> Pro buyers get this pack if it existed at time of their purchase.
  pro_inclusive_at_purchase boolean   not null default true,
  -- Flexible metadata (preview asset URLs, unlock conditions, sort order, etc.)
  metadata                jsonb       not null default '{}'::jsonb
);

alter table public.cosmetics_catalog enable row level security;

create policy "cosmetics_catalog: public read"
  on public.cosmetics_catalog for select
  using (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. cosmetic_unlocks
--    Per-account record of which packs are unlocked.
--    Populated by the grant_cosmetics_for_entitlement trigger (on tier upsert)
--    and auto_grant_new_cosmetic_to_founders trigger (on catalog insert).
--    Individual pack purchases will also insert here (future).
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.cosmetic_unlocks (
  id          uuid        primary key default gen_random_uuid(),
  account_id  uuid        not null references public.accounts(id) on delete cascade,
  pack_id     text        not null references public.cosmetics_catalog(id),
  -- 'entitlement_founder' | 'entitlement_pro' | 'individual_purchase' | 'manual'
  source      text        not null,
  unlocked_at timestamptz not null default now(),
  unique (account_id, pack_id)
);

alter table public.cosmetic_unlocks enable row level security;

create policy "cosmetic_unlocks: self select"
  on public.cosmetic_unlocks for select
  using (account_id = auth.uid());

-- Service-role writes only; no client-writable policy.

-- ────────────────────────────────────────────────────────────────────────────
-- 6. achievement_progress
--    Per-account badge / achievement state.
--    F1-F5 are Founders-exclusive; future achievements are open.
--    'progress' jsonb stores arbitrary counters/state per achievement type.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.achievement_progress (
  id             uuid        primary key default gen_random_uuid(),
  account_id     uuid        not null references public.accounts(id) on delete cascade,
  -- e.g. 'f1_pioneer', 'f2_early_adopter', 'chat_streak_7', etc.
  achievement_id text        not null,
  -- Flexible state blob: {"count": 42, "completed": true, "last_at": "..."}
  progress       jsonb       not null default '{}'::jsonb,
  -- Non-null when the achievement is fully unlocked.
  unlocked_at    timestamptz,
  unique (account_id, achievement_id)
);

alter table public.achievement_progress enable row level security;

create policy "achievement_progress: self select"
  on public.achievement_progress for select
  using (account_id = auth.uid());

-- Service-role writes only; no client-writable policy.

-- ────────────────────────────────────────────────────────────────────────────
-- 7. accounts.display_preferences
--    Flexible JSON column for user-selected cosmetic preferences.
--    Shape (all optional, app defaults apply when keys are absent):
--      {
--        "app_icon":          "icon_dragon_og",    -- selected app icon id
--        "theme":             "theme_midnight_navy", -- selected theme id
--        "accent_color":      "#FFB347",            -- hex, founder/pro custom picker
--        "sound_pack":        "sounds_founders",    -- selected sound pack id
--        "typing_indicator":  "typing_claw",        -- selected typing indicator id
--        "badge_frame":       "frame_holographic",  -- selected badge frame id
--      }
--    Stored on the accounts row so it syncs cross-device.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.accounts
  add column if not exists display_preferences jsonb not null default '{}'::jsonb;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. grant_cosmetics_for_entitlement trigger
--    Fires after INSERT OR UPDATE on entitlements.
--    When tier becomes 'founder': grant all founders_inclusive catalog packs.
--    When tier becomes 'pro': grant all pro_inclusive_at_purchase packs that
--      were released on or before the entitlement's purchased_at timestamp.
--    Idempotent via ON CONFLICT DO NOTHING.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.grant_cosmetics_for_entitlement()
returns trigger language plpgsql security definer as $$
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

create trigger grant_cosmetics_for_entitlement
  after insert or update of tier on public.entitlements
  for each row execute function public.grant_cosmetics_for_entitlement();

-- ────────────────────────────────────────────────────────────────────────────
-- 9. auto_grant_new_cosmetic_to_founders trigger
--    Fires after INSERT on cosmetics_catalog.
--    When a new founders_inclusive pack lands in the catalog, every existing
--    Founder account automatically receives it.
--    This implements the "lifetime free access to ALL future cosmetic packs"
--    guarantee without any manual backfill step.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.auto_grant_new_cosmetic_to_founders()
returns trigger language plpgsql security definer as $$
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

create trigger auto_grant_new_cosmetic_to_founders
  after insert on public.cosmetics_catalog
  for each row execute function public.auto_grant_new_cosmetic_to_founders();
