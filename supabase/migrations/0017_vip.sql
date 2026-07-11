-- VIP subscription: $7.99/mo via Stripe Subscription. Perks: faster daily
-- reward, 2x active-policy queue cap, personal 5-min free store reroll,
-- 1.5x mutation proc chance, VIP badge + gold outline on leaderboard,
-- priority PvP matchmaking (wired in 0018_pvp.sql).

alter table profiles add column if not exists vip_expires_at timestamptz;
alter table profiles add column if not exists stripe_customer_id text;
alter table profiles add column if not exists stripe_subscription_id text;
alter table profiles add column if not exists last_free_restock_at timestamptz;

-- Bots have no auth.users row (user_id is null), so they can't have a real
-- profiles row or a real Stripe subscription. This is a display-only flag
-- (some bots should show the VIP tag/gold outline for atmosphere) - it
-- grants no actual perk since bots never touch the daily-reward/queue-cap/
-- restock/mutation-proc/PvP-matchmaking systems that VIP actually affects.
alter table countries add column if not exists is_vip_bot boolean not null default false;

create or replace function is_vip(p_user_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select vip_expires_at > now() from profiles where id = p_user_id),
    false
  );
$$;

-- --------------------------------------------------------------------------
-- Queue cap: 10 for VIP, 5 otherwise. Both enact_store_policy() and
-- enact_mutation_item() share this cap - rewritten identically.
-- --------------------------------------------------------------------------

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
  v_queue_cap int;
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

  v_queue_cap := case when is_vip(v_owner) then 10 else 5 end;

  select count(*) into v_active_count from active_policies
    where country_id = p_country_id and not settled;
  select count(*) into v_boost_count from mutation_boosts
    where country_id = p_country_id and expires_at > now();
  if v_active_count + v_boost_count >= v_queue_cap then
    return jsonb_build_object('ok', false, 'reason', 'QUEUE_FULL');
  end if;

  select * into v_slot from store_slots where slot_position = p_position for update;
  if not found or v_slot.policy_id <> p_expected_policy_id then
    return jsonb_build_object('ok', false, 'reason', 'STALE_SLOT');
  end if;
  if v_slot.quantity <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'SOLD_OUT');
  end if;

  select * into v_policy from policy_library where id = v_slot.policy_id;

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
  update store_slots set quantity = quantity - 1 where slot_position = p_position;

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

create or replace function enact_mutation_item(p_country_id uuid, p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_country countries%rowtype;
  v_item mutation_item_library%rowtype;
  v_active_count int;
  v_boost_count int;
  v_queue_cap int;
  v_effective_cost numeric;
begin
  select user_id into v_owner from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  perform settle_country(p_country_id);

  v_queue_cap := case when is_vip(v_owner) then 10 else 5 end;

  select count(*) into v_active_count from active_policies
    where country_id = p_country_id and not settled;
  select count(*) into v_boost_count from mutation_boosts
    where country_id = p_country_id and expires_at > now();
  if v_active_count + v_boost_count >= v_queue_cap then
    return jsonb_build_object('ok', false, 'reason', 'QUEUE_FULL');
  end if;

  select * into v_item from mutation_item_library where id = p_item_id and is_active = true;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ITEM_NOT_FOUND');
  end if;

  select * into v_country from countries where id = p_country_id for update;
  v_effective_cost := round(v_item.base_cost * (1 + v_country.gdp / 1000000), 3);

  if v_country.treasury < v_effective_cost then
    return jsonb_build_object(
      'ok', false, 'reason', 'INSUFFICIENT_FUNDS', 'shortfall', v_effective_cost - v_country.treasury
    );
  end if;

  update countries set treasury = treasury - v_effective_cost where id = p_country_id;

  insert into mutation_boosts (country_id, target_sectors, proc_multiplier, expires_at)
  values (p_country_id, v_item.target_sectors, v_item.proc_multiplier, now() + (v_item.duration_seconds || ' seconds')::interval);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function enact_mutation_item(uuid, uuid) to authenticated;

-- --------------------------------------------------------------------------
-- settle_country(): 1.5x mutation proc chance for VIP.
-- --------------------------------------------------------------------------

create or replace function settle_country(p_country_id uuid)
returns countries
language plpgsql
as $$
declare
  v_country countries%rowtype;
  v_cursor_time timestamptz;
  v_policy record;
  v_segment_seconds numeric;
  v_resolved_any boolean := false;
  v_delta_row record;
  v_delta numeric;
  v_max_delta numeric;
  v_current_score numeric;
  v_total_elapsed numeric;
  v_sector text;
  v_boost_multiplier numeric;
  v_vip_multiplier numeric;
  v_proc_p numeric;
  v_rarity_roll numeric;
  v_new_rarity text;
  v_new_multiplier numeric;
  v_existing_multiplier numeric;
begin
  select * into v_country from countries where id = p_country_id for update;
  if not found then
    raise exception 'country not found';
  end if;

  v_cursor_time := v_country.last_settled_at;
  v_total_elapsed := extract(epoch from (now() - v_country.last_settled_at));
  v_vip_multiplier := case when is_vip(v_country.user_id) then 1.5 else 1 end;

  if v_total_elapsed > 0 then
    foreach v_sector in array array[
      'economy','social','safety','innovation','productivity',
      'infrastructure','environment','immigration','housing','culture'
    ]
    loop
      select coalesce(max(proc_multiplier), 1) into v_boost_multiplier
        from mutation_boosts
        where country_id = p_country_id and expires_at > now() and v_sector = any(target_sectors);

      v_proc_p := 1 - power(1 - 0.0005 * v_boost_multiplier * v_vip_multiplier, v_total_elapsed);

      if random() < v_proc_p then
        v_rarity_roll := random() * 100;
        if v_rarity_roll < 45 then v_new_rarity := 'uncommon'; v_new_multiplier := 2;
        elsif v_rarity_roll < 78 then v_new_rarity := 'rare'; v_new_multiplier := 3;
        elsif v_rarity_roll < 93 then v_new_rarity := 'epic'; v_new_multiplier := 5;
        elsif v_rarity_roll < 98.5 then v_new_rarity := 'legendary'; v_new_multiplier := 10;
        elsif v_rarity_roll < 99.5 then v_new_rarity := 'mythic'; v_new_multiplier := 30;
        elsif v_rarity_roll < 99.9 then v_new_rarity := 'exotic'; v_new_multiplier := 50;
        else v_new_rarity := 'eternal'; v_new_multiplier := 100;
        end if;

        select multiplier into v_existing_multiplier
          from sector_mutations where country_id = p_country_id and sector = v_sector;

        if v_existing_multiplier is null or v_new_multiplier > v_existing_multiplier then
          insert into sector_mutations (country_id, sector, rarity, multiplier, acquired_at)
          values (p_country_id, v_sector, v_new_rarity, v_new_multiplier, now())
          on conflict (country_id, sector) do update set
            rarity = excluded.rarity, multiplier = excluded.multiplier, acquired_at = excluded.acquired_at;
        end if;
      end if;
    end loop;
  end if;

  for v_policy in
    select * from active_policies
    where country_id = p_country_id and not settled and completes_at <= now()
    order by completes_at asc
  loop
    v_segment_seconds := extract(epoch from (v_policy.completes_at - v_cursor_time));
    if v_segment_seconds > 0 then
      v_country.gdp := v_country.gdp + v_country.gdp_per_sec * v_segment_seconds;
      v_country.treasury := v_country.treasury + v_country.treasury_regen_per_sec * v_segment_seconds;
    end if;

    v_max_delta := case v_policy.tier
      when 1 then 8 when 2 then 14 when 3 then 20 when 4 then 30 else 40
    end;

    for v_delta_row in
      select key as sector, value::numeric as delta from jsonb_each_text(v_policy.stat_deltas)
    loop
      v_delta := greatest(least(v_delta_row.delta, v_max_delta), -v_max_delta);

      select score into v_current_score from sector_state
        where country_id = p_country_id and sector = v_delta_row.sector;

      if v_delta > 0 then
        v_delta := v_delta * (1 - v_current_score / 100.0);
      end if;

      update sector_state
        set score = greatest(least(v_current_score + v_delta, 100), 0),
            updated_at = now()
        where country_id = p_country_id and sector = v_delta_row.sector;
    end loop;

    update active_policies set settled = true, settled_at = now() where id = v_policy.id;

    v_resolved_any := true;
    v_cursor_time := v_policy.completes_at;

    v_country.gdp_per_sec := compute_gdp_per_sec(p_country_id);
    v_country.treasury_regen_per_sec := 0.5 + 0.5 * v_country.gdp_per_sec;
  end loop;

  v_country.gdp_per_sec := compute_gdp_per_sec(p_country_id);
  v_country.treasury_regen_per_sec := 0.5 + 0.5 * v_country.gdp_per_sec;

  v_segment_seconds := extract(epoch from (now() - v_cursor_time));
  if v_segment_seconds > 0 then
    v_country.gdp := v_country.gdp + v_country.gdp_per_sec * v_segment_seconds;
    v_country.treasury := v_country.treasury + v_country.treasury_regen_per_sec * v_segment_seconds;
  end if;

  if v_country.treasury > v_country.gdp then
    v_country.treasury := v_country.gdp;
  end if;

  if v_resolved_any then
    insert into gdp_history (country_id, gdp) values (p_country_id, v_country.gdp);
    update sector_state set previous_score = score where country_id = p_country_id;
  end if;

  v_country.last_settled_at := now();

  update countries set
    gdp = v_country.gdp,
    gdp_per_sec = v_country.gdp_per_sec,
    treasury = v_country.treasury,
    treasury_regen_per_sec = v_country.treasury_regen_per_sec,
    last_settled_at = v_country.last_settled_at
  where id = p_country_id;

  return v_country;
end;
$$;

-- --------------------------------------------------------------------------
-- Daily reward: +15 for VIP, +5 otherwise.
-- --------------------------------------------------------------------------

create or replace function claim_daily_reward()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_last timestamptz;
  v_today date := (now() at time zone 'UTC')::date;
  v_amount int;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select last_daily_claim_at into v_last from profiles where id = v_user for update;

  if v_last is not null and (v_last at time zone 'UTC')::date >= v_today then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_CLAIMED');
  end if;

  v_amount := case when is_vip(v_user) then 15 else 5 end;

  update profiles
    set credits = credits + v_amount,
        last_daily_claim_at = now()
    where id = v_user;

  return jsonb_build_object('ok', true, 'credits_granted', v_amount);
end;
$$;

grant execute on function claim_daily_reward() to authenticated;

-- --------------------------------------------------------------------------
-- VIP personal free store reroll: once per 5 minutes, no credit cost. Only
-- rerolls the shared store for everyone (same reroll_store_slots() the
-- 5-credit refresh_store() uses) - VIP's perk is not paying + a much
-- shorter personal cooldown, not a separate private store.
-- --------------------------------------------------------------------------

create or replace function claim_vip_free_restock(p_country_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_last timestamptz;
begin
  select user_id into v_owner from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  if not is_vip(v_owner) then
    return jsonb_build_object('ok', false, 'reason', 'NOT_VIP');
  end if;

  select last_free_restock_at into v_last from profiles where id = v_owner for update;

  if v_last is not null and v_last > now() - interval '5 minutes' then
    return jsonb_build_object(
      'ok', false, 'reason', 'ON_COOLDOWN',
      'retry_at', v_last + interval '5 minutes'
    );
  end if;

  perform reroll_store_slots();
  update store_state set restock_at = now() + interval '900 seconds' where id = 1;
  update profiles set last_free_restock_at = now() where id = v_owner;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function claim_vip_free_restock(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- Leaderboard: add is_vip so the UI can show the badge + gold outline.
-- --------------------------------------------------------------------------

drop function if exists get_leaderboard(int);

create or replace function get_leaderboard(p_limit int default 100)
returns table (
  country_id uuid, name text, username text, flag_emoji text, flag_style jsonb,
  country_code text, gdp numeric, rank bigint, is_vip boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform drift_bots_if_due();

  return query
    select c.id, c.name, c.username, c.flag_emoji, c.flag_style, c.country_code, c.gdp,
           row_number() over (order by c.gdp desc) as rank,
           (coalesce(p.vip_expires_at > now(), false) or c.is_vip_bot) as is_vip
    from countries c
    left join profiles p on p.id = c.user_id
    order by c.gdp desc
    limit p_limit;
end;
$$;

grant execute on function get_leaderboard(int) to authenticated;
