-- Full rework of Battle mode combat, per direct user request: the
-- turn-based/alternating model (0022 + patch 0027, where one player picks a
-- sector per turn and it resolves immediately against the opponent's live
-- score, first to 5 round-wins ending the match early) becomes a
-- simultaneous, blind, fixed-5-round model. Both players pick a sector each
-- round without seeing the other's pick; the round only resolves once both
-- have locked one in. Every match plays exactly 5 rounds - no more early
-- win. Reveal pacing (3s suspense after both pick, +2s hold on the final
-- round before the outcome screen) is intentionally left entirely to the
-- frontend - the server resolves instantly, same "lazy settle" philosophy
-- used everywhere else in this project.
--
-- Scoring, confirmed with the user:
--   - Same sector picked by both: single head-to-head, exactly like the old
--     model - higher live sector_state.score wins 1 point, exact tie breaks
--     by coinflip, loser gets 0.
--   - Different sectors: two INDEPENDENT duels. Duel A is fought over side
--     A's pick - A's own score there vs B's score there; A wins (1 point)
--     only on a STRICT-GREATER score (a duel tie awards nobody that duel's
--     point - no coinflip on a duel, only on the same-sector case above).
--     Duel B mirrors this over side B's pick. 0, 1, or 2 points can be
--     awarded in a round; confirmed edge case: if both duels go against
--     their own picker, 0 points to both - symmetric with the both-win case.
-- After 5 rounds, higher total points wins (15% treasury payout, unchanged
-- number). Exact tie in total points -> explicit draw, no transfer - new,
-- since the old model could never actually reach a tie (it always ended
-- early on someone's 5th round-win).
--
-- Global sector-uniqueness carries forward from the old model (a sector,
-- once used by anyone in any round, can't be reused) - verified sound: 5
-- rounds x up to 2 sectors/round = max 10, exactly the pool size, so a
-- later round can never be starved of a legal pick.
--
-- Round pick timer: 20s (was 15s per-turn under the old model), auto-random
-- pick for whichever side hasn't chosen in time.
--
-- Matching this project's own established precedent (0022's own full
-- rewrite), pvp_matches/pvp_match_events are dropped and recreated rather
-- than altered - too many columns change shape/meaning. Any match active
-- at deploy time is lost, same as every prior PvP migration.

-- ---------------------------------------------------------------------------
-- Drop everything from the turn-based model that no longer applies.
-- ---------------------------------------------------------------------------

drop function if exists submit_attack(uuid, uuid, text);
drop function if exists pvp_resolve_round(uuid, text, text);
drop function if exists pvp_advance_or_finalize(uuid, text);
drop function if exists pvp_auto_pass_turn(uuid);
drop function if exists pvp_catch_up_timeouts(uuid);
drop function if exists pvp_play_bot_turn(uuid);
drop function if exists get_recent_matches(uuid, int);

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

  rounds_total int not null default 5,
  round_number int not null default 1,
  round_deadline timestamptz not null,

  -- Per-round pending picks: set the moment a side locks in, cleared the
  -- moment the round resolves. Null = hasn't picked this round yet.
  side_a_pending_sector text check (side_a_pending_sector is null or side_a_pending_sector in (
    'economy', 'social', 'safety', 'innovation', 'productivity',
    'infrastructure', 'environment', 'immigration', 'housing', 'culture'
  )),
  side_b_pending_sector text check (side_b_pending_sector is null or side_b_pending_sector in (
    'economy', 'social', 'safety', 'innovation', 'productivity',
    'infrastructure', 'environment', 'immigration', 'housing', 'culture'
  )),
  side_a_pending_auto boolean not null default false,
  side_b_pending_auto boolean not null default false,

  side_a_points int not null default 0,
  side_b_points int not null default 0,

  winner_country_id uuid references countries (id),
  is_draw boolean not null default false,
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

-- One row per ROUND (not per sector) - up to two sectors can reveal in a
-- single round now. Same-sector rounds just leave the second duel's columns
-- null (sector_b = sector_a, no second comparison exists).
create table pvp_match_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references pvp_matches (id) on delete cascade,
  round_number int not null,

  sector_a text not null check (sector_a in (
    'economy', 'social', 'safety', 'innovation', 'productivity',
    'infrastructure', 'environment', 'immigration', 'housing', 'culture'
  )),
  sector_b text not null check (sector_b in (
    'economy', 'social', 'safety', 'innovation', 'productivity',
    'infrastructure', 'environment', 'immigration', 'housing', 'culture'
  )),

  -- Duel over sector_a (A's pick): A's own score there vs B's score there.
  score_a_on_sector_a numeric not null,
  score_b_on_sector_a numeric not null,
  -- Duel over sector_b (B's pick). When sector_a = sector_b (same-sector
  -- round), these are populated as a MIRROR of the columns above (same
  -- sector, same scores) rather than left null - pvp_get_match_state's
  -- generic "my side reads its own _a/_b column, opponent's reads the
  -- other" rotation formula needs both sides populated symmetrically to
  -- read correctly regardless of which side is "mine".
  score_a_on_sector_b numeric,
  score_b_on_sector_b numeric,

  -- Same-sector round: duel_a_winner is the single comparison's winner
  -- ('a' or 'b', coinflip on tie - never null), duel_b_winner is always
  -- null (no second duel). Different-sector round: duel_a_winner can only
  -- ever be 'a' or null (the duel over A's own pick - B can't "win" it, a
  -- tie just means nobody scored it), duel_b_winner can only ever be 'b'
  -- or null, mirrored.
  duel_a_winner text check (duel_a_winner is null or duel_a_winner in ('a', 'b')),
  duel_b_winner text check (duel_b_winner is null or duel_b_winner in ('a', 'b')),

  side_a_points int not null default 0,
  side_b_points int not null default 0,

  side_a_auto_picked boolean not null default false,
  side_b_auto_picked boolean not null default false,

  created_at timestamptz not null default now(),

  unique (match_id, round_number)
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

create index pvp_match_events_match_idx on pvp_match_events (match_id, round_number);

-- ---------------------------------------------------------------------------
-- pvp_finalize_match: winner = higher total points (or forfeiter's
-- opponent); exact tie -> draw, no transfer (new - the old model could
-- never actually reach a tie). Idempotency guard added since finalize can
-- now be reached from more call sites (round 5 resolving vs. a forfeit).
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
-- pvp_advance_round_or_finalize: called once a round has actually resolved.
-- Finalizes on round 5, otherwise opens the next round and immediately
-- materializes the bot's pick for it (keeps the existing "bot never shows a
-- thinking state" property).
-- ---------------------------------------------------------------------------

create or replace function pvp_advance_round_or_finalize(p_match_id uuid)
returns void
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
begin
  select * into v_match from pvp_matches where id = p_match_id for update;
  if v_match.status <> 'active' then
    return;
  end if;

  if v_match.round_number >= v_match.rounds_total then
    perform pvp_finalize_match(p_match_id, null);
    return;
  end if;

  update pvp_matches set
    round_number = round_number + 1,
    side_a_pending_sector = null, side_b_pending_sector = null,
    side_a_pending_auto = false, side_b_pending_auto = false,
    round_deadline = now() + interval '20 seconds'
  where id = p_match_id;

  perform pvp_materialize_bot_pick(p_match_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- pvp_try_resolve_round: no-ops unless both sides have a pending pick this
-- round. Same-sector -> single comparison (old logic, unchanged). Different
-- sectors -> two independent strict-greater duels, no coinflip on a duel
-- tie. The unique(match_id, round_number) constraint is a structural
-- backstop against any future refactor accidentally double-resolving.
-- ---------------------------------------------------------------------------

create or replace function pvp_try_resolve_round(p_match_id uuid)
returns void
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_sector_a text;
  v_sector_b text;
  v_score_a_a numeric;
  v_score_b_a numeric;
  v_score_a_b numeric;
  v_score_b_b numeric;
  v_duel_a text;
  v_duel_b text;
  v_points_a int := 0;
  v_points_b int := 0;
begin
  select * into v_match from pvp_matches where id = p_match_id for update;

  if v_match.status <> 'active' then
    return;
  end if;
  if v_match.side_a_pending_sector is null or v_match.side_b_pending_sector is null then
    return;
  end if;

  v_sector_a := v_match.side_a_pending_sector;
  v_sector_b := v_match.side_b_pending_sector;

  select coalesce(score, 0) into v_score_a_a from sector_state
    where country_id = v_match.side_a_country_id and sector = v_sector_a;
  select coalesce(score, 0) into v_score_b_a from sector_state
    where country_id = v_match.side_b_country_id and sector = v_sector_a;

  if v_sector_a = v_sector_b then
    if v_score_a_a > v_score_b_a then
      v_duel_a := 'a'; v_points_a := 1;
    elsif v_score_b_a > v_score_a_a then
      v_duel_a := 'b'; v_points_b := 1;
    else
      if random() < 0.5 then v_duel_a := 'a'; v_points_a := 1;
      else v_duel_a := 'b'; v_points_b := 1;
      end if;
    end if;
    v_duel_b := null;
    -- Mirror the same-sector scores into the "_on_sector_b" columns too
    -- (sector_a = sector_b here, so they're the same comparison) - this
    -- keeps pvp_get_match_state's generic "my side reads _a, opponent side
    -- reads _b" rotation formula correct for BOTH sides without a
    -- same/different special case there.
    v_score_a_b := v_score_a_a;
    v_score_b_b := v_score_b_a;
  else
    select coalesce(score, 0) into v_score_a_b from sector_state
      where country_id = v_match.side_a_country_id and sector = v_sector_b;
    select coalesce(score, 0) into v_score_b_b from sector_state
      where country_id = v_match.side_b_country_id and sector = v_sector_b;

    if v_score_a_a > v_score_b_a then
      v_duel_a := 'a'; v_points_a := 1;
    else
      v_duel_a := null;
    end if;

    if v_score_b_b > v_score_a_b then
      v_duel_b := 'b'; v_points_b := 1;
    else
      v_duel_b := null;
    end if;
  end if;

  insert into pvp_match_events (
    match_id, round_number, sector_a, sector_b,
    score_a_on_sector_a, score_b_on_sector_a, score_a_on_sector_b, score_b_on_sector_b,
    duel_a_winner, duel_b_winner, side_a_points, side_b_points,
    side_a_auto_picked, side_b_auto_picked
  ) values (
    p_match_id, v_match.round_number, v_sector_a, v_sector_b,
    v_score_a_a, v_score_b_a, v_score_a_b, v_score_b_b,
    v_duel_a, v_duel_b, v_points_a, v_points_b,
    v_match.side_a_pending_auto, v_match.side_b_pending_auto
  );

  update pvp_matches set
    side_a_points = side_a_points + v_points_a,
    side_b_points = side_b_points + v_points_b
  where id = p_match_id;

  perform pvp_advance_round_or_finalize(p_match_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- pvp_materialize_bot_pick: idempotent - only acts if the opponent is a bot
-- and it hasn't picked this round yet. Same 85%-best-edge/15%-random
-- heuristic as before, computed purely from persistent sector_state scores
-- - it never reads the human's pending pick, so it can't peek even though
-- it may run after the human has already locked in.
-- ---------------------------------------------------------------------------

create or replace function pvp_materialize_bot_pick(p_match_id uuid)
returns void
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_sector text;
  v_used text[];
begin
  select * into v_match from pvp_matches where id = p_match_id for update;
  if v_match.status <> 'active' or not v_match.side_b_is_bot
     or v_match.side_b_pending_sector is not null then
    return;
  end if;

  select coalesce(array_agg(sector_a), array[]::text[]) || coalesce(array_agg(sector_b), array[]::text[])
    into v_used
    from pvp_match_events where match_id = p_match_id;

  if random() < 0.85 then
    select s.sector into v_sector
    from unnest(array[
      'economy', 'social', 'safety', 'innovation', 'productivity',
      'infrastructure', 'environment', 'immigration', 'housing', 'culture'
    ]) as s(sector)
    left join sector_state bot_ss
      on bot_ss.country_id = v_match.side_b_country_id and bot_ss.sector = s.sector
    left join sector_state opp_ss
      on opp_ss.country_id = v_match.side_a_country_id and opp_ss.sector = s.sector
    where s.sector <> all (v_used)
    order by coalesce(bot_ss.score, 0) - coalesce(opp_ss.score, 0) desc, random()
    limit 1;
  else
    select s.sector into v_sector
    from unnest(array[
      'economy', 'social', 'safety', 'innovation', 'productivity',
      'infrastructure', 'environment', 'immigration', 'housing', 'culture'
    ]) as s(sector)
    where s.sector <> all (v_used)
    order by random()
    limit 1;
  end if;

  update pvp_matches set side_b_pending_sector = v_sector, side_b_pending_auto = false
    where id = p_match_id;

  perform pvp_try_resolve_round(p_match_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- pvp_auto_pick_side / pvp_catch_up_round_timeouts: replace
-- pvp_auto_pass_turn/pvp_catch_up_timeouts. On a round's 20s deadline
-- passing, whichever side hasn't picked gets a uniformly random unused
-- sector auto-assigned.
-- ---------------------------------------------------------------------------

create or replace function pvp_auto_pick_side(p_match_id uuid, p_side text)
returns void
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_sector text;
  v_used text[];
begin
  select * into v_match from pvp_matches where id = p_match_id for update;
  if v_match.status <> 'active' then
    return;
  end if;
  if p_side = 'a' and v_match.side_a_pending_sector is not null then
    return;
  end if;
  if p_side = 'b' and v_match.side_b_pending_sector is not null then
    return;
  end if;

  select coalesce(array_agg(sector_a), array[]::text[]) || coalesce(array_agg(sector_b), array[]::text[])
    into v_used
    from pvp_match_events where match_id = p_match_id;

  select s.sector into v_sector
  from unnest(array[
    'economy', 'social', 'safety', 'innovation', 'productivity',
    'infrastructure', 'environment', 'immigration', 'housing', 'culture'
  ]) as s(sector)
  where s.sector <> all (v_used)
  order by random()
  limit 1;

  if p_side = 'a' then
    update pvp_matches set side_a_pending_sector = v_sector, side_a_pending_auto = true
      where id = p_match_id;
  else
    update pvp_matches set side_b_pending_sector = v_sector, side_b_pending_auto = true
      where id = p_match_id;
  end if;

  perform pvp_try_resolve_round(p_match_id);
end;
$$;

create or replace function pvp_catch_up_round_timeouts(p_match_id uuid)
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
    exit when v_iterations > 20; -- generous bound; max possible rounds is 5

    select status, round_deadline into v_status, v_deadline from pvp_matches where id = p_match_id;
    exit when v_status <> 'active';
    exit when now() <= v_deadline;

    perform pvp_auto_pick_side(p_match_id, 'a');
    perform pvp_auto_pick_side(p_match_id, 'b');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- pvp_get_match_state: rotated to "mine vs opponent's" so the client never
-- has to branch on side_a/side_b, and returns a per-ROUND array (not the
-- old flat 10-sector grid) as the primary reveal-sequencing data structure
-- - the frontend derives the 10-tile grid from this. Never leaks the
-- opponent's in-progress pick: myPendingSector only ever reflects the
-- caller's own pick, opponentHasPicked is a content-free boolean.
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
  v_rounds jsonb;
  v_my_pending text;
  v_opponent_has_picked boolean;
begin
  select * into v_match from pvp_matches where id = p_match_id;
  v_my_side := case when v_match.side_a_country_id = p_country_id then 'a' else 'b' end;

  select * into v_my_country from countries where id = p_country_id;
  select * into v_opponent_country from countries where id =
    (case when v_my_side = 'a' then v_match.side_b_country_id else v_match.side_a_country_id end);

  if v_my_side = 'a' then
    v_my_pending := v_match.side_a_pending_sector;
    v_opponent_has_picked := v_match.side_b_pending_sector is not null;
  else
    v_my_pending := v_match.side_b_pending_sector;
    v_opponent_has_picked := v_match.side_a_pending_sector is not null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'roundNumber', r.n,
    'resolved', e.id is not null,
    'mySector', case when v_my_side = 'a' then e.sector_a else e.sector_b end,
    'opponentSector', case when v_my_side = 'a' then e.sector_b else e.sector_a end,
    'sameSector', (e.sector_a = e.sector_b),
    'myScoreOnMySector', case when v_my_side = 'a' then e.score_a_on_sector_a else e.score_b_on_sector_b end,
    'opponentScoreOnMySector', case when v_my_side = 'a' then e.score_b_on_sector_a else e.score_a_on_sector_b end,
    'myScoreOnOpponentSector', case when v_my_side = 'a' then e.score_a_on_sector_b else e.score_b_on_sector_a end,
    'opponentScoreOnOpponentSector', case when v_my_side = 'a' then e.score_b_on_sector_b else e.score_a_on_sector_a end,
    'myPoints', case when v_my_side = 'a' then e.side_a_points else e.side_b_points end,
    'opponentPoints', case when v_my_side = 'a' then e.side_b_points else e.side_a_points end,
    'myAutoPicked', case when v_my_side = 'a' then e.side_a_auto_picked else e.side_b_auto_picked end,
    'opponentAutoPicked', case when v_my_side = 'a' then e.side_b_auto_picked else e.side_a_auto_picked end
  ) order by r.n), '[]'::jsonb) into v_rounds
  from generate_series(1, v_match.rounds_total) as r(n)
  left join pvp_match_events e on e.match_id = p_match_id and e.round_number = r.n;

  return jsonb_build_object(
    'matchId', v_match.id,
    'status', v_match.status,
    'mySide', v_my_side,
    'sideACountryId', v_match.side_a_country_id,
    'sideBCountryId', v_match.side_b_country_id,
    'roundNumber', v_match.round_number,
    'roundsTotal', v_match.rounds_total,
    'roundDeadline', v_match.round_deadline,
    'myPendingSector', v_my_pending,
    'opponentHasPicked', v_opponent_has_picked,
    'myPoints', case when v_my_side = 'a' then v_match.side_a_points else v_match.side_b_points end,
    'opponentPoints', case when v_my_side = 'a' then v_match.side_b_points else v_match.side_a_points end,
    'winnerCountryId', v_match.winner_country_id,
    'isDraw', v_match.is_draw,
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
    'rounds', v_rounds
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- find_match(): matchmaking/queue/cooldown/band-matching logic is
-- UNCHANGED - only the match-row creation tail needs the new columns.
-- Bot matches materialize the bot's round-1 pick immediately so it's ready
-- before the human's very first poll.
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
      round_number, round_deadline
    ) values (
      v_match_id, p_country_id, v_opponent.country_id, false,
      1, now() + interval '20 seconds'
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
-- poll_match(): unchanged signature; body now catches up round timeouts,
-- materializes the bot's pick if due, and returns the reshaped state.
-- ---------------------------------------------------------------------------

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

  perform pvp_catch_up_round_timeouts(p_match_id);
  perform pvp_materialize_bot_pick(p_match_id);

  return jsonb_build_object('ok', true) || pvp_get_match_state(p_match_id, p_country_id);
end;
$$;

grant execute on function poll_match(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_pick(): replaces submit_attack. No "whose turn" gate anymore -
-- either side may submit at any time, once, per round. Takes its own row
-- lock for the check-and-set (new: the old model's "your turn" check made
-- this unnecessary, this model's blind-simultaneous picks need it to close
-- the double-submit-by-the-same-side race).
-- ---------------------------------------------------------------------------

create or replace function submit_pick(p_match_id uuid, p_country_id uuid, p_sector text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_match pvp_matches%rowtype;
  v_side text;
begin
  select user_id into v_owner from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select * into v_match from pvp_matches where id = p_match_id;
  if p_country_id <> v_match.side_a_country_id and p_country_id <> v_match.side_b_country_id then
    raise exception 'not authorized';
  end if;

  perform pvp_catch_up_round_timeouts(p_match_id);
  perform pvp_materialize_bot_pick(p_match_id);

  select * into v_match from pvp_matches where id = p_match_id for update;

  if v_match.status <> 'active' then
    return jsonb_build_object('ok', true) || pvp_get_match_state(p_match_id, p_country_id);
  end if;

  v_side := case when p_country_id = v_match.side_a_country_id then 'a' else 'b' end;

  if (v_side = 'a' and v_match.side_a_pending_sector is not null)
     or (v_side = 'b' and v_match.side_b_pending_sector is not null) then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_PICKED')
      || pvp_get_match_state(p_match_id, p_country_id);
  end if;

  if p_sector not in (
    'economy', 'social', 'safety', 'innovation', 'productivity',
    'infrastructure', 'environment', 'immigration', 'housing', 'culture'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_SECTOR')
      || pvp_get_match_state(p_match_id, p_country_id);
  end if;

  if exists (
    select 1 from pvp_match_events
    where match_id = p_match_id and (sector_a = p_sector or sector_b = p_sector)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'SECTOR_ALREADY_USED')
      || pvp_get_match_state(p_match_id, p_country_id);
  end if;

  update pvp_matches set
    side_a_pending_sector = case when v_side = 'a' then p_sector else side_a_pending_sector end,
    side_b_pending_sector = case when v_side = 'b' then p_sector else side_b_pending_sector end,
    side_a_pending_auto = case when v_side = 'a' then false else side_a_pending_auto end,
    side_b_pending_auto = case when v_side = 'b' then false else side_b_pending_auto end
  where id = p_match_id;

  perform pvp_try_resolve_round(p_match_id);

  return jsonb_build_object('ok', true) || pvp_get_match_state(p_match_id, p_country_id);
end;
$$;

grant execute on function submit_pick(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- get_recent_matches(): column rename (side_a_wins/side_b_wins ->
-- side_a_points/side_b_points) + is_draw. Dropped and recreated since the
-- return table shape changed (Postgres won't let CREATE OR REPLACE change a
-- table-returning function's column list).
-- ---------------------------------------------------------------------------

create or replace function get_recent_matches(p_country_id uuid, p_limit int default 20)
returns table (
  id uuid,
  side_a_country_id uuid,
  side_a_name text,
  side_b_country_id uuid,
  side_b_name text,
  winner_country_id uuid,
  is_draw boolean,
  payout_amount numeric,
  forfeited boolean,
  side_a_points int,
  side_b_points int,
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
           m.winner_country_id, m.is_draw, m.payout_amount, (m.forfeited_by is not null),
           m.side_a_points, m.side_b_points, m.completed_at
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
