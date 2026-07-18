-- Seven changes in one migration:
--   1. settle_country: uncap sector scores (no more <=100 clamp), remove
--      the 1 - score/100 diminishing-returns factor, bump per-tier caps
--      to T4=200 / T5=400, and change treasury regen to strictly
--      gdp_per_sec / 2 (drop the +0.5 base and the mixed +0.5 * gdp/sec).
--   2. compute_gdp_per_sec: 5000 -> 500 multiplier. Sectors now grow
--      unbounded, so we need to divide GDP_SCALE by roughly the ratio of
--      the new organic sector-score range to the old 100 cap. 500 was
--      chosen to keep the climb to Diamond/Master/Transcendent feeling
--      roughly the same as today.
--   3. enact_store_policy: rip out the 0.9^N / 1.1^N stacking penalty -
--      each enact of the same policy now applies its full stat_deltas.
--   4. Bump seed policy_library T4/T5 stat_deltas so the seeded content
--      actually uses the new headroom (T5 * 10, T4 * 7). Existing rows
--      are updated in place; the seed file itself stays untouched.
--   5. reroll_store_slots: 1..6 -> 1..8 so the store shows 8 slots on
--      the next restock.
--   6. New RPC skip_all_policies(p_country_id) -> jsonb: charges 15
--      credits, sets completes_at = now() on every unsettled policy for
--      that country, and the next settle_country call resolves them
--      through the existing machinery. NOTHING_TO_SKIP if empty queue,
--      INSUFFICIENT_CREDITS if under 15.
--   7. (No treasury_regen field on countries table changes; the value is
--      recomputed inside settle_country per the new rule.)

-- ---------------------------------------------------------------------------
-- 1. compute_gdp_per_sec: 5000 -> 500
-- ---------------------------------------------------------------------------

create or replace function compute_gdp_per_sec(p_country_id uuid)
returns numeric
language sql
as $$
  select coalesce(sum(
    ss.score * (case ss.sector
      when 'economy' then 0.20 when 'productivity' then 0.15
      when 'innovation' then 0.12 when 'infrastructure' then 0.12
      when 'social' then 0.09 when 'safety' then 0.08
      when 'environment' then 0.08 when 'housing' then 0.06
      when 'immigration' then 0.05 when 'culture' then 0.05
    end) * coalesce(sm.multiplier, 1)
  ), 0) * 500 * (1 + coalesce(
    (select prestige_gdp_bonus from countries where id = p_country_id), 0
  ))
  from sector_state ss
  left join sector_mutations sm on sm.country_id = ss.country_id and sm.sector = ss.sector
  where ss.country_id = p_country_id;
$$;

-- ---------------------------------------------------------------------------
-- 2. settle_country: uncap sectors, no diminishing returns, bigger T4/T5
-- caps, treasury regen strictly = gdp/2. Otherwise identical to 0032.
-- ---------------------------------------------------------------------------

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
  v_prestige_treasury_factor numeric;
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
  v_prestige_treasury_factor := 1 + coalesce(v_country.prestige_treasury_bonus, 0);

  if v_total_elapsed > 0 then
    foreach v_sector in array array[
      'economy','social','safety','innovation','productivity',
      'infrastructure','environment','immigration','housing','culture'
    ]
    loop
      select coalesce(max(proc_multiplier), 1) into v_boost_multiplier
        from mutation_boosts
        where country_id = p_country_id and expires_at > now() and v_sector = any(target_sectors);

      v_proc_p := 1 - power(
        1 - 0.0005 * v_boost_multiplier * v_vip_multiplier,
        v_total_elapsed
      );

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
      when 1 then 8 when 2 then 14 when 3 then 20 when 4 then 200 else 400
    end;

    for v_delta_row in
      select key as sector, value::numeric as delta from jsonb_each_text(v_policy.stat_deltas)
    loop
      v_delta := greatest(least(v_delta_row.delta, v_max_delta), -v_max_delta);

      select score into v_current_score from sector_state
        where country_id = p_country_id and sector = v_delta_row.sector;

      -- No 1 - score/100 diminishing factor anymore. Every enact
      -- applies its full (tier-clamped) delta.

      update sector_state
        set score = greatest(v_current_score + v_delta, 0),
            updated_at = now()
        where country_id = p_country_id and sector = v_delta_row.sector;
    end loop;

    update active_policies set settled = true, settled_at = now() where id = v_policy.id;

    v_resolved_any := true;
    v_cursor_time := v_policy.completes_at;

    v_country.gdp_per_sec := compute_gdp_per_sec(p_country_id);
    v_country.treasury_regen_per_sec := (v_country.gdp_per_sec / 2) * v_prestige_treasury_factor;
  end loop;

  v_country.gdp_per_sec := compute_gdp_per_sec(p_country_id);
  v_country.treasury_regen_per_sec := (v_country.gdp_per_sec / 2) * v_prestige_treasury_factor;

  v_segment_seconds := extract(epoch from (now() - v_cursor_time));
  if v_segment_seconds > 0 then
    v_country.gdp := v_country.gdp + v_country.gdp_per_sec * v_segment_seconds;
    v_country.treasury := v_country.treasury + v_country.treasury_regen_per_sec * v_segment_seconds;
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

-- ---------------------------------------------------------------------------
-- 3. enact_store_policy: no stacking penalty. Snapshot stat_deltas
-- verbatim into active_policies. Byte-for-byte identical to 0025
-- otherwise (VIP-14 / non-VIP-7 queue cap preserved, cost scaling
-- preserved, race checks preserved).
-- ---------------------------------------------------------------------------

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
  v_effective_cost numeric;
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
    p_country_id, v_policy.id, v_policy.tier, v_effective_cost, v_policy.stat_deltas,
    now(), now() + (v_policy.duration_seconds || ' seconds')::interval
  )
  returning * into v_active;

  return jsonb_build_object('ok', true, 'active_policy', row_to_json(v_active));
end;
$$;

grant execute on function enact_store_policy(uuid, smallint, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Bump T4/T5 seed policy stat_deltas so the seed actually uses the
-- new headroom, not just the raised cap.
-- ---------------------------------------------------------------------------

update policy_library set stat_deltas = (
  select jsonb_object_agg(k, to_jsonb((v::numeric * 7)::int))
  from jsonb_each_text(stat_deltas) as t(k, v)
) where tier = 4;

update policy_library set stat_deltas = (
  select jsonb_object_agg(k, to_jsonb((v::numeric * 10)::int))
  from jsonb_each_text(stat_deltas) as t(k, v)
) where tier = 5;

-- ---------------------------------------------------------------------------
-- 5. reroll_store_slots: 1..6 -> 1..8. Preserves 0013's cost/stock
-- rebalance quantity ranges.
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
  for v_position in 1..8 loop
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

    v_min := case v_tier when 1 then 2000 when 2 then 1000 when 3 then 400 when 4 then 100 else 30 end;
    v_max := case v_tier when 1 then 5000 when 2 then 2500 when 3 then 1000 when 4 then 300 else 100 end;
    v_qty := v_min + floor(random() * (v_max - v_min + 1))::int;

    insert into store_slots (slot_position, policy_id, quantity, initial_quantity, rolled_at, last_decay_at)
    values (v_position, v_policy_id, v_qty, v_qty, now(), now())
    on conflict (slot_position) do update set
      policy_id = excluded.policy_id,
      quantity = excluded.quantity,
      initial_quantity = excluded.initial_quantity,
      rolled_at = excluded.rolled_at,
      last_decay_at = excluded.last_decay_at;
  end loop;
end;
$$;

-- Force an immediate reroll so slots 6 and 7 exist right away (otherwise
-- players stare at a 6-slot store until the next 15-min restock).
select reroll_store_slots();

-- ---------------------------------------------------------------------------
-- 6. skip_all_policies: bulk-skip. 15 credits fast-forwards every
-- currently-unsettled policy. Empty queue -> nothing to skip, no charge.
-- ---------------------------------------------------------------------------

create or replace function skip_all_policies(p_country_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_credits int;
  v_count int;
begin
  select user_id into v_owner from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select count(*) into v_count from active_policies
    where country_id = p_country_id and not settled;
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'reason', 'NOTHING_TO_SKIP');
  end if;

  select credits into v_credits from profiles where id = v_owner for update;
  if coalesce(v_credits, 0) < 15 then
    return jsonb_build_object(
      'ok', false, 'reason', 'INSUFFICIENT_CREDITS',
      'shortfall', 15 - coalesce(v_credits, 0)
    );
  end if;

  update profiles set credits = credits - 15 where id = v_owner;
  update active_policies set completes_at = now()
    where country_id = p_country_id and not settled;

  return jsonb_build_object('ok', true, 'skipped', v_count);
end;
$$;

grant execute on function skip_all_policies(uuid) to authenticated;
