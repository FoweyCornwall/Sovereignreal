-- Phase 2 follow-up: sector index capped at 100 (was 500) with diminishing
-- returns as a sector approaches the cap, GDP_SCALE rescaled 5x to
-- compensate so overall pacing is unchanged, every policy tier further
-- rebalanced upward, store restock shortened to 15 minutes, and the
-- leaderboard now also returns country_code (for real flag images).

-- ---------------------------------------------------------------------------
-- gdp_per_sec: rescaled 1000 -> 5000 to compensate for the 500->100 sector
-- cap (5x smaller max raw score, so 5x the scale keeps GDP/sec pacing the
-- same as before this change for a fully-maxed, unmutated country).
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
  ), 0) * 5000
  from sector_state ss
  left join sector_mutations sm on sm.country_id = ss.country_id and sm.sector = ss.sector
  where ss.country_id = p_country_id;
$$;

-- ---------------------------------------------------------------------------
-- settle_country rewrite: sector score ceiling 500 -> 100, and positive
-- deltas now scale down the closer a sector already is to that ceiling
-- (effective_delta = raw_delta * (1 - current_score/100)) - every policy
-- provides progressively less value to sectors near the cap. Negative
-- deltas are unaffected (still hard-clamped at the floor).
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

  -- Passive mutation proc roll: once per sector per settle call, using the
  -- total elapsed span (not per-segment), at 0.05%/sec baseline.
  if v_total_elapsed > 0 then
    foreach v_sector in array array[
      'economy','social','safety','innovation','productivity',
      'infrastructure','environment','immigration','housing','culture'
    ]
    loop
      select coalesce(max(proc_multiplier), 1) into v_boost_multiplier
        from mutation_boosts
        where country_id = p_country_id and expires_at > now() and v_sector = any(target_sectors);

      v_proc_p := 1 - power(1 - 0.0005 * v_boost_multiplier, v_total_elapsed);

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

      -- Diminishing returns near the ceiling: a policy that would add 10
      -- points to a sector already at 80/100 only actually adds 10*(1-0.8)=2.
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
    v_country.treasury_regen_per_sec := 0.5 + 0.01 * v_country.gdp;
  end loop;

  -- Refresh the rate once more before the final segment, so a mutation that
  -- procced (but no policy completed) is still reflected going forward from
  -- "now", same treatment as a resolved policy.
  v_country.gdp_per_sec := compute_gdp_per_sec(p_country_id);

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
-- Every policy tier further rebalanced upward (on top of 0005's tier 4/5
-- bump). Tunable - another first-pass placeholder pending playtesting.
-- ---------------------------------------------------------------------------

update policy_library set base_cost = round(base_cost * 2) where tier in (1, 2, 3);
update policy_library set base_cost = round(base_cost * 1.7) where tier in (4, 5);

-- ---------------------------------------------------------------------------
-- Store restocks every 15 minutes now (was 20).
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
    update store_state set restock_at = now() + interval '900 seconds' where id = 1;
  end if;

  perform decay_store_slots();
end;
$$;

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
  update store_state set restock_at = now() + interval '900 seconds' where id = 1;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Leaderboard now also returns country_code, for real flag images client-side.
-- ---------------------------------------------------------------------------

drop function if exists get_leaderboard(int);

create or replace function get_leaderboard(p_limit int default 100)
returns table (
  country_id uuid, name text, username text, flag_emoji text, flag_style jsonb,
  country_code text, gdp numeric, rank bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform drift_bots_if_due();

  return query
    select c.id, c.name, c.username, c.flag_emoji, c.flag_style, c.country_code, c.gdp,
           row_number() over (order by c.gdp desc) as rank
    from countries c
    order by c.gdp desc
    limit p_limit;
end;
$$;

grant execute on function get_leaderboard(int) to authenticated;
