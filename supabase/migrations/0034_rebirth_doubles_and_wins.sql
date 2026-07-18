-- Six changes:
--   1. compute_gdp_per_sec: replace (1 + prestige_gdp_bonus) with
--      power(2, prestige_count). Each rebirth doubles GDP output. The
--      stored prestige_gdp_bonus / prestige_treasury_bonus columns are
--      no longer read (harmless, kept in place for compatibility).
--   2. settle_country: treasury_regen_per_sec is strictly
--      gdp_per_sec / 2. Drop the v_prestige_treasury_factor multiplier
--      (which was cancelling the /2 at 2 rebirths, causing the observed
--      GDP == Treasury bug). Since gdp_per_sec now doubles per rebirth,
--      treasury/sec doubles too - both rates go up by the same 2^N,
--      keeping the strict 2:1 ratio at every rebirth count.
--   3. countries.wins column + pvp_finalize_match increments it on
--      non-draw wins.
--   4. pvp_ensure_bot_sector_state (rewrite): takes an optional
--      p_target_sum. If provided, populates the bot's 10 sectors to sum
--      to ~target_sum with per-sector variance. Falls back to the
--      GDP-tier logic when null (for background callers). This is the
--      cleanest way to make bot opponents "roughly the same sector
--      stats" as the picker - we generate them to match instead of
--      searching for a match.
--   5. find_match: filters real-player opponents by sector-sum within
--      +/-20% of the picker's total, and passes the picker's sector sum
--      to pvp_ensure_bot_sector_state so bot opponents come out
--      pre-matched to strength.
--   6. get_leaderboard_wins: new RPC, mirror of get_leaderboard sorted
--      by wins desc. Same Diamond floor + join shape.
-- Plus one-shot: seed existing bots with random wins (curve topping at
-- 78) and random prestige_count (weighted 0-6, uncorrelated with rank).

-- ---------------------------------------------------------------------------
-- 1. compute_gdp_per_sec: pow(2, prestige_count)
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
  ), 0) * 500 * power(2, coalesce(
    (select prestige_count from countries where id = p_country_id), 0
  ))
  from sector_state ss
  left join sector_mutations sm on sm.country_id = ss.country_id and sm.sector = ss.sector
  where ss.country_id = p_country_id;
$$;

-- ---------------------------------------------------------------------------
-- 2. settle_country: strict treasury = gdp/2. Otherwise identical to 0033.
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

      update sector_state
        set score = greatest(v_current_score + v_delta, 0),
            updated_at = now()
        where country_id = p_country_id and sector = v_delta_row.sector;
    end loop;

    update active_policies set settled = true, settled_at = now() where id = v_policy.id;

    v_resolved_any := true;
    v_cursor_time := v_policy.completes_at;

    v_country.gdp_per_sec := compute_gdp_per_sec(p_country_id);
    v_country.treasury_regen_per_sec := v_country.gdp_per_sec / 2;
  end loop;

  v_country.gdp_per_sec := compute_gdp_per_sec(p_country_id);
  v_country.treasury_regen_per_sec := v_country.gdp_per_sec / 2;

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
-- 3. countries.wins column
-- ---------------------------------------------------------------------------

alter table countries add column if not exists wins int not null default 0;

-- ---------------------------------------------------------------------------
-- 4. pvp_finalize_match: increment winner's wins on non-draw victories.
-- Otherwise byte-for-byte identical to 0029.
-- ---------------------------------------------------------------------------

create or replace function pvp_finalize_match(p_match_id uuid, p_forfeited_by uuid)
returns void
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_winner uuid;
  v_loser uuid;
  v_is_draw boolean := false;
  v_payout numeric := 0;
  v_loser_treasury numeric;
begin
  select * into v_match from pvp_matches where id = p_match_id for update;
  if v_match.status <> 'active' then
    return;
  end if;

  if p_forfeited_by is not null then
    v_loser := p_forfeited_by;
    v_winner := case when p_forfeited_by = v_match.side_a_country_id
      then v_match.side_b_country_id else v_match.side_a_country_id end;
  elsif v_match.side_a_points > v_match.side_b_points then
    v_winner := v_match.side_a_country_id; v_loser := v_match.side_b_country_id;
  elsif v_match.side_b_points > v_match.side_a_points then
    v_winner := v_match.side_b_country_id; v_loser := v_match.side_a_country_id;
  else
    v_is_draw := true;
  end if;

  if v_winner is not null then
    select treasury into v_loser_treasury from countries where id = v_loser;
    v_payout := coalesce(v_loser_treasury, 0) * 0.15;
    update countries set treasury = greatest(treasury - v_payout, 0) where id = v_loser;
    update countries set treasury = treasury + v_payout where id = v_winner;
    update countries set wins = wins + 1 where id = v_winner;
  end if;

  update pvp_matches set
    status = 'completed', completed_at = now(),
    winner_country_id = v_winner, is_draw = v_is_draw,
    payout_amount = v_payout, forfeited_by = p_forfeited_by
  where id = p_match_id;

  insert into pvp_cooldowns (attacker_id, defender_id, last_attacked_at)
    values (v_match.side_a_country_id, v_match.side_b_country_id, now())
    on conflict (attacker_id, defender_id) do update set last_attacked_at = now();
  insert into pvp_cooldowns (attacker_id, defender_id, last_attacked_at)
    values (v_match.side_b_country_id, v_match.side_a_country_id, now())
    on conflict (attacker_id, defender_id) do update set last_attacked_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. pvp_ensure_bot_sector_state: overloaded to accept a target sum.
-- When p_target_sum is given, populates the bot's 10 sectors to sum to
-- ~target with per-sector variance. Called from find_match with the
-- picker's total sector sum so bot opponents come out at matching
-- strength - no more 0-vs-35 rounds.
-- ---------------------------------------------------------------------------

create or replace function pvp_ensure_bot_sector_state(
  p_bot_id uuid, p_target_sum numeric
)
returns void
language plpgsql
as $$
declare
  v_sector text;
  v_target_avg numeric;
  v_low numeric;
  v_high numeric;
  v_score numeric;
begin
  -- Target average per sector. +/- 30% spread across sectors around
  -- this so the opponent has weaknesses to exploit + strengths to
  -- avoid, but every sector is meaningful.
  v_target_avg := greatest(p_target_sum / 10.0, 0);
  v_low := greatest(v_target_avg * 0.7, 0);
  v_high := v_target_avg * 1.3;

  foreach v_sector in array array[
    'economy','social','safety','innovation','productivity',
    'infrastructure','environment','immigration','housing','culture'
  ]
  loop
    v_score := floor(v_low + random() * (v_high - v_low));
    insert into sector_state (country_id, sector, score, previous_score, updated_at)
      values (p_bot_id, v_sector, v_score, v_score, now())
      on conflict (country_id, sector) do update set
        score = excluded.score, previous_score = excluded.previous_score, updated_at = excluded.updated_at;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. find_match: sector-sum parity + generative bot opponents.
-- Real-player opponents filtered to within +/-20% of picker's sector
-- sum. Bot fallback calls the new parity-aware
-- pvp_ensure_bot_sector_state.
-- ---------------------------------------------------------------------------

create or replace function find_match(p_country_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_is_vip boolean;
  v_sector_sum numeric;
  v_queued_at timestamptz;
  v_opponent record;
  v_bot record;
  v_match_id uuid;
begin
  select user_id into v_owner from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  v_is_vip := is_vip(v_owner);

  select queued_at into v_queued_at from pvp_queue where country_id = p_country_id;

  if v_queued_at is null then
    perform settle_country(p_country_id);
    select coalesce(sum(score), 0) into v_sector_sum
      from sector_state where country_id = p_country_id;
    insert into pvp_queue (country_id, rank_tier, is_vip, queued_at)
      values (p_country_id, 'parity', v_is_vip, now())
      on conflict (country_id) do nothing;
    v_queued_at := now();
  else
    select coalesce(sum(score), 0) into v_sector_sum
      from sector_state where country_id = p_country_id;
  end if;

  -- Real-player opponent: same-strength window (+/-20%).
  select pq.country_id, pq.is_vip into v_opponent
  from pvp_queue pq
  join countries c on c.id = pq.country_id
  where pq.country_id <> p_country_id
    and c.created_at < now() - interval '24 hours'
    and abs(
      coalesce((select sum(score) from sector_state where country_id = pq.country_id), 0)
      - v_sector_sum
    ) <= 0.20 * greatest(v_sector_sum, 1)
    and not exists (
      select 1 from pvp_cooldowns pc
      where pc.attacker_id = p_country_id and pc.defender_id = pq.country_id
        and pc.last_attacked_at > now() - interval '30 minutes'
    )
  order by (pq.is_vip = v_is_vip) desc, pq.queued_at asc
  limit 1
  for update of pq skip locked;

  if v_opponent.country_id is not null then
    delete from pvp_queue where country_id in (p_country_id, v_opponent.country_id);
    v_match_id := gen_random_uuid();
    insert into pvp_matches (
      id, side_a_country_id, side_b_country_id, side_b_is_bot,
      round_number, round_deadline
    ) values (
      v_match_id, p_country_id, v_opponent.country_id, false,
      1, now() + interval '20 seconds'
    );
    return jsonb_build_object('ok', true, 'matched', true, 'match_id', v_match_id);
  end if;

  if now() - v_queued_at < interval '5 seconds' then
    return jsonb_build_object('ok', true, 'matched', false);
  end if;

  -- Bot fallback: generative parity via pvp_ensure_bot_sector_state.
  select id into v_bot from countries
  where is_bot = true
    and not exists (
      select 1 from pvp_cooldowns pc
      where pc.attacker_id = p_country_id and pc.defender_id = countries.id
        and pc.last_attacked_at > now() - interval '30 minutes'
    )
  order by random()
  limit 1;

  if v_bot.id is null then
    delete from pvp_queue where country_id = p_country_id;
    return jsonb_build_object('ok', false, 'reason', 'NO_OPPONENT_AVAILABLE');
  end if;

  delete from pvp_queue where country_id = p_country_id;
  v_match_id := gen_random_uuid();

  -- Generate the bot's sector state to match the picker's strength.
  perform pvp_ensure_bot_sector_state(v_bot.id, v_sector_sum);

  insert into pvp_matches (
    id, side_a_country_id, side_b_country_id, side_b_is_bot,
    round_number, round_deadline
  ) values (
    v_match_id, p_country_id, v_bot.id, true,
    1, now() + interval '20 seconds'
  );

  perform pvp_materialize_bot_pick(v_match_id);

  return jsonb_build_object('ok', true, 'matched', true, 'match_id', v_match_id);
end;
$$;

grant execute on function find_match(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. get_leaderboard_wins: same Diamond floor + join shape, sorted by
-- wins desc with GDP as tiebreaker.
-- ---------------------------------------------------------------------------

create or replace function get_leaderboard_wins(p_limit int default 100)
returns table (
  country_id uuid, name text, username text, flag_emoji text, flag_style jsonb,
  country_code text, gdp numeric, wins int, prestige_count int, rank bigint, is_vip boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform drift_bots_if_due();

  return query
    select c.id, c.name, c.username, c.flag_emoji, c.flag_style, c.country_code,
           c.gdp, c.wins, c.prestige_count,
           row_number() over (order by c.wins desc, c.gdp desc) as rank,
           (coalesce(p.vip_expires_at > now(), false) or c.is_vip_bot) as is_vip
    from countries c
    left join profiles p on p.id = c.user_id
    where c.gdp >= 100000000000
      and (not c.is_bot or c.show_on_leaderboard)
    order by c.wins desc, c.gdp desc
    limit p_limit;
end;
$$;

grant execute on function get_leaderboard_wins(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Backfill: add prestige_count + wins to the existing get_leaderboard
-- return so both tabs can share a single row component client-side.
-- ---------------------------------------------------------------------------

drop function if exists get_leaderboard(int);

create or replace function get_leaderboard(p_limit int default 100)
returns table (
  country_id uuid, name text, username text, flag_emoji text, flag_style jsonb,
  country_code text, gdp numeric, wins int, prestige_count int, rank bigint, is_vip boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform drift_bots_if_due();

  return query
    select c.id, c.name, c.username, c.flag_emoji, c.flag_style, c.country_code,
           c.gdp, c.wins, c.prestige_count,
           row_number() over (order by c.gdp desc) as rank,
           (coalesce(p.vip_expires_at > now(), false) or c.is_vip_bot) as is_vip
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
-- 9. One-shot seed: give existing leaderboard-visible bots random
-- wins (top 78, exponential drop, duplicates allowed) and random
-- prestige_count (weighted 0-6, uncorrelated with rank position).
-- Idempotent-ish: safe to re-run, but it will randomize the values
-- again each time.
-- ---------------------------------------------------------------------------

with ranked as (
  select id, row_number() over (order by random()) as rn
  from countries
  where is_bot = true and show_on_leaderboard = true
)
update countries c
  set wins = greatest(
    0,
    floor(78 * exp(-r.rn / 22.0) + (random() - 0.5) * 6)::int
  )
  from ranked r
  where c.id = r.id;

update countries set prestige_count = case
  when random() < 0.35 then 0
  when random() < 0.60 then 1
  when random() < 0.80 then 2
  when random() < 0.92 then 3
  when random() < 0.98 then 4
  else 5 + floor(random() * 2)::int
end
where is_bot = true and show_on_leaderboard = true;
