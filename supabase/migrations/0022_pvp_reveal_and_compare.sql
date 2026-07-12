-- Reworks the sector-siege combat model (0021_pvp_siege.sql) based on
-- direct user feedback that opponents felt too hard. Two root causes:
-- (1) the hit-chance-vs-max-defense formula could clamp a weak attacker to
-- a ~10% hit chance forever against any well-developed sector, and (2)
-- matchmaking bucketed by GDP rank tier, a poor proxy for a real player's
-- actual sector development early on.
--
-- New model: each turn, the server picks a random NOT-YET-USED sector
-- (never player-chosen - "can't see the opponent's sector index and choose
-- randomly"), reveals both sides' live scores in that sector, and whoever's
-- higher wins the round outright (no formula, no probability). First to 5
-- round-wins takes the match - since there are only 10 sectors and a round
-- always has a decisive winner (ties broken by coinflip), the match is
-- mathematically guaranteed to resolve by round 9 at the latest. Winning a
-- round has no side effect of its own; the single payout happens once, at
-- match end.
--
-- Matchmaking now keys off a "strength band" derived from a player's
-- ACTUAL average sector score (pvp_strength_band()), not GDP rank tier -
-- a weak-GDP player with well-developed sectors and a rich player with
-- neglected ones now land in the band that actually reflects their combat
-- strength. Bots are matched into the same band ladder via their
-- GDP-derived tier (which already determines their seeded sector range),
-- so no separate sector lookup is needed to filter bot candidates.
--
-- Bots now come in two pools: a small, strong, LEADERBOARD-VISIBLE pool
-- (Diamond+ GDP floor, per the user's request) and a larger HIDDEN pool
-- (full Bronze-Grandmaster spread, show_on_leaderboard = false) that only
-- exists to give weaker/newer players fair matchmaking opponents without
-- cluttering the leaderboard with easy bots. Both pools are eligible for
-- PvP matching; only get_leaderboard() filters by show_on_leaderboard.
--
-- A "leave match" option is added (forfeit_match()) - forfeiting awards
-- the opponent an immediate win + payout, same as a natural finish.
--
-- Opponent identity (name/flag/username) is now returned as part of the
-- match state and always shown - there is no bot/human distinction in the
-- UI at all.

-- ---------------------------------------------------------------------------
-- Leaderboard visibility flag - real players are always visible; only bots
-- can be hidden. Existing rows default true, so nothing already-visible
-- changes until the reseed explicitly sets some bots to false.
-- ---------------------------------------------------------------------------

alter table countries add column show_on_leaderboard boolean not null default true;

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
    where not c.is_bot or c.show_on_leaderboard
    order by c.gdp desc
    limit p_limit;
end;
$$;

grant execute on function get_leaderboard(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Strength band: the same 7-tier ladder used for bot sector seeding
-- (pvp_ensure_bot_sector_state, unchanged from 0021), but keyed off a
-- player's actual average sector score instead of GDP. This is the new
-- matchmaking key for both real players and bots.
-- ---------------------------------------------------------------------------

create or replace function pvp_strength_band(p_avg_score numeric)
returns text
language sql
immutable
as $$
  select case
    when p_avg_score >= 85 then 'Grandmaster'
    when p_avg_score >= 72 then 'Master'
    when p_avg_score >= 60 then 'Diamond'
    when p_avg_score >= 45 then 'Platinum'
    when p_avg_score >= 30 then 'Gold'
    when p_avg_score >= 15 then 'Silver'
    else 'Bronze'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Drop everything from the previous combat model that no longer applies.
-- ---------------------------------------------------------------------------

drop function if exists submit_attack(uuid, uuid, text);
drop function if exists get_recent_matches(uuid, int);
drop function if exists pvp_get_match_state(uuid, uuid);
drop function if exists pvp_resolve_attack(uuid, text, text);
drop function if exists pvp_play_bot_turn(uuid);
drop function if exists pvp_advance_or_finalize(uuid, text);
drop function if exists pvp_finalize_match(uuid, text);
drop function if exists pvp_auto_pass_turn(uuid);
drop function if exists pvp_catch_up_timeouts(uuid);
drop function if exists pvp_snapshot_match_sectors(uuid, uuid, uuid);

drop table if exists pvp_match_sectors;
drop table if exists pvp_match_events;
drop table if exists pvp_matches;

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

create table pvp_matches (
  id uuid primary key default gen_random_uuid(),
  side_a_country_id uuid not null references countries (id) on delete cascade,
  side_b_country_id uuid not null references countries (id) on delete cascade,
  side_b_is_bot boolean not null default false,
  status text not null default 'active' check (status in ('active', 'completed')),
  current_turn_country_id uuid not null,
  turn_number int not null default 1,
  turn_deadline timestamptz not null,
  rounds_to_win int not null default 5,
  side_a_wins int not null default 0,
  side_b_wins int not null default 0,
  winner_country_id uuid references countries (id),
  payout_amount numeric,
  forfeited_by uuid references countries (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table pvp_matches enable row level security;
create policy "own matches read" on pvp_matches
  for select using (
    exists (
      select 1 from countries c
      where c.id in (pvp_matches.side_a_country_id, pvp_matches.side_b_country_id)
        and c.user_id = auth.uid()
    )
  );

create index pvp_matches_side_a_idx on pvp_matches (side_a_country_id, created_at desc);
create index pvp_matches_side_b_idx on pvp_matches (side_b_country_id, created_at desc);

-- One row per sector per match, seeded empty (unrevealed) at match creation
-- and filled in the moment that sector is randomly picked for a round.
-- Both sides always see the identical revealed data - there's no
-- "mine vs opponent's" split once a sector is revealed.
create table pvp_match_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references pvp_matches (id) on delete cascade,
  turn_number int not null,
  event_type text not null check (event_type in ('round', 'auto_pass')),
  target_sector text check (
    target_sector is null or target_sector in (
      'economy', 'social', 'safety', 'innovation', 'productivity',
      'infrastructure', 'environment', 'immigration', 'housing', 'culture'
    )
  ),
  side_a_score numeric,
  side_b_score numeric,
  winner_side text check (winner_side is null or winner_side in ('a', 'b')),
  created_at timestamptz not null default now()
);
alter table pvp_match_events enable row level security;
create policy "own match events read" on pvp_match_events
  for select using (
    exists (
      select 1 from pvp_matches m
      join countries c on c.id in (m.side_a_country_id, m.side_b_country_id)
      where m.id = pvp_match_events.match_id and c.user_id = auth.uid()
    )
  );

create index pvp_match_events_match_idx on pvp_match_events (match_id, id);

-- ---------------------------------------------------------------------------
-- Round resolution: pick a random sector not yet used this match, compare
-- both sides' LIVE sector_state scores (no match-scoped snapshot - if a
-- player enacts a policy mid-match, a not-yet-revealed sector reflects
-- that), record the winner, update the tally, then advance or finalize.
-- Exact ties (both scores identical, most likely at 0 very early game) are
-- broken by a coinflip. Shared by submit_attack() and the bot AI - a
-- "round" has no concept of attacker/defender, it's symmetric.
-- ---------------------------------------------------------------------------

create or replace function pvp_resolve_round(p_match_id uuid, p_acting_side text)
returns jsonb
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_sector text;
  v_side_a_score numeric;
  v_side_b_score numeric;
  v_winner_side text;
begin
  select * into v_match from pvp_matches where id = p_match_id for update;

  select s.sector into v_sector
  from unnest(array[
    'economy', 'social', 'safety', 'innovation', 'productivity',
    'infrastructure', 'environment', 'immigration', 'housing', 'culture'
  ]) as s(sector)
  where s.sector not in (
    select target_sector from pvp_match_events
    where match_id = p_match_id and target_sector is not null
  )
  order by random()
  limit 1;

  if v_sector is null then
    -- All 10 sectors used with no side reaching 5 (should be impossible
    -- given a decisive winner every round, but guard defensively).
    perform pvp_finalize_match(p_match_id, null);
    return jsonb_build_object('ok', false, 'reason', 'NO_SECTORS_LEFT');
  end if;

  select coalesce(score, 0) into v_side_a_score from sector_state
    where country_id = v_match.side_a_country_id and sector = v_sector;
  select coalesce(score, 0) into v_side_b_score from sector_state
    where country_id = v_match.side_b_country_id and sector = v_sector;

  if v_side_a_score > v_side_b_score then
    v_winner_side := 'a';
  elsif v_side_b_score > v_side_a_score then
    v_winner_side := 'b';
  else
    v_winner_side := case when random() < 0.5 then 'a' else 'b' end;
  end if;

  insert into pvp_match_events (
    match_id, turn_number, event_type, target_sector, side_a_score, side_b_score, winner_side
  ) values (
    p_match_id, v_match.turn_number, 'round', v_sector, v_side_a_score, v_side_b_score, v_winner_side
  );

  if v_winner_side = 'a' then
    update pvp_matches set side_a_wins = side_a_wins + 1 where id = p_match_id;
  else
    update pvp_matches set side_b_wins = side_b_wins + 1 where id = p_match_id;
  end if;

  perform pvp_advance_or_finalize(p_match_id, p_acting_side);

  return jsonb_build_object(
    'ok', true, 'targetSector', v_sector,
    'sideAScore', v_side_a_score, 'sideBScore', v_side_b_score, 'winnerSide', v_winner_side
  );
end;
$$;

create or replace function pvp_finalize_match(p_match_id uuid, p_forfeited_by uuid)
returns void
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_winner uuid;
  v_loser uuid;
  v_payout numeric;
  v_loser_treasury numeric;
begin
  select * into v_match from pvp_matches where id = p_match_id for update;

  if p_forfeited_by is not null then
    v_loser := p_forfeited_by;
    v_winner := case when p_forfeited_by = v_match.side_a_country_id
      then v_match.side_b_country_id else v_match.side_a_country_id end;
  elsif v_match.side_a_wins > v_match.side_b_wins then
    v_winner := v_match.side_a_country_id; v_loser := v_match.side_b_country_id;
  elsif v_match.side_b_wins > v_match.side_a_wins then
    v_winner := v_match.side_b_country_id; v_loser := v_match.side_a_country_id;
  end if;

  if v_winner is not null then
    select treasury into v_loser_treasury from countries where id = v_loser;
    v_payout := coalesce(v_loser_treasury, 0) * 0.15;
    update countries set treasury = greatest(treasury - v_payout, 0) where id = v_loser;
    update countries set treasury = treasury + v_payout where id = v_winner;
  end if;

  update pvp_matches set
    status = 'completed', completed_at = now(), winner_country_id = v_winner,
    payout_amount = coalesce(v_payout, 0), forfeited_by = p_forfeited_by
  where id = p_match_id;

  insert into pvp_cooldowns (attacker_id, defender_id, last_attacked_at)
    values (v_match.side_a_country_id, v_match.side_b_country_id, now())
    on conflict (attacker_id, defender_id) do update set last_attacked_at = now();
  insert into pvp_cooldowns (attacker_id, defender_id, last_attacked_at)
    values (v_match.side_b_country_id, v_match.side_a_country_id, now())
    on conflict (attacker_id, defender_id) do update set last_attacked_at = now();
end;
$$;

create or replace function pvp_play_bot_turn(p_match_id uuid)
returns void
language plpgsql
as $$
begin
  perform pvp_resolve_round(p_match_id, 'b');
end;
$$;

create or replace function pvp_advance_or_finalize(p_match_id uuid, p_acting_side text)
returns void
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_next_side_a boolean;
begin
  select * into v_match from pvp_matches where id = p_match_id for update;

  if v_match.status <> 'active' then
    return;
  end if;

  if v_match.side_a_wins >= v_match.rounds_to_win or v_match.side_b_wins >= v_match.rounds_to_win then
    perform pvp_finalize_match(p_match_id, null);
    return;
  end if;

  -- Defensive safety valve only - mathematically unreachable given a
  -- decisive winner every round and only 10 sectors total.
  if v_match.turn_number >= 40 then
    perform pvp_finalize_match(p_match_id, null);
    return;
  end if;

  v_next_side_a := p_acting_side <> 'a';

  update pvp_matches set
    turn_number = turn_number + 1,
    current_turn_country_id = case when v_next_side_a then side_a_country_id else side_b_country_id end,
    turn_deadline = now() + interval '15 seconds'
  where id = p_match_id;

  select * into v_match from pvp_matches where id = p_match_id;
  if v_match.side_b_is_bot and v_match.current_turn_country_id = v_match.side_b_country_id then
    perform pvp_play_bot_turn(p_match_id);
  end if;
end;
$$;

create or replace function pvp_auto_pass_turn(p_match_id uuid)
returns void
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_acting_side text;
begin
  select * into v_match from pvp_matches where id = p_match_id for update;
  v_acting_side := case when v_match.current_turn_country_id = v_match.side_a_country_id then 'a' else 'b' end;

  insert into pvp_match_events (match_id, turn_number, event_type)
    values (p_match_id, v_match.turn_number, 'auto_pass');

  perform pvp_advance_or_finalize(p_match_id, v_acting_side);
end;
$$;

create or replace function pvp_catch_up_timeouts(p_match_id uuid)
returns void
language plpgsql
as $$
declare
  v_iterations int := 0;
  v_status text;
  v_deadline timestamptz;
begin
  loop
    v_iterations := v_iterations + 1;
    exit when v_iterations > 200;

    select status, turn_deadline into v_status, v_deadline from pvp_matches where id = p_match_id;
    exit when v_status <> 'active';
    exit when now() <= v_deadline;

    perform pvp_auto_pass_turn(p_match_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_match_state: includes both sides' real identity (name/flag/username -
-- there's no bot/human distinction shown anywhere) and the 10-sector reveal
-- board (revealed sectors carry their locked-in scores/winner; unrevealed
-- ones don't).
-- ---------------------------------------------------------------------------

create or replace function pvp_get_match_state(p_match_id uuid, p_country_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_my_side text;
  v_my_country countries%rowtype;
  v_opponent_country countries%rowtype;
  v_sectors jsonb;
begin
  select * into v_match from pvp_matches where id = p_match_id;
  v_my_side := case when v_match.side_a_country_id = p_country_id then 'a' else 'b' end;

  select * into v_my_country from countries where id = p_country_id;
  select * into v_opponent_country from countries
    where id = (case when v_my_side = 'a' then v_match.side_b_country_id else v_match.side_a_country_id end);

  select coalesce(jsonb_agg(jsonb_build_object(
    'sector', s.sector,
    'revealed', e.id is not null,
    'sideAScore', e.side_a_score, 'sideBScore', e.side_b_score, 'winnerSide', e.winner_side
  ) order by s.ord), '[]'::jsonb) into v_sectors
  from (
    select sector, ord from unnest(array[
      'economy', 'social', 'safety', 'innovation', 'productivity',
      'infrastructure', 'environment', 'immigration', 'housing', 'culture'
    ]) with ordinality as t(sector, ord)
  ) s
  left join pvp_match_events e
    on e.match_id = p_match_id and e.target_sector = s.sector and e.event_type = 'round';

  return jsonb_build_object(
    'matchId', v_match.id,
    'status', v_match.status,
    'mySide', v_my_side,
    'sideACountryId', v_match.side_a_country_id,
    'sideBCountryId', v_match.side_b_country_id,
    'currentTurnCountryId', v_match.current_turn_country_id,
    'turnNumber', v_match.turn_number,
    'turnDeadline', v_match.turn_deadline,
    'roundsToWin', v_match.rounds_to_win,
    'sideAWins', v_match.side_a_wins,
    'sideBWins', v_match.side_b_wins,
    'winnerCountryId', v_match.winner_country_id,
    'payoutAmount', v_match.payout_amount,
    'forfeited', v_match.forfeited_by is not null,
    'myIdentity', jsonb_build_object(
      'countryId', v_my_country.id, 'name', v_my_country.name, 'username', v_my_country.username,
      'flagEmoji', v_my_country.flag_emoji, 'flagStyle', v_my_country.flag_style,
      'countryCode', v_my_country.country_code
    ),
    'opponentIdentity', jsonb_build_object(
      'countryId', v_opponent_country.id, 'name', v_opponent_country.name, 'username', v_opponent_country.username,
      'flagEmoji', v_opponent_country.flag_emoji, 'flagStyle', v_opponent_country.flag_style,
      'countryCode', v_opponent_country.country_code
    ),
    'sectors', v_sectors
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- find_match(): matchmaking now keys off pvp_strength_band(avg sector
-- score) instead of rank_tier_for_gdp(). Bots are filtered by their
-- GDP-derived tier as a proxy for the band their sector_state would seed
-- into (they may not have sector_state populated yet, so we can't compute
-- their real average until after pvp_ensure_bot_sector_state runs).
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
  v_avg_score numeric;
  v_band text;
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
    select avg(score) into v_avg_score from sector_state where country_id = p_country_id;
    v_band := pvp_strength_band(coalesce(v_avg_score, 0));
    insert into pvp_queue (country_id, rank_tier, is_vip, queued_at)
      values (p_country_id, v_band, v_is_vip, now())
      on conflict (country_id) do nothing;
    v_queued_at := now();
  end if;

  select rank_tier into v_band from pvp_queue where country_id = p_country_id;

  select pq.country_id, pq.is_vip into v_opponent
  from pvp_queue pq
  join countries c on c.id = pq.country_id
  where pq.country_id <> p_country_id
    and pq.rank_tier = v_band
    and c.created_at < now() - interval '24 hours'
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
      current_turn_country_id, turn_deadline
    ) values (
      v_match_id, p_country_id, v_opponent.country_id, false,
      p_country_id, now() + interval '15 seconds'
    );
    return jsonb_build_object('ok', true, 'matched', true, 'match_id', v_match_id);
  end if;

  if now() - v_queued_at < interval '8 seconds' then
    return jsonb_build_object('ok', true, 'matched', false);
  end if;

  select id into v_bot from countries
  where is_bot = true and rank_tier_for_gdp(gdp) = v_band
    and not exists (
      select 1 from pvp_cooldowns pc
      where pc.attacker_id = p_country_id and pc.defender_id = countries.id
        and pc.last_attacked_at > now() - interval '30 minutes'
    )
  order by random()
  limit 1;

  if v_bot.id is null then
    select id into v_bot from countries where is_bot = true order by random() limit 1;
  end if;

  if v_bot.id is null then
    delete from pvp_queue where country_id = p_country_id;
    return jsonb_build_object('ok', false, 'reason', 'NO_OPPONENT_AVAILABLE');
  end if;

  delete from pvp_queue where country_id = p_country_id;
  v_match_id := gen_random_uuid();

  perform pvp_ensure_bot_sector_state(v_bot.id);

  insert into pvp_matches (
    id, side_a_country_id, side_b_country_id, side_b_is_bot,
    current_turn_country_id, turn_deadline
  ) values (
    v_match_id, p_country_id, v_bot.id, true,
    p_country_id, now() + interval '15 seconds'
  );

  return jsonb_build_object('ok', true, 'matched', true, 'match_id', v_match_id);
end;
$$;

grant execute on function find_match(uuid) to authenticated;

create or replace function cancel_match_search(p_country_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  delete from pvp_queue where country_id = p_country_id;
end;
$$;

grant execute on function cancel_match_search(uuid) to authenticated;

create or replace function poll_match(p_match_id uuid, p_country_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_side_a uuid;
  v_side_b uuid;
begin
  select user_id into v_owner from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select side_a_country_id, side_b_country_id into v_side_a, v_side_b
    from pvp_matches where id = p_match_id;

  if p_country_id <> v_side_a and p_country_id <> v_side_b then
    raise exception 'not authorized';
  end if;

  perform pvp_catch_up_timeouts(p_match_id);

  return jsonb_build_object('ok', true) || pvp_get_match_state(p_match_id, p_country_id);
end;
$$;

grant execute on function poll_match(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_attack(): no target sector anymore - the player has no visibility
-- into the opponent's sectors, so there's nothing to choose. Clicking
-- "Attack" just triggers the next random-sector reveal on your turn.
-- ---------------------------------------------------------------------------

create or replace function submit_attack(p_match_id uuid, p_country_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_match pvp_matches%rowtype;
  v_side text;
  v_round_result jsonb;
begin
  select user_id into v_owner from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select * into v_match from pvp_matches where id = p_match_id;
  if p_country_id <> v_match.side_a_country_id and p_country_id <> v_match.side_b_country_id then
    raise exception 'not authorized';
  end if;

  perform pvp_catch_up_timeouts(p_match_id);
  select * into v_match from pvp_matches where id = p_match_id;

  if v_match.status <> 'active' then
    return jsonb_build_object('ok', true) || pvp_get_match_state(p_match_id, p_country_id);
  end if;

  if v_match.current_turn_country_id <> p_country_id then
    return jsonb_build_object('ok', false, 'reason', 'NOT_YOUR_TURN')
      || pvp_get_match_state(p_match_id, p_country_id);
  end if;

  v_side := case when p_country_id = v_match.side_a_country_id then 'a' else 'b' end;
  v_round_result := pvp_resolve_round(p_match_id, v_side);

  return jsonb_build_object('ok', true, 'roundResult', v_round_result)
    || pvp_get_match_state(p_match_id, p_country_id);
end;
$$;

grant execute on function submit_attack(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- forfeit_match(): leave the game. Works regardless of whose turn it is.
-- Awards the opponent an immediate win + payout.
-- ---------------------------------------------------------------------------

create or replace function forfeit_match(p_match_id uuid, p_country_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_match pvp_matches%rowtype;
begin
  select user_id into v_owner from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select * into v_match from pvp_matches where id = p_match_id;
  if p_country_id <> v_match.side_a_country_id and p_country_id <> v_match.side_b_country_id then
    raise exception 'not authorized';
  end if;

  if v_match.status = 'active' then
    perform pvp_finalize_match(p_match_id, p_country_id);
  end if;

  return jsonb_build_object('ok', true) || pvp_get_match_state(p_match_id, p_country_id);
end;
$$;

grant execute on function forfeit_match(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_recent_matches(): history list. Dropped and recreated since output
-- columns changed.
-- ---------------------------------------------------------------------------

create or replace function get_recent_matches(p_country_id uuid, p_limit int default 20)
returns table (
  id uuid,
  side_a_country_id uuid,
  side_a_name text,
  side_b_country_id uuid,
  side_b_name text,
  winner_country_id uuid,
  payout_amount numeric,
  forfeited boolean,
  side_a_wins int,
  side_b_wins int,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
begin
  select c.user_id into v_owner from countries c where c.id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  return query
    select m.id, m.side_a_country_id, ca.name, m.side_b_country_id, cb.name,
           m.winner_country_id, m.payout_amount, (m.forfeited_by is not null),
           m.side_a_wins, m.side_b_wins, m.completed_at
    from pvp_matches m
    join countries ca on ca.id = m.side_a_country_id
    join countries cb on cb.id = m.side_b_country_id
    where (m.side_a_country_id = p_country_id or m.side_b_country_id = p_country_id)
      and m.status = 'completed'
    order by m.completed_at desc
    limit p_limit;
end;
$$;

grant execute on function get_recent_matches(uuid, int) to authenticated;
