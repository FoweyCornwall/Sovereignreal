-- Phase 2: global shared policy store with scarcity/decay, replacing the
-- old stateless "redraw a hand of 5" mechanic. Also introduces stacking,
-- GDP-scaled pricing, and the 5-active-slot cap (shared with mutation
-- boosts, see 0006) on enactment.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table store_state (
  id smallint primary key default 1 check (id = 1),
  restock_at timestamptz not null
);
insert into store_state (id, restock_at) values (1, now());

create table store_slots (
  position smallint primary key,
  policy_id uuid not null references policy_library (id),
  quantity integer not null default 0,
  initial_quantity integer not null default 0,
  rolled_at timestamptz not null default now(),
  last_decay_at timestamptz not null default now()
);

alter table store_state enable row level security;
alter table store_slots enable row level security;

-- Genuinely global/public - no secrets here. No insert/update/delete policy
-- exists at all; every write goes through the security-definer functions
-- below, which bypass RLS as the table owner.
create policy "store_state public read" on store_state
  for select using (auth.role() = 'authenticated');
create policy "store_slots public read" on store_slots
  for select using (auth.role() = 'authenticated');

-- Created here (rather than in 0006_mutations.sql) because
-- enact_store_policy() below needs to count unexpired boosts toward the
-- shared 5-slot cap; 0006 adds the rest of the mutations schema and
-- populates/reads this table without recreating it.
create table mutation_boosts (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries (id) on delete cascade,
  target_sectors text[] not null,
  proc_multiplier numeric not null,
  expires_at timestamptz not null
);
create index mutation_boosts_country_idx on mutation_boosts (country_id, expires_at);

alter table mutation_boosts enable row level security;
create policy "own mutation_boosts rw" on mutation_boosts
  for all using (
    exists (select 1 from countries c where c.id = mutation_boosts.country_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from countries c where c.id = mutation_boosts.country_id and c.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Weighted tier pick (mirrors lib/game/constants.ts TIER_DRAW_WEIGHT: 45/27/16/8/4)
-- ---------------------------------------------------------------------------

create or replace function pick_weighted_tier()
returns smallint
language plpgsql
as $$
declare
  v_roll numeric := random() * 100;
begin
  if v_roll < 45 then return 1;
  elsif v_roll < 72 then return 2;
  elsif v_roll < 88 then return 3;
  elsif v_roll < 96 then return 4;
  else return 5;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reroll all 6 slots (mirrors lib/game/store.ts STORE_SLOT_COUNT/QUANTITY_RANGE)
-- ---------------------------------------------------------------------------

create or replace function reroll_store_slots()
returns void
language plpgsql
as $$
declare
  v_position smallint;
  v_tier smallint;
  v_policy_id uuid;
  v_min int;
  v_max int;
  v_qty int;
  v_chosen uuid[] := '{}';
begin
  for v_position in 1..6 loop
    v_tier := pick_weighted_tier();

    select id into v_policy_id
    from policy_library
    where tier = v_tier and is_active = true and not (id = any(v_chosen))
    order by random()
    limit 1;

    if v_policy_id is null then
      select id into v_policy_id
      from policy_library
      where is_active = true and not (id = any(v_chosen))
      order by random()
      limit 1;
    end if;

    v_chosen := v_chosen || v_policy_id;

    v_min := case v_tier when 1 then 40 when 2 then 20 when 3 then 10 when 4 then 4 else 1 end;
    v_max := case v_tier when 1 then 80 when 2 then 40 when 3 then 20 when 4 then 8 else 3 end;
    v_qty := v_min + floor(random() * (v_max - v_min + 1))::int;

    insert into store_slots (position, policy_id, quantity, initial_quantity, rolled_at, last_decay_at)
    values (v_position, v_policy_id, v_qty, v_qty, now(), now())
    on conflict (position) do update set
      policy_id = excluded.policy_id,
      quantity = excluded.quantity,
      initial_quantity = excluded.initial_quantity,
      rolled_at = excluded.rolled_at,
      last_decay_at = excluded.last_decay_at;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lazy, irregular stock decay - simulates other players buying even though
-- there currently aren't any. One Bernoulli trial per elapsed minute per
-- slot (bounded to 20, since a restock resets last_decay_at anyway).
-- ---------------------------------------------------------------------------

create or replace function decay_store_slots()
returns void
language plpgsql
as $$
declare
  v_slot record;
  v_minutes int;
  v_tick int;
  v_decay int;
begin
  for v_slot in select position, last_decay_at from store_slots loop
    v_minutes := least(20, floor(extract(epoch from (now() - v_slot.last_decay_at)) / 60)::int);
    if v_minutes <= 0 then
      continue;
    end if;

    v_decay := 0;
    for v_tick in 1..v_minutes loop
      if random() < 0.15 then
        v_decay := v_decay + 1 + floor(random() * 3)::int;
      end if;
    end loop;

    update store_slots
      set quantity = greatest(0, quantity - v_decay),
          last_decay_at = v_slot.last_decay_at + (v_minutes || ' minutes')::interval
      where position = v_slot.position;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- ensure_store_fresh(): the lazy-settle equivalent for the store. Locks
-- store_state so concurrent readers can't double-restock, rerolls if the
-- 20-minute window has elapsed, then always applies decay.
-- ---------------------------------------------------------------------------

create or replace function ensure_store_fresh()
returns void
language plpgsql
as $$
declare
  v_restock_at timestamptz;
begin
  select restock_at into v_restock_at from store_state where id = 1 for update;

  if v_restock_at <= now() then
    perform reroll_store_slots();
    update store_state set restock_at = now() + interval '1200 seconds' where id = 1;
  end if;

  perform decay_store_slots();
end;
$$;

-- ---------------------------------------------------------------------------
-- get_store(): the read path used by the Policies page. security definer
-- since ensure_store_fresh() may need to write store_state/store_slots,
-- which have no direct-write RLS policy for normal users.
-- ---------------------------------------------------------------------------

create or replace function get_store()
returns table (
  position smallint,
  policy_id uuid,
  title text,
  description text,
  tier smallint,
  primary_sector text,
  stat_deltas jsonb,
  base_cost numeric,
  duration_seconds integer,
  quantity integer,
  initial_quantity integer,
  restock_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform ensure_store_fresh();

  return query
    select
      ss.position, ss.policy_id, pl.title, pl.description, pl.tier, pl.primary_sector,
      pl.stat_deltas, pl.base_cost, pl.duration_seconds, ss.quantity, ss.initial_quantity,
      (select restock_at from store_state where id = 1)
    from store_slots ss
    join policy_library pl on pl.id = ss.policy_id
    order by ss.position;
end;
$$;

grant execute on function get_store() to authenticated;

-- ---------------------------------------------------------------------------
-- refresh_store(): manual re-roll, costs 5 credits.
-- ---------------------------------------------------------------------------

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
  select user_id, credits into v_owner, v_credits from countries where id = p_country_id for update;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  if v_credits < 5 then
    return jsonb_build_object('ok', false, 'reason', 'INSUFFICIENT_CREDITS', 'shortfall', 5 - v_credits);
  end if;

  update countries set credits = credits - 5 where id = p_country_id;
  perform reroll_store_slots();
  update store_state set restock_at = now() + interval '1200 seconds' where id = 1;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function refresh_store(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- enact_store_policy(): replaces enact_policy. security definer (writes the
-- shared store_slots table), so it must do its own auth.uid() ownership
-- check rather than relying on RLS.
-- ---------------------------------------------------------------------------

drop function if exists enact_policy(uuid, uuid);

create or replace function enact_store_policy(
  p_country_id uuid, p_position smallint, p_expected_policy_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_country countries%rowtype;
  v_slot store_slots%rowtype;
  v_policy policy_library%rowtype;
  v_active_count int;
  v_boost_count int;
  v_stack_n int;
  v_effective_cost numeric;
  v_stacked_deltas jsonb := '{}'::jsonb;
  v_key text;
  v_value numeric;
  v_active active_policies%rowtype;
begin
  select user_id into v_owner from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  perform settle_country(p_country_id);
  perform ensure_store_fresh();

  -- Regular policies and mutation boosts share one 5-slot cap.
  select count(*) into v_active_count from active_policies
    where country_id = p_country_id and not settled;
  select count(*) into v_boost_count from mutation_boosts
    where country_id = p_country_id and expires_at > now();
  if v_active_count + v_boost_count >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'QUEUE_FULL');
  end if;

  select * into v_slot from store_slots where position = p_position for update;
  if not found or v_slot.policy_id <> p_expected_policy_id then
    return jsonb_build_object('ok', false, 'reason', 'STALE_SLOT');
  end if;
  if v_slot.quantity <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'SOLD_OUT');
  end if;

  select * into v_policy from policy_library where id = v_slot.policy_id;

  -- Stack count: all-time enactments of this policy by this country
  -- (settled or not), so the effect is deterministic and never depends on
  -- what's currently in flight.
  select count(*) into v_stack_n from active_policies
    where country_id = p_country_id and policy_id = v_policy.id;

  for v_key, v_value in select key, value::numeric from jsonb_each_text(v_policy.stat_deltas) loop
    if v_value >= 0 then
      v_stacked_deltas := v_stacked_deltas || jsonb_build_object(v_key, round(v_value * power(0.9, v_stack_n), 3));
    else
      v_stacked_deltas := v_stacked_deltas || jsonb_build_object(v_key, round(v_value * power(1.1, v_stack_n), 3));
    end if;
  end loop;

  select * into v_country from countries where id = p_country_id for update;
  v_effective_cost := round(v_policy.base_cost * (1 + v_country.gdp / 1000000), 3);

  if v_country.treasury < v_effective_cost then
    return jsonb_build_object(
      'ok', false, 'reason', 'INSUFFICIENT_FUNDS', 'shortfall', v_effective_cost - v_country.treasury
    );
  end if;

  update countries set treasury = treasury - v_effective_cost where id = p_country_id;
  update store_slots set quantity = quantity - 1 where position = p_position;

  insert into active_policies (country_id, policy_id, tier, cost_paid, stat_deltas, started_at, completes_at)
  values (
    p_country_id, v_policy.id, v_policy.tier, v_effective_cost, v_stacked_deltas,
    now(), now() + (v_policy.duration_seconds || ' seconds')::interval
  )
  returning * into v_active;

  return jsonb_build_object('ok', true, 'active_policy', row_to_json(v_active));
end;
$$;

grant execute on function enact_store_policy(uuid, smallint, uuid) to authenticated;
