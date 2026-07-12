-- Direct user ask: raise the active-policy/mutation-boost queue cap from 5
-- to 7. VIP's cap was a separately hardcoded 10 (not derived as 2x base) -
-- kept as a flat 2x here too, so it becomes 14. Both enact_store_policy()
-- and enact_mutation_item() are otherwise byte-for-byte identical to their
-- current bodies in 0017_vip.sql; only the v_queue_cap literals change.

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

  v_queue_cap := case when is_vip(v_owner) then 14 else 7 end;

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

  v_queue_cap := case when is_vip(v_owner) then 14 else 7 end;

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
