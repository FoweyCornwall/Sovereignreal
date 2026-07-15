-- Batched: Tier 5 base_cost cut in half (still felt like a wall despite
-- 0028's -30%), Prestige/Ascension reshaped to "Rebirths" with stronger
-- bonuses (+50% GDP, +50% treasury regen per rebirth), replacing the
-- +10% GDP / +5% mutation-proc bonus that shipped in 0030.
--
-- Existing prestiged players get their bonuses retroactively bumped to
-- the new +50%/+50% schedule (rather than being stuck on the old inferior
-- values). One-time conversion via a plain UPDATE.
--
-- The user-facing rename ("Ascension" -> "Rebirths") is UI-only. SQL
-- identifiers keep ascend_country/last_ascended_at names to avoid a
-- pointless drop-and-recreate churn - players never see them.

-- ---------------------------------------------------------------------------
-- 1. T5 policy cost -50%
-- ---------------------------------------------------------------------------

update policy_library set base_cost = round(base_cost * 0.5) where tier = 5;

-- ---------------------------------------------------------------------------
-- 2. Column rename: prestige_mutation_bonus -> prestige_treasury_bonus.
-- Semantics change from "% mutation proc rate" to "% treasury regen".
-- Same numeric type, same default, same +/- storage - only the meaning
-- (and the function that reads it) change.
-- ---------------------------------------------------------------------------

alter table countries rename column prestige_mutation_bonus to prestige_treasury_bonus;

-- ---------------------------------------------------------------------------
-- 3. Retroactive conversion. Anyone with prestige_count > 0 previously
-- got +10% GDP and +5% mutation per level; bump them to +50%/+50%.
-- Safe no-op for prestige_count = 0.
-- ---------------------------------------------------------------------------

update countries
  set prestige_gdp_bonus = prestige_count * 0.50,
      prestige_treasury_bonus = prestige_count * 0.50;

-- ---------------------------------------------------------------------------
-- 4. ascend_country: grant +0.50 to both bonuses per call (was 0.10 and 0.05).
-- Everything else about the reset is identical to 0030.
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
    prestige_gdp_bonus = prestige_gdp_bonus + 0.50,
    prestige_treasury_bonus = prestige_treasury_bonus + 0.50,
    last_ascended_at = now()
  where id = p_country_id;

  select * into v_country from countries where id = p_country_id;

  return jsonb_build_object(
    'ok', true,
    'prestigeCount', v_country.prestige_count,
    'prestigeGdpBonus', v_country.prestige_gdp_bonus,
    'prestigeTreasuryBonus', v_country.prestige_treasury_bonus
  );
end;
$$;

grant execute on function ascend_country(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. settle_country: remove the mutation-proc prestige factor (mutation
-- bonus is gone), add a treasury regen multiplier of
-- (1 + prestige_treasury_bonus). Everything else identical to 0030.
-- compute_gdp_per_sec is untouched - prestige_gdp_bonus semantics are
-- unchanged, only the per-level increment size changed.
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
    v_country.treasury_regen_per_sec := (0.5 + 0.5 * v_country.gdp_per_sec) * v_prestige_treasury_factor;
  end loop;

  v_country.gdp_per_sec := compute_gdp_per_sec(p_country_id);
  v_country.treasury_regen_per_sec := (0.5 + 0.5 * v_country.gdp_per_sec) * v_prestige_treasury_factor;

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
