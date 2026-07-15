-- Batched: (1) removes settle_country's "snap treasury down to gdp"
-- clause, which was a one-time 0015 legacy migration fix that has now
-- become a bug for rebirthed players (treasury 1000, gdp 0 -> snap to 0
-- on the very next page load), and (2) adds a Daily Quests system so
-- players have a small daily-retention hook of concrete tasks + credit
-- rewards.
--
-- Rebirth bug fix is a pure delete of ~3 lines from settle_country's
-- final segment - nothing else about settle_country changes.
--
-- Quests are per-country-per-UTC-day, 3 per day, hardcoded pool.
-- Progress is computed lazily on every dashboard load from existing base
-- tables (active_policies settled today, pvp_matches won today, gdp -
-- baseline_snapshot) - no need to modify enact_store_policy or
-- pvp_finalize_match to write anywhere new. Claim RPC is separate so a
-- completed quest sits waiting until the player clicks Claim (dopamine).

-- ---------------------------------------------------------------------------
-- 1. settle_country: remove the treasury snap-down. Identical to 0031's
-- version otherwise.
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

  -- 0015's "snap treasury down to gdp" clause DELIBERATELY REMOVED here -
  -- it was a one-time legacy fix that has since expired and now silently
  -- zeroes out newly-rebirthed players' starting 1000 treasury on their
  -- next page load.

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
-- 2. Daily Quests schema
-- ---------------------------------------------------------------------------

create table if not exists daily_quests (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries (id) on delete cascade,
  quest_date date not null,
  quest_key text not null,
  target bigint not null,
  progress bigint not null default 0,
  -- For "earn N GDP" quests: snapshot of gdp at quest creation, so
  -- progress = current_gdp - baseline. Null for other quest types.
  baseline_value numeric,
  reward_credits int not null,
  completed_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (country_id, quest_date, quest_key)
);

create index if not exists daily_quests_country_date_idx on daily_quests (country_id, quest_date);

alter table daily_quests enable row level security;

drop policy if exists "own quests" on daily_quests;
create policy "own quests" on daily_quests for select
  using (
    exists (
      select 1 from countries c
      where c.id = daily_quests.country_id and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. ensure_daily_quests: idempotent, called on every dashboard load.
-- If today's 3 quests don't exist for this country, pick 3 random from
-- the hardcoded catalog and insert them. Then recompute progress on
-- every call by counting from existing base tables (active_policies,
-- pvp_matches) or the baseline snapshot - so quests stay accurate without
-- modifying enact_store_policy/pvp_finalize_match.
-- ---------------------------------------------------------------------------

create or replace function ensure_daily_quests(p_country_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_today date;
  v_existing int;
  v_current_gdp numeric;
  v_quest record;
  -- Hardcoded catalog: quest_key, target, reward_credits, needs_gdp_baseline
  v_catalog jsonb := '[
    {"key": "enact_3_policies",  "target": 3,          "reward": 3,  "baseline": false},
    {"key": "enact_10_policies", "target": 10,         "reward": 8,  "baseline": false},
    {"key": "enact_1_t4_or_t5",  "target": 1,          "reward": 6,  "baseline": false},
    {"key": "win_1_battle",      "target": 1,          "reward": 5,  "baseline": false},
    {"key": "win_3_battles",     "target": 3,          "reward": 12, "baseline": false},
    {"key": "earn_10m_gdp",      "target": 10000000,   "reward": 4,  "baseline": true},
    {"key": "earn_100m_gdp",     "target": 100000000,  "reward": 8,  "baseline": true},
    {"key": "earn_1b_gdp",       "target": 1000000000, "reward": 15, "baseline": true}
  ]'::jsonb;
  v_picks jsonb;
  v_pick jsonb;
  v_progress bigint;
  v_target bigint;
begin
  select user_id into v_owner from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  v_today := (now() at time zone 'UTC')::date;
  select count(*) into v_existing from daily_quests
    where country_id = p_country_id and quest_date = v_today;

  -- Populate today's quests if not yet done.
  if v_existing = 0 then
    select gdp into v_current_gdp from countries where id = p_country_id;

    -- Pick 3 distinct quests from the catalog, weighted uniformly.
    select jsonb_agg(q) into v_picks from (
      select value as q from jsonb_array_elements(v_catalog)
      order by random() limit 3
    ) s;

    for v_pick in select * from jsonb_array_elements(v_picks)
    loop
      insert into daily_quests (
        country_id, quest_date, quest_key, target, reward_credits, baseline_value
      ) values (
        p_country_id,
        v_today,
        v_pick->>'key',
        (v_pick->>'target')::bigint,
        (v_pick->>'reward')::int,
        case when (v_pick->>'baseline')::boolean then v_current_gdp else null end
      )
      on conflict (country_id, quest_date, quest_key) do nothing;
    end loop;
  end if;

  -- Recompute progress on every call. This is the one write path -
  -- enact_store_policy and pvp_finalize_match are untouched.
  for v_quest in
    select * from daily_quests
    where country_id = p_country_id and quest_date = v_today and claimed_at is null
  loop
    if v_quest.quest_key = 'enact_3_policies' or v_quest.quest_key = 'enact_10_policies' then
      select count(*) into v_progress
      from active_policies
      where country_id = p_country_id
        and settled = true
        and settled_at >= v_today::timestamptz
        and settled_at < (v_today + 1)::timestamptz;
    elsif v_quest.quest_key = 'enact_1_t4_or_t5' then
      select count(*) into v_progress
      from active_policies
      where country_id = p_country_id
        and settled = true
        and tier in (4, 5)
        and settled_at >= v_today::timestamptz
        and settled_at < (v_today + 1)::timestamptz;
    elsif v_quest.quest_key = 'win_1_battle' or v_quest.quest_key = 'win_3_battles' then
      select count(*) into v_progress
      from pvp_matches
      where winner_country_id = p_country_id
        and status = 'completed'
        and completed_at >= v_today::timestamptz
        and completed_at < (v_today + 1)::timestamptz;
    elsif v_quest.quest_key like 'earn_%_gdp' then
      select greatest(0, floor(c.gdp - coalesce(v_quest.baseline_value, 0)))::bigint into v_progress
      from countries c where c.id = p_country_id;
    else
      continue;
    end if;

    v_target := v_quest.target;

    update daily_quests set
      progress = v_progress,
      completed_at = case
        when v_progress >= v_target and completed_at is null then now()
        else completed_at
      end
    where id = v_quest.id;
  end loop;
end;
$$;

grant execute on function ensure_daily_quests(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. claim_daily_quest: verify the quest completed but wasn't claimed
-- yet, grant reward_credits to profiles.credits, mark claimed_at.
-- ---------------------------------------------------------------------------

create or replace function claim_daily_quest(p_quest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quest daily_quests%rowtype;
  v_owner uuid;
begin
  select * into v_quest from daily_quests where id = p_quest_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  end if;

  select user_id into v_owner from countries where id = v_quest.country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  if v_quest.completed_at is null then
    return jsonb_build_object('ok', false, 'reason', 'NOT_COMPLETE');
  end if;
  if v_quest.claimed_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_CLAIMED');
  end if;

  update daily_quests set claimed_at = now() where id = p_quest_id;
  update profiles set credits = credits + v_quest.reward_credits where id = v_owner;

  return jsonb_build_object('ok', true, 'creditsGranted', v_quest.reward_credits);
end;
$$;

grant execute on function claim_daily_quest(uuid) to authenticated;
