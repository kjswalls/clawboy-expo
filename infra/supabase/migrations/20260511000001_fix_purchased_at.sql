-- Fix grant_cosmetics_for_entitlement: removes reference to non-existent
-- purchased_at column on entitlements table.  Uses now() as the snapshot
-- time for pro-tier cosmetic eligibility.
--
-- The entitlements table schema (account_id, tier, source, expires_at,
-- updated_at) has no purchased_at column.  The reference introduced in
-- wave3_remediation caused `ERROR: record "new" has no field "purchased_at"`
-- whenever the trigger fired on a pro-tier upgrade.
--
-- Fix: replace `coalesce(new.purchased_at, now())` with `now()`.  Using
-- now() as the snapshot time is correct — it captures the instant the
-- entitlement row is written, which is the moment the purchase is recorded.

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
      and c.released_at <= now()
    on conflict (account_id, pack_id) do nothing;
  end if;

  return new;
end;
$$;
