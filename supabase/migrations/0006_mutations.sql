-- Phase 2: full mutations system - 10 independent per-sector mutation
-- slots, 7 rarities, a passive proc chance evaluated lazily inside
-- settle_country, and a Mutation Shop selling temporary proc-chance boosts.
-- (mutation_boosts itself was created in 0004_policy_store.sql so the
-- store's enactment cap check could reference it - not recreated here.)

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table sector_mutations (
  country_id uuid not null references countries (id) on delete cascade,
  sector text not null check (
    sector in (
      'economy', 'social', 'safety', 'innovation', 'productivity',
      'infrastructure', 'environment', 'immigration', 'housing', 'culture'
    )
  ),
  rarity text not null check (
    rarity in ('uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'eternal')
  ),
  multiplier numeric(6, 2) not null,
  acquired_at timestamptz not null default now(),
  primary key (country_id, sector)
);

alter table sector_mutations enable row level security;
create policy "own sector_mutations rw" on sector_mutations
  for all using (
    exists (select 1 from countries c where c.id = sector_mutations.country_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from countries c where c.id = sector_mutations.country_id and c.user_id = auth.uid())
  );

create table mutation_item_library (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  title text not null,
  description text,
  target_sectors text[] not null,
  proc_multiplier numeric not null,
  duration_seconds integer not null,
  base_cost numeric not null,
  is_active boolean not null default true
);

alter table mutation_item_library enable row level security;
create policy "mutation_item_library public read" on mutation_item_library
  for select using (true);

insert into mutation_item_library (key, title, description, target_sectors, proc_multiplier, duration_seconds, base_cost) values
('subatomic_research_grant', 'Subatomic Research Grant', 'Locks in frontier research funding, tripling mutation odds on Innovation, Economy, and Productivity for 2 hours.', array['innovation','economy','productivity'], 3, 7200, 20000),
('green_catalyst_program', 'Green Catalyst Program', 'A concentrated clean-tech push, quadrupling Environment mutation odds for 3 hours.', array['environment'], 4, 10800, 15000),
('cultural_renaissance_fund', 'Cultural Renaissance Fund', 'State patronage of the arts, tripling Culture and Social mutation odds for 2 hours.', array['culture','social'], 3, 7200, 16000),
('urban_development_accelerator', 'Urban Development Accelerator', 'Fast-tracked permitting, tripling Infrastructure and Housing mutation odds for 2.5 hours.', array['infrastructure','housing'], 3, 9000, 18000),
('national_security_initiative', 'National Security Initiative', 'A surge in security spending, tripling Safety and Immigration mutation odds for 2 hours.', array['safety','immigration'], 3, 7200, 17000);

-- ---------------------------------------------------------------------------
-- gdp_per_sec, factoring in per-sector mutation multipliers (default 1).
-- Shared by settle_country's mid-loop and final recomputes.
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
  ), 0) * 1000
  from sector_state ss
  left join sector_mutations sm on sm.country_id = ss.country_id and sm.sector = ss.sector
  where ss.country_id = p_country_id;
$$;

-- ---------------------------------------------------------------------------
-- settle_country rewrite: adds a mutation proc/roll pass right after the
-- row lock (using total elapsed time, once per sector, per the spec), and
-- fixes a latent gap where gdp_per_sec only ever recomputed inside the
-- policy-resolution loop - a settle call where a mutation procs but zero
-- policies complete would otherwise leave it stale.
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
      update sector_state
        set score = greatest(least(score + v_delta, 500), 0),
            updated_at = now()
        where country_id = p_country_id and sector = v_delta_row.sector;
    end loop;

    update active_policies set settled = true, settled_at = now() where id = v_policy.id;

    v_resolved_any := true;
    v_cursor_time := v_policy.completes_at;

    v_country.gdp_per_sec := compute_gdp_per_sec(p_country_id);
    v_country.treasury_regen_per_sec := 0.5 + 0.01 * v_country.gdp;
  end loop;

  -- Closes the gap noted above: refresh the rate once more before the final
  -- segment, so a mutation that procced (but no policy completed) is still
  -- reflected going forward from "now", same treatment as a resolved policy.
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
-- enact_mutation_item(): Mutation Shop purchase. Shares the 5-slot cap with
-- regular policies (per the locked product decision).
-- ---------------------------------------------------------------------------

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
  v_effective_cost numeric;
begin
  select user_id into v_owner from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  perform settle_country(p_country_id);

  select count(*) into v_active_count from active_policies
    where country_id = p_country_id and not settled;
  select count(*) into v_boost_count from mutation_boosts
    where country_id = p_country_id and expires_at > now();
  if v_active_count + v_boost_count >= 5 then
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
