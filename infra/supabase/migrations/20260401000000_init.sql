-- ClawBoy identity schema — v1
-- Supabase Postgres migration 0001_init
--
-- What lives here: account identity, non-secret server profile URLs, entitlement plumbing.
-- What NEVER lives here: gateway auth tokens, Ed25519 private keys, chat content.

-- ────────────────────────────────────────────────────────────────────────────
-- accounts
-- One row per auth.users entry.  display_name is user-editable.
-- ────────────────────────────────────────────────────────────────────────────
create table public.accounts (
  id           uuid        primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.accounts enable row level security;

-- authenticated users can read their own row and update display_name.
-- Insert is handled by handle_new_user() trigger (security definer).
-- Delete cascades from auth.users.
grant select, update on public.accounts to authenticated;

create policy "accounts: self select"
  on public.accounts for select
  using (id = auth.uid());

create policy "accounts: self update"
  on public.accounts for update
  using (id = auth.uid());

-- Trigger: keep updated_at fresh on every write.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger accounts_updated_at
  before update on public.accounts
  for each row execute function public.touch_updated_at();

-- Auto-create accounts row on new user signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ────────────────────────────────────────────────────────────────────────────
-- server_profile_pointers
-- Stores gateway URL + label so users can restore profile list on a new device.
-- NEVER stores auth tokens — tokens are device-local in SecureStore only.
-- ────────────────────────────────────────────────────────────────────────────
create table public.server_profile_pointers (
  id         uuid        primary key default gen_random_uuid(),
  account_id uuid        not null references public.accounts(id) on delete cascade,
  label      text        not null,
  url        text        not null,   -- wss:// URL — no token
  created_at timestamptz not null default now(),
  unique (account_id, url)
);

alter table public.server_profile_pointers enable row level security;

-- authenticated users need full CRUD on their own pointers.
grant select, insert, update, delete on public.server_profile_pointers to authenticated;

create policy "server_profile_pointers: self select"
  on public.server_profile_pointers for select
  using (account_id = auth.uid());

create policy "server_profile_pointers: self insert"
  on public.server_profile_pointers for insert
  with check (account_id = auth.uid());

create policy "server_profile_pointers: self update"
  on public.server_profile_pointers for update
  using (account_id = auth.uid());

create policy "server_profile_pointers: self delete"
  on public.server_profile_pointers for delete
  using (account_id = auth.uid());


-- ────────────────────────────────────────────────────────────────────────────
-- entitlements
-- One row per account.  Tier starts at 'free'.  IAP/Stripe wiring is deferred
-- to a follow-up plan — this table is plumbing only.
-- ────────────────────────────────────────────────────────────────────────────
create table public.entitlements (
  account_id uuid        primary key references public.accounts(id) on delete cascade,
  tier       text        not null default 'free', -- 'free' | 'pro' | future skus
  source     text,                                -- 'apple_iap' | 'stripe' | 'manual'
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;

-- authenticated users read-only; writes come from service_role Edge Functions only.
grant select on public.entitlements to authenticated;
grant select, insert, update, delete on public.entitlements to service_role;

create policy "entitlements: self select"
  on public.entitlements for select
  using (account_id = auth.uid());

-- Only service-role (Edge Functions / server) can write entitlements.
-- App can read but never modify its own entitlement row directly.

create trigger entitlements_updated_at
  before update on public.entitlements
  for each row execute function public.touch_updated_at();

-- Auto-create entitlements row alongside accounts row.
create or replace function public.handle_new_account()
returns trigger language plpgsql security definer as $$
begin
  insert into public.entitlements (account_id)
  values (new.id)
  on conflict (account_id) do nothing;
  return new;
end;
$$;

create trigger on_account_created
  after insert on public.accounts
  for each row execute function public.handle_new_account();

-- ────────────────────────────────────────────────────────────────────────────
-- Backfill: ensure every existing auth.users entry has an accounts row.
-- Safe on fresh deploys (no-op when auth.users is empty) and on existing
-- projects where the schema was applied after users had already signed in.
-- The on_account_created trigger above automatically creates entitlements
-- for each accounts row inserted here.
-- ────────────────────────────────────────────────────────────────────────────
insert into public.accounts (id, display_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', u.email)
from auth.users u
left join public.accounts a on a.id = u.id
where a.id is null
on conflict (id) do nothing;
