-- ClawBoy Founders Edition — v2
-- Supabase Postgres migration 0002_founders
--
-- Extends the entitlements table for Founders Edition IAP tiers
-- and an optional tips_log for lifetime tip totals.
--
-- Allowed tier values (documentation only — column is unconstrained text):
--   'free'           — default
--   'founder_bronze' — Founders Bronze ($4.99)
--   'founder_silver' — Founders Silver ($14.99)
--   'founder_gold'   — Founders Gold ($49.99)
--
-- Allowed source values:
--   'revenuecat'  — RevenueCat IAP (new)
--   'apple_iap'   — legacy direct StoreKit (kept for future reference)
--   'stripe'      — web billing (future)
--   'manual'      — admin grant

-- ────────────────────────────────────────────────────────────────────────────
-- Extend entitlements with purchased_at
-- ────────────────────────────────────────────────────────────────────────────
alter table public.entitlements
  add column if not exists purchased_at timestamptz;

-- ────────────────────────────────────────────────────────────────────────────
-- tips_log (optional — records consumable tip purchases for lifetime total)
-- Service-role write only; users can read their own rows.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.tips_log (
  id           uuid        primary key default gen_random_uuid(),
  account_id   uuid        not null references public.accounts(id) on delete cascade,
  product_id   text        not null,  -- e.g. 'clawboy.tip.small'
  purchased_at timestamptz not null default now()
);

alter table public.tips_log enable row level security;

create policy "tips_log: self select"
  on public.tips_log for select
  using (account_id = auth.uid());

-- Service-role writes only; no client-writable policy.
