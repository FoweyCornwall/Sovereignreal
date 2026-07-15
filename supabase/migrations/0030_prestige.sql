-- Prestige / Ascension: late-game progression axis. Advanced players
-- asymptote at ~99 across all sectors (policies apply 1 - score/100
-- diminishing returns) and can only grow via passive mutation RNG. This
-- adds an active late-game reset loop: at Diamond+ (gdp >= 1e11) a player
-- can "ascend", zeroing all visible progress (sectors, mutations, GDP,
-- treasury, active policies) in exchange for permanent additive
-- multipliers to their base GDP/sec and mutation proc rate.
--
-- Bonus per ascension (locked-in default, easy to retune):
--   + 10% base GDP/sec (applied in compute_gdp_per_sec)
--   +  5% mutation proc rate (applied in settle_country's proc block)
-- Bonuses stack additively forever, so prestige 3 = +30% GDP / +15% proc.
-- Stored explicitly (not derived from count) so future rebalances of the
-- per-prestige amounts don't retroactively change existing players' bonuses.
--
-- Persists across ascension: credits, VIP status, country identity
-- (name/flag/username/theme), prestige counters themselves, and history
-- (gdp_history + settled active_policies rows) so the Stats page still
-- shows lifetime totals, not just current-life totals.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table countries
  add column if not exists prestige_count int not null default 0,
  add column if not exists prestige_gdp_bonus numeric not null default 0,
  add column if not exists prestige_mutation_bonus numeric not null default 0,
  add column if not exists last_ascended_at timestamptz;

-- ---------------------------------------------------------------------------
-- compute_gdp_per_sec: multiply the base result by (1 + prestige_gdp_bonus),
-- looked up inline from the country row. All existing call sites in
-- settle_country() keep working unchanged (same signature, same return).
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
  ), 0) * 5000 * (1 + coalesce(
    (select prestige_gdp_bonus from countries where id = p_country_id), 0
  ))
  from sector_state ss
  left join sector_mutations sm on sm.country_id = ss.country_id and sm.sector = ss.sector
  where ss.country_id = p_country_id;
$$;

-- ---------------------------------------------------------------------------
-- settle_country: identical to the 0017_vip.sql version, plus one new
-- factor - the base mutation proc rate is multiplied by
-- (1 + prestige_mutation_bonus). VIP's 1.5x multiplier still stacks on top
-- as before.
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
  v_prestige_proc_factor numeric;
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
  v_prestige_proc_factor := 1 + coalesce(v_country.prestige_mutation_bonus, 0);

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
        1 - 0.0005 * v_boost_multiplier * v_vip_multiplier * v_prestige_proc_factor,
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

-- ---------------------------------------------------------------------------
-- get_leaderboard: unchanged sort/filter (still Diamond+ floor from 0023),
-- just adds prestige_count to the returned columns. Note the return-table
-- shape changes, so drop-and-recreate (CREATE OR REPLACE can't change the
-- column list of a table-returning function).
-- ---------------------------------------------------------------------------

drop function if exists get_leaderboard(int);

create or replace function get_leaderboard(p_limit int default 100)
returns table (
  country_id uuid, name text, username text, flag_emoji text, flag_style jsonb,
  country_code text, gdp numeric, rank bigint, is_vip boolean, prestige_count int
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
           (coalesce(p.vip_expires_at > now(), false) or c.is_vip_bot) as is_vip,
           c.prestige_count
    from countries c
    left join profiles p on p.id = c.user_id
    where c.gdp >= 100000000000
      and (not c.is_bot or c.show_on_leaderboard)
    order by c.gdp desc
    limit p_limit;
end;
$$;

grant execute on function get_leaderboard(int) to authenticated;

-- ---------------------------------------------------------------------------
-- ascend_country: threshold check, wipe visible progress, increment
-- prestige counters, grant additive bonuses. Everything in one transaction
-- (security definer + row lock on countries). No mutation of profiles,
-- credits, VIP, identity, or history tables.
-- ---------------------------------------------------------------------------

create or replace function ascend_country(p_country_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_country countries%rowtype;
  v_owner uuid;
begin
  select user_id into v_owner from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select * into v_country from countries where id = p_country_id for update;

  if v_country.gdp < 100000000000 then
    return jsonb_build_object(
      'ok', false, 'reason', 'NOT_ELIGIBLE',
      'requiredGdp', 100000000000, 'currentGdp', v_country.gdp
    );
  end if;

  delete from active_policies where country_id = p_country_id;
  delete from sector_mutations where country_id = p_country_id;
  delete from mutation_boosts where country_id = p_country_id;

  update sector_state
    set score = 0, previous_score = 0, updated_at = now()
    where country_id = p_country_id;

  update countries set
    gdp = 0,
    gdp_per_sec = 0,
    treasury = 1000,
    treasury_regen_per_sec = 0.5,
    last_settled_at = now(),
    prestige_count = prestige_count + 1,
    prestige_gdp_bonus = prestige_gdp_bonus + 0.10,
    prestige_mutation_bonus = prestige_mutation_bonus + 0.05,
    last_ascended_at = now()
  where id = p_country_id;

  select * into v_country from countries where id = p_country_id;

  return jsonb_build_object(
    'ok', true,
    'prestigeCount', v_country.prestige_count,
    'prestigeGdpBonus', v_country.prestige_gdp_bonus,
    'prestigeMutationBonus', v_country.prestige_mutation_bonus
  );
end;
$$;

grant execute on function ascend_country(uuid) to authenticated;
