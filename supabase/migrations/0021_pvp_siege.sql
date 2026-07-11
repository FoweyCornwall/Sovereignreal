-- Replaces the hex-grid PvP system (0020_pvp_hex_grid.sql) entirely with a
-- live, synchronous "sector siege": two players take turns attacking one of
-- the OPPONENT's 10 sectors; that sector's own 0-100 score is its defense
-- (a maxed sector is genuinely hard to crack). Matchmaking, the live
-- turn-timer/lazy-catchup pattern, and "bots play their entire turn inline,
-- instantly" are all unchanged in spirit from the hex system - only the
-- combat model itself changes.
--
-- Resolution is a hit-chance percentage roll, not a power-vs-power
-- comparison - a 0-100 sector score maps directly onto "% chance to crack
-- it." A hit only damages a MATCH-SCOPED snapshot of sector scores (never
-- the real sector_state row - a fight can't permanently cripple a player's
-- real GDP engine) and skims a small amount of REAL treasury; a miss still
-- costs the attacker upkeep so attacks aren't risk-free. One attack per
-- turn, then the turn auto-advances - no AP budget, no explicit end_turn().
--
-- Win condition: break 4 of the opponent's 10 sectors to zero -> immediate
-- "conquest" win (20% of loser's real treasury). Otherwise the match runs
-- to a turn cap and whoever broke more sectors wins (tie-break: treasury
-- skimmed this match), payout 10%. Exact tie -> draw, no transfer.
--
-- Bots get real, tier-scaled sector_state (they previously had none),
-- seeded lazily the first time each bot is actually matched (or re-seeded
-- if its GDP has since drifted into a new rank tier) - this is what makes
-- them genuine PvP opponents instead of empty shells.

-- ---------------------------------------------------------------------------
-- Drop the hex-grid system.
-- ---------------------------------------------------------------------------

drop function if exists submit_claim(uuid, uuid, int, int);
drop function if exists end_turn(uuid, uuid);
drop function if exists get_recent_matches(uuid, int);
drop function if exists pvp_get_match_state(uuid, uuid);
drop function if exists pvp_play_bot_turn(uuid);
drop function if exists pvp_end_turn_and_advance(uuid, boolean);
drop function if exists pvp_finalize_match(uuid);
drop function if exists pvp_claim_tile(uuid, text, int, int);
drop function if exists pvp_compute_income(uuid, text);
drop function if exists pvp_recompute_connectivity(uuid);
drop function if exists pvp_seed_board(uuid, uuid, uuid);
drop function if exists pvp_tile_value(text);
drop function if exists pvp_hex_adjacent(int, int, int, int);
drop function if exists pvp_route_cap_for_gdp(numeric);
drop function if exists pvp_catch_up_timeouts(uuid);

drop table if exists pvp_match_tiles;
drop table if exists pvp_match_events;
drop table if exists pvp_matches;

-- pvp_queue, pvp_cooldowns, and rank_tier_for_gdp() are unchanged - still
-- used for matchmaking tier-bucketing and anti-immediate-rematch. Created
-- defensively here (if this is somehow being run before 0020 ever was, or
-- 0020 was skipped) - a no-op if they already exist from 0020.

create table if not exists pvp_queue (
  country_id uuid primary key references countries (id) on delete cascade,
  rank_tier text not null,
  is_vip boolean not null default false,
  queued_at timestamptz not null default now()
);
alter table pvp_queue enable row level security;

create table if not exists pvp_cooldowns (
  attacker_id uuid not null references countries (id) on delete cascade,
  defender_id uuid not null references countries (id) on delete cascade,
  last_attacked_at timestamptz not null,
  primary key (attacker_id, defender_id)
);
alter table pvp_cooldowns enable row level security;

alter table countries add column bot_sector_tier text;

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
  turns_per_side int not null default 10,
  turn_deadline timestamptz not null,
  side_a_conquests int not null default 0,
  side_b_conquests int not null default 0,
  side_a_skimmed numeric not null default 0,
  side_b_skimmed numeric not null default 0,
  winner_country_id uuid references countries (id),
  payout_amount numeric,
  win_reason text check (win_reason in ('conquest', 'turn_limit', 'draw')),
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

-- Match-scoped "shield HP" snapshot of both sides' sectors, frozen at match
-- creation (including any mutation multiplier, so a defender can't dodge by
-- re-rolling mutations mid-match). Damage here never touches the real
-- sector_state row.
create table pvp_match_sectors (
  match_id uuid not null references pvp_matches (id) on delete cascade,
  side text not null check (side in ('a', 'b')),
  sector text not null check (
    sector in (
      'economy', 'social', 'safety', 'innovation', 'productivity',
      'infrastructure', 'environment', 'immigration', 'housing', 'culture'
    )
  ),
  current_score numeric not null,
  mutation_multiplier numeric,
  primary key (match_id, side, sector)
);
alter table pvp_match_sectors enable row level security;
create policy "own match sectors read" on pvp_match_sectors
  for select using (
    exists (
      select 1 from pvp_matches m
      join countries c on c.id in (m.side_a_country_id, m.side_b_country_id)
      where m.id = pvp_match_sectors.match_id and c.user_id = auth.uid()
    )
  );

-- Attack log. `id` is a strictly-increasing identity so the client can
-- detect "events new since my last poll" for animation triggering.
create table pvp_match_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references pvp_matches (id) on delete cascade,
  turn_number int not null,
  attacker_country_id uuid references countries (id),
  target_sector text check (
    target_sector is null or target_sector in (
      'economy', 'social', 'safety', 'innovation', 'productivity',
      'infrastructure', 'environment', 'immigration', 'housing', 'culture'
    )
  ),
  outcome text not null check (outcome in ('hit', 'miss', 'auto_pass')),
  damage numeric not null default 0,
  treasury_skim numeric not null default 0,
  hit_chance numeric,
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
-- Bots need real sector defenses (they have none by design - no auth
-- account, no per-sector simulation). Seeded lazily the first time a bot is
-- actually chosen as an opponent, or re-seeded if its GDP has since drifted
-- into a new rank tier - the same "touch it, then it's correct" philosophy
-- as settle_country(), just applied to bot defenses instead of growth.
-- ---------------------------------------------------------------------------

create or replace function pvp_ensure_bot_sector_state(p_bot_id uuid)
returns void
language plpgsql
as $$
declare
  v_gdp numeric;
  v_seeded_tier text;
  v_current_tier text;
  v_min numeric;
  v_max numeric;
  v_sector text;
begin
  select gdp, bot_sector_tier into v_gdp, v_seeded_tier from countries where id = p_bot_id;
  v_current_tier := rank_tier_for_gdp(coalesce(v_gdp, 0));

  if v_seeded_tier is not distinct from v_current_tier
     and exists (select 1 from sector_state where country_id = p_bot_id) then
    return;
  end if;

  case v_current_tier
    when 'Bronze' then v_min := 5; v_max := 25;
    when 'Silver' then v_min := 15; v_max := 40;
    when 'Gold' then v_min := 30; v_max := 55;
    when 'Platinum' then v_min := 45; v_max := 70;
    when 'Diamond' then v_min := 60; v_max := 82;
    when 'Master' then v_min := 72; v_max := 92;
    else v_min := 85; v_max := 99; -- Grandmaster / Transcendent
  end case;

  delete from sector_state where country_id = p_bot_id;

  for v_sector in
    select unnest(array[
      'economy', 'social', 'safety', 'innovation', 'productivity',
      'infrastructure', 'environment', 'immigration', 'housing', 'culture'
    ])
  loop
    insert into sector_state (country_id, sector, score, previous_score)
    values (p_bot_id, v_sector, v_min + random() * (v_max - v_min), v_min + random() * (v_max - v_min));
  end loop;

  update countries set bot_sector_tier = v_current_tier where id = p_bot_id;
end;
$$;

create or replace function pvp_snapshot_match_sectors(p_match_id uuid, p_side_a uuid, p_side_b uuid)
returns void
language plpgsql
as $$
begin
  insert into pvp_match_sectors (match_id, side, sector, current_score, mutation_multiplier)
  select p_match_id, 'a', ss.sector, ss.score, sm.multiplier
  from sector_state ss
  left join sector_mutations sm on sm.country_id = ss.country_id and sm.sector = ss.sector
  where ss.country_id = p_side_a;

  insert into pvp_match_sectors (match_id, side, sector, current_score, mutation_multiplier)
  select p_match_id, 'b', ss.sector, ss.score, sm.multiplier
  from sector_state ss
  left join sector_mutations sm on sm.country_id = ss.country_id and sm.sector = ss.sector
  where ss.country_id = p_side_b;
end;
$$;

-- ---------------------------------------------------------------------------
-- Combat: a hit-chance percentage roll against the target sector's own
-- score. Shared by both submit_attack() (human) and the bot AI.
-- ---------------------------------------------------------------------------

create or replace function pvp_resolve_attack(p_match_id uuid, p_attacking_side text, p_target_sector text)
returns jsonb
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_attacker_country uuid;
  v_defender_country uuid;
  v_defending_side text;
  v_attacker_safety numeric;
  v_attacker_innovation numeric;
  v_target_score numeric;
  v_target_mult numeric;
  v_hit_chance numeric;
  v_is_hit boolean;
  v_damage numeric := 0;
  v_skim numeric := 0;
  v_new_score numeric;
  v_defender_treasury numeric;
  v_attacker_treasury numeric;
  v_upkeep numeric;
  v_broke_sector boolean := false;
begin
  select * into v_match from pvp_matches where id = p_match_id for update;

  v_attacker_country := case when p_attacking_side = 'a' then v_match.side_a_country_id else v_match.side_b_country_id end;
  v_defender_country := case when p_attacking_side = 'a' then v_match.side_b_country_id else v_match.side_a_country_id end;
  v_defending_side := case when p_attacking_side = 'a' then 'b' else 'a' end;

  select current_score, mutation_multiplier into v_target_score, v_target_mult
    from pvp_match_sectors
    where match_id = p_match_id and side = v_defending_side and sector = p_target_sector
    for update;

  if v_target_score is null then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_SECTOR');
  end if;
  if v_target_score <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'SECTOR_ALREADY_BROKEN');
  end if;

  select current_score into v_attacker_safety from pvp_match_sectors
    where match_id = p_match_id and side = p_attacking_side and sector = 'safety';
  select current_score into v_attacker_innovation from pvp_match_sectors
    where match_id = p_match_id and side = p_attacking_side and sector = 'innovation';

  v_hit_chance := 50
    + ((coalesce(v_attacker_safety, 0) + coalesce(v_attacker_innovation, 0)) / 2.0) * 0.3
    - v_target_score * 0.5
    - (case when v_target_mult is not null then 2 * sqrt(v_target_mult) else 0 end);
  v_hit_chance := greatest(10, least(90, v_hit_chance));

  v_is_hit := random() * 100 < v_hit_chance;

  select treasury into v_attacker_treasury from countries where id = v_attacker_country;
  select treasury into v_defender_treasury from countries where id = v_defender_country;

  if v_is_hit then
    v_damage := 6 + random() * 8;
    v_new_score := greatest(0, v_target_score - v_damage);
    update pvp_match_sectors set current_score = v_new_score
      where match_id = p_match_id and side = v_defending_side and sector = p_target_sector;

    v_skim := coalesce(v_defender_treasury, 0) * 0.02;
    update countries set treasury = greatest(treasury - v_skim, 0) where id = v_defender_country;
    update countries set treasury = treasury + v_skim where id = v_attacker_country;

    v_broke_sector := v_new_score = 0;
  end if;

  v_upkeep := coalesce(v_attacker_treasury, 0) * 0.01;
  update countries set treasury = greatest(treasury - v_upkeep, 0) where id = v_attacker_country;

  insert into pvp_match_events (match_id, turn_number, attacker_country_id, target_sector, outcome, damage, treasury_skim, hit_chance)
    values (p_match_id, v_match.turn_number, v_attacker_country, p_target_sector,
            case when v_is_hit then 'hit' else 'miss' end, v_damage, v_skim, v_hit_chance);

  if p_attacking_side = 'a' then
    update pvp_matches set
      side_a_skimmed = side_a_skimmed + v_skim,
      side_a_conquests = side_a_conquests + (case when v_broke_sector then 1 else 0 end)
      where id = p_match_id;
  else
    update pvp_matches set
      side_b_skimmed = side_b_skimmed + v_skim,
      side_b_conquests = side_b_conquests + (case when v_broke_sector then 1 else 0 end)
      where id = p_match_id;
  end if;

  perform pvp_advance_or_finalize(p_match_id, p_attacking_side);

  return jsonb_build_object(
    'ok', true, 'targetSector', p_target_sector,
    'outcome', case when v_is_hit then 'hit' else 'miss' end,
    'damage', v_damage, 'treasurySkim', v_skim, 'hitChance', v_hit_chance
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Turn advancement: checks conquest (4+ sectors broken) and the turn cap,
-- otherwise flips the active side and resets the timer. If the new active
-- side is a bot, plays its entire turn inline before returning.
-- ---------------------------------------------------------------------------

create or replace function pvp_finalize_match(p_match_id uuid, p_win_reason text)
returns void
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_winner uuid;
  v_loser uuid;
  v_payout_pct numeric;
  v_payout numeric;
  v_loser_treasury numeric;
begin
  select * into v_match from pvp_matches where id = p_match_id for update;

  if p_win_reason = 'conquest' then
    if v_match.side_a_conquests >= 4 then
      v_winner := v_match.side_a_country_id; v_loser := v_match.side_b_country_id;
    else
      v_winner := v_match.side_b_country_id; v_loser := v_match.side_a_country_id;
    end if;
    v_payout_pct := 0.2;
  else
    if v_match.side_a_conquests > v_match.side_b_conquests then
      v_winner := v_match.side_a_country_id; v_loser := v_match.side_b_country_id;
    elsif v_match.side_b_conquests > v_match.side_a_conquests then
      v_winner := v_match.side_b_country_id; v_loser := v_match.side_a_country_id;
    elsif v_match.side_a_skimmed > v_match.side_b_skimmed then
      v_winner := v_match.side_a_country_id; v_loser := v_match.side_b_country_id;
    elsif v_match.side_b_skimmed > v_match.side_a_skimmed then
      v_winner := v_match.side_b_country_id; v_loser := v_match.side_a_country_id;
    end if;
    v_payout_pct := 0.1;
  end if;

  if v_winner is not null then
    select treasury into v_loser_treasury from countries where id = v_loser;
    v_payout := coalesce(v_loser_treasury, 0) * v_payout_pct;
    update countries set treasury = greatest(treasury - v_payout, 0) where id = v_loser;
    update countries set treasury = treasury + v_payout where id = v_winner;
  end if;

  update pvp_matches set
    status = 'completed', completed_at = now(), winner_country_id = v_winner,
    payout_amount = coalesce(v_payout, 0),
    win_reason = case when v_winner is null then 'draw' else p_win_reason end
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
declare
  v_target text;
begin
  if random() < 0.85 then
    select sector into v_target from pvp_match_sectors
      where match_id = p_match_id and side = 'a' and current_score > 0
      order by current_score asc, random()
      limit 1;
  else
    select sector into v_target from pvp_match_sectors
      where match_id = p_match_id and side = 'a' and current_score > 0
      order by random()
      limit 1;
  end if;

  if v_target is null then
    return;
  end if;

  perform pvp_resolve_attack(p_match_id, 'b', v_target);
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

  if v_match.side_a_conquests >= 4 or v_match.side_b_conquests >= 4 then
    perform pvp_finalize_match(p_match_id, 'conquest');
    return;
  end if;

  if v_match.turn_number >= v_match.turns_per_side * 2 then
    perform pvp_finalize_match(p_match_id, 'turn_limit');
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

-- ---------------------------------------------------------------------------
-- Timeout catch-up: lazily auto-passes any turns whose deadline has
-- already elapsed, bounded so a very stale match can't loop forever.
-- ---------------------------------------------------------------------------

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

  insert into pvp_match_events (match_id, turn_number, attacker_country_id, outcome)
    values (p_match_id, v_match.turn_number, v_match.current_turn_country_id, 'auto_pass');

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
-- get_match_state: the shared jsonb shape returned by poll_match() and
-- submit_attack() so the client can use one merge function for both.
-- ---------------------------------------------------------------------------

create or replace function pvp_get_match_state(p_match_id uuid, p_country_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_my_side text;
  v_my_sectors jsonb;
  v_opponent_sectors jsonb;
  v_events jsonb;
begin
  select * into v_match from pvp_matches where id = p_match_id;
  v_my_side := case when v_match.side_a_country_id = p_country_id then 'a' else 'b' end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sector', s.sector, 'currentScore', s.current_score, 'mutationMultiplier', s.mutation_multiplier
  ) order by s.sector), '[]'::jsonb) into v_my_sectors
  from pvp_match_sectors s where s.match_id = p_match_id and s.side = v_my_side;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sector', s.sector, 'currentScore', s.current_score, 'mutationMultiplier', s.mutation_multiplier
  ) order by s.sector), '[]'::jsonb) into v_opponent_sectors
  from pvp_match_sectors s where s.match_id = p_match_id and s.side <> v_my_side;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'turnNumber', e.turn_number, 'attackerCountryId', e.attacker_country_id,
    'targetSector', e.target_sector, 'outcome', e.outcome, 'damage', e.damage,
    'treasurySkim', e.treasury_skim, 'hitChance', e.hit_chance
  ) order by e.id), '[]'::jsonb) into v_events
  from (
    select * from pvp_match_events where match_id = p_match_id order by id desc limit 20
  ) e;

  return jsonb_build_object(
    'matchId', v_match.id,
    'status', v_match.status,
    'mySide', v_my_side,
    'sideACountryId', v_match.side_a_country_id,
    'sideBCountryId', v_match.side_b_country_id,
    'sideBIsBot', v_match.side_b_is_bot,
    'currentTurnCountryId', v_match.current_turn_country_id,
    'turnNumber', v_match.turn_number,
    'turnsPerSide', v_match.turns_per_side,
    'turnDeadline', v_match.turn_deadline,
    'sideAConquests', v_match.side_a_conquests,
    'sideBConquests', v_match.side_b_conquests,
    'sideASkimmed', v_match.side_a_skimmed,
    'sideBSkimmed', v_match.side_b_skimmed,
    'winnerCountryId', v_match.winner_country_id,
    'payoutAmount', v_match.payout_amount,
    'winReason', v_match.win_reason,
    'mySectors', v_my_sectors,
    'opponentSectors', v_opponent_sectors,
    'events', v_events
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- find_match(): matchmaking entry point. Logic unchanged from the hex
-- system (1.2s/8s bot-fallback poll pattern, VIP-prefers-VIP order-by,
-- 24h-account-age gate, 30-min rematch cooldown) - only the match-creation
-- tail changes (ensure bot defenses, snapshot sectors instead of a board).
-- ---------------------------------------------------------------------------

create or replace function find_match(p_country_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_country countries%rowtype;
  v_is_vip boolean;
  v_rank_tier text;
  v_queued_at timestamptz;
  v_opponent record;
  v_bot record;
  v_match_id uuid;
begin
  select user_id into v_owner from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select * into v_country from countries where id = p_country_id;
  v_is_vip := is_vip(v_owner);
  v_rank_tier := rank_tier_for_gdp(v_country.gdp);

  select queued_at into v_queued_at from pvp_queue where country_id = p_country_id;

  if v_queued_at is null then
    perform settle_country(p_country_id);
    insert into pvp_queue (country_id, rank_tier, is_vip, queued_at)
      values (p_country_id, v_rank_tier, v_is_vip, now())
      on conflict (country_id) do nothing;
    v_queued_at := now();
  end if;

  select pq.country_id, pq.is_vip into v_opponent
  from pvp_queue pq
  join countries c on c.id = pq.country_id
  where pq.country_id <> p_country_id
    and pq.rank_tier = v_rank_tier
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
    perform pvp_snapshot_match_sectors(v_match_id, p_country_id, v_opponent.country_id);
    return jsonb_build_object('ok', true, 'matched', true, 'match_id', v_match_id);
  end if;

  if now() - v_queued_at < interval '8 seconds' then
    return jsonb_build_object('ok', true, 'matched', false);
  end if;

  select id into v_bot from countries
  where is_bot = true and rank_tier_for_gdp(gdp) = v_rank_tier
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
  perform pvp_snapshot_match_sectors(v_match_id, p_country_id, v_bot.id);

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
-- submit_attack(): the move RPC, replacing submit_claim().
-- ---------------------------------------------------------------------------

create or replace function submit_attack(p_match_id uuid, p_country_id uuid, p_target_sector text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_match pvp_matches%rowtype;
  v_side text;
  v_attack_result jsonb;
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
  v_attack_result := pvp_resolve_attack(p_match_id, v_side, p_target_sector);

  return jsonb_build_object('ok', true, 'attackResult', v_attack_result)
    || pvp_get_match_state(p_match_id, p_country_id);
end;
$$;

grant execute on function submit_attack(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- get_recent_matches(): history list. Dropped and recreated (not just
-- replaced) since its output columns changed - Postgres doesn't allow
-- CREATE OR REPLACE to change a table-returning function's column list.
-- ---------------------------------------------------------------------------

create or replace function get_recent_matches(p_country_id uuid, p_limit int default 20)
returns table (
  id uuid,
  side_a_country_id uuid,
  side_a_name text,
  side_b_country_id uuid,
  side_b_name text,
  side_b_is_bot boolean,
  winner_country_id uuid,
  payout_amount numeric,
  win_reason text,
  side_a_conquests int,
  side_b_conquests int,
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
    select m.id, m.side_a_country_id, ca.name, m.side_b_country_id, cb.name, m.side_b_is_bot,
           m.winner_country_id, m.payout_amount, m.win_reason, m.side_a_conquests, m.side_b_conquests,
           m.completed_at
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
