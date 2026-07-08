-- Move credits from `countries` to `profiles` so real-money purchases
-- survive Delete & Restart Country (they now belong to the user, not the
-- specific in-flight country row). Also lifts the bot GDP hard cap so
-- bots can climb into any rank tier (including past Platinum), matching
-- the removal of that restriction on the app side.

-- --------------------------------------------------------------------------
-- 1. profiles.credits (moved from countries.credits)
-- --------------------------------------------------------------------------

alter table profiles add column if not exists credits integer not null default 20 check (credits >= 0);

-- Migrate any existing balance forward. Countries without an owner (bots)
-- are skipped naturally by the join.
update profiles p
  set credits = greatest(profiles.credits, coalesce(c.credits, 0))
  from countries c
  where c.user_id = p.id;

alter table countries drop column if exists credits;

-- --------------------------------------------------------------------------
-- 2. refresh_store() now debits credits from profiles (not countries)
-- --------------------------------------------------------------------------

create or replace function refresh_store(p_country_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_credits int;
begin
  select user_id into v_owner from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select credits into v_credits from profiles where id = v_owner for update;

  if v_credits < 5 then
    return jsonb_build_object('ok', false, 'reason', 'INSUFFICIENT_CREDITS', 'shortfall', 5 - v_credits);
  end if;

  update profiles set credits = credits - 5 where id = v_owner;
  perform reroll_store_slots();
  update store_state set restock_at = now() + interval '900 seconds' where id = 1;

  return jsonb_build_object('ok', true);
end;
$$;

-- --------------------------------------------------------------------------
-- 3. Rewritten handle_new_user() so signup metadata's initial credits (if
--    any) land on the correct table. Keeps username handling unchanged.
-- --------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into profiles (id, username, credits)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), null),
    20
  );
  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- 4. Remove the bot GDP hard cap - bots can now progress into any tier.
-- --------------------------------------------------------------------------

create or replace function drift_bots_if_due()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_last timestamptz;
  v_elapsed numeric;
begin
  select last_drift_at into v_last from bot_drift_state where id = 1 for update;
  v_elapsed := extract(epoch from (now() - v_last));

  if v_elapsed < 60 then
    return;
  end if;

  -- No ceiling. Small additive term keeps zero-GDP bots climbing too.
  update countries
    set gdp = gdp * (1 + random() * 0.002 * (v_elapsed / 60))
              + random() * 500 * (v_elapsed / 60)
  where is_bot = true;

  update bot_drift_state set last_drift_at = now() where id = 1;
end;
$$;
