-- Replaces the instant-resolve PvP system (0018_pvp.sql) with a turn-based
-- hex-grid supply-chain strategy board. Still no websockets/cron: both
-- clients poll poll_match() every ~1.2s (same cadence/idempotent-poll
-- pattern as the old find_battle()), and every RPC lazily catches up any
-- elapsed turn timeouts before doing its own work - the same "lazy settle"
-- philosophy as settle_country(), just applied to turn state.
--
-- Board: a fixed, hand-authored, symmetric radius-3 hex board (37 tiles,
-- axial coordinates). Home bases 6 hexes apart with a Trade Hub at the
-- midpoint; 5 Oil / 5 Tech / 5 Agriculture nodes; the rest neutral filler.
-- Every match reuses the identical template - this guarantees fairness and
-- is far simpler to build/test than procedural generation (a v2 could add
-- alternate hand-authored templates for variety).
--
-- Turns: live/synchronous, 20s per turn, 16 turns per side (32 plies). A
-- missed timer auto-passes that turn (match continues) rather than
-- forfeiting. Each turn gives 3 Action Points; claiming a hex costs 1 AP,
-- or 2 AP if the target is adjacent to an enemy-owned tile (the
-- "asymmetric sabotage" friction that lets a low-GDP player cheaply lock
-- down a defensible pocket).
--
-- Connectivity/blockade: a tile is traversable for a side if it is not
-- owned by the opponent (owned-by-me or neutral). A resource node's income
-- only counts while a path of traversable tiles reaches it from that
-- side's home base - so a previously-connected node can go dark the
-- instant a neutral bottleneck tile flips to enemy ownership. Recomputed
-- via a recursive flood-fill CTE after every claim.
--
-- GDP-based income cap: >=10B GDP counts up to 15 connected resource
-- nodes' income per turn, otherwise 10 - only the top-N-by-value nodes
-- actually pay out when over cap. This threshold is deliberately its own
-- constant, independent of rank_tier_for_gdp()'s matchmaking tiers, so two
-- same-tier matched opponents can still land on opposite sides of it.
--
-- Market Saturation: a side that owns all 5 nodes of a resource type
-- crashes that resource's income to $0 for both sides (including their
-- own) for the next 4 plies (~2 turns each) - monopolizing a resource is
-- a real risk, not a free bonus.
--
-- Bots play inline: whenever the active turn belongs to a bot, the same
-- RPC call that advanced the turn immediately plays the bot's entire turn
-- (greedy value/cost claiming) before returning - a human never observes
-- a separate "bot is thinking" state.
--
-- Win condition: after 32 plies, higher cumulative in-match cash wins and
-- takes 10% of the loser's real treasury (mirrors the old loot %). Exact
-- ties are a draw, no transfer.

-- ---------------------------------------------------------------------------
-- Drop the old instant-resolve system.
-- ---------------------------------------------------------------------------

drop function if exists find_battle(uuid);
drop function if exists cancel_battle_search(uuid);
drop function if exists get_recent_battles(uuid, int);
drop function if exists resolve_battle(uuid, uuid, boolean);
drop table if exists battles;
drop table if exists battle_queue;
drop table if exists battle_cooldowns;

-- rank_tier_for_gdp() is unchanged and kept as-is - still used for
-- matchmaking tier-bucketing below.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

create table pvp_queue (
  country_id uuid primary key references countries (id) on delete cascade,
  rank_tier text not null,
  is_vip boolean not null default false,
  queued_at timestamptz not null default now()
);
alter table pvp_queue enable row level security;
-- No client policies - only find_match() (security definer) touches this.

create table pvp_cooldowns (
  attacker_id uuid not null references countries (id) on delete cascade,
  defender_id uuid not null references countries (id) on delete cascade,
  last_attacked_at timestamptz not null,
  primary key (attacker_id, defender_id)
);
alter table pvp_cooldowns enable row level security;
-- No client policies - internal bookkeeping only.

create table pvp_matches (
  id uuid primary key default gen_random_uuid(),
  side_a_country_id uuid not null references countries (id) on delete cascade,
  side_b_country_id uuid not null references countries (id) on delete cascade,
  side_b_is_bot boolean not null default false,
  status text not null default 'active' check (status in ('active', 'completed')),
  current_turn_country_id uuid not null,
  turn_number int not null default 1,
  turns_per_side int not null default 16,
  turn_deadline timestamptz not null,
  side_a_ap_remaining int not null default 3,
  side_b_ap_remaining int not null default 3,
  side_a_cash numeric not null default 0,
  side_b_cash numeric not null default 0,
  oil_saturated_until_turn int,
  tech_saturated_until_turn int,
  agriculture_saturated_until_turn int,
  winner_country_id uuid references countries (id),
  payout_amount numeric,
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

create table pvp_match_tiles (
  match_id uuid not null references pvp_matches (id) on delete cascade,
  q int not null,
  r int not null,
  tile_type text not null check (
    tile_type in ('home_a', 'home_b', 'hub', 'oil', 'tech', 'agriculture', 'neutral')
  ),
  owner_country_id uuid references countries (id),
  connected_a boolean not null default false,
  connected_b boolean not null default false,
  primary key (match_id, q, r)
);
alter table pvp_match_tiles enable row level security;
create policy "own match tiles read" on pvp_match_tiles
  for select using (
    exists (
      select 1 from pvp_matches m
      join countries c on c.id in (m.side_a_country_id, m.side_b_country_id)
      where m.id = pvp_match_tiles.match_id and c.user_id = auth.uid()
    )
  );

create table pvp_match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references pvp_matches (id) on delete cascade,
  turn_number int not null,
  country_id uuid references countries (id),
  event_type text not null check (
    event_type in ('claim', 'auto_pass', 'saturation', 'match_end')
  ),
  q int,
  r int,
  detail jsonb,
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

create index pvp_match_events_match_idx on pvp_match_events (match_id, created_at);

-- ---------------------------------------------------------------------------
-- Pure helpers
-- ---------------------------------------------------------------------------

-- New, independent of rank_tier_for_gdp()'s matchmaking ladder - see header.
create or replace function pvp_route_cap_for_gdp(p_gdp numeric)
returns int
language sql
immutable
as $$
  select case when p_gdp >= 10000000000 then 15 else 10 end;
$$;

create or replace function pvp_hex_adjacent(q1 int, r1 int, q2 int, r2 int)
returns boolean
language sql
immutable
as $$
  select (q1 <> q2 or r1 <> r2)
    and abs(q1 - q2) <= 1 and abs(r1 - r2) <= 1 and abs((q1 + r1) - (q2 + r2)) <= 1;
$$;

create or replace function pvp_tile_value(p_tile_type text)
returns int
language sql
immutable
as $$
  select case p_tile_type
    when 'hub' then 50
    when 'oil' then 40
    when 'tech' then 30
    when 'agriculture' then 20
    else 0
  end;
$$;

-- ---------------------------------------------------------------------------
-- Board seeding - fixed, hand-authored, symmetric radius-3 template (37
-- tiles). Node counts (5 per resource type) are chosen so majority = 3,
-- matching the spec's own "3 Oil" example exactly.
-- ---------------------------------------------------------------------------

create or replace function pvp_seed_board(p_match_id uuid, p_side_a uuid, p_side_b uuid)
returns void
language plpgsql
as $$
begin
  insert into pvp_match_tiles (match_id, q, r, tile_type, owner_country_id) values
    (p_match_id, -3, 0, 'home_a', p_side_a),
    (p_match_id, 3, 0, 'home_b', p_side_b),
    (p_match_id, 0, 0, 'hub', null),
    (p_match_id, -1, 2, 'oil', null),
    (p_match_id, 1, -2, 'oil', null),
    (p_match_id, -1, 1, 'oil', null),
    (p_match_id, 1, -1, 'oil', null),
    (p_match_id, 0, -2, 'oil', null),
    (p_match_id, -1, 3, 'tech', null),
    (p_match_id, 1, -3, 'tech', null),
    (p_match_id, 0, -1, 'tech', null),
    (p_match_id, 0, 1, 'tech', null),
    (p_match_id, 0, 2, 'tech', null),
    (p_match_id, -2, 3, 'agriculture', null),
    (p_match_id, 2, -3, 'agriculture', null),
    (p_match_id, -2, 2, 'agriculture', null),
    (p_match_id, 2, -2, 'agriculture', null),
    (p_match_id, -1, 0, 'agriculture', null),
    (p_match_id, -3, 1, 'neutral', null),
    (p_match_id, -3, 2, 'neutral', null),
    (p_match_id, -3, 3, 'neutral', null),
    (p_match_id, -2, -1, 'neutral', null),
    (p_match_id, -2, 0, 'neutral', null),
    (p_match_id, -2, 1, 'neutral', null),
    (p_match_id, -1, -2, 'neutral', null),
    (p_match_id, -1, -1, 'neutral', null),
    (p_match_id, 0, -3, 'neutral', null),
    (p_match_id, 0, 3, 'neutral', null),
    (p_match_id, 1, 0, 'neutral', null),
    (p_match_id, 1, 1, 'neutral', null),
    (p_match_id, 1, 2, 'neutral', null),
    (p_match_id, 2, -1, 'neutral', null),
    (p_match_id, 2, 0, 'neutral', null),
    (p_match_id, 2, 1, 'neutral', null),
    (p_match_id, 3, -3, 'neutral', null),
    (p_match_id, 3, -2, 'neutral', null),
    (p_match_id, 3, -1, 'neutral', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Connectivity: flood-fill from each home base over tiles not owned by the
-- opponent (owned-by-me or neutral). Recomputed after every claim.
-- ---------------------------------------------------------------------------

create or replace function pvp_recompute_connectivity(p_match_id uuid)
returns void
language plpgsql
as $$
declare
  v_side_a uuid;
  v_side_b uuid;
  v_home_a_q int;
  v_home_a_r int;
  v_home_b_q int;
  v_home_b_r int;
begin
  select side_a_country_id, side_b_country_id into v_side_a, v_side_b
    from pvp_matches where id = p_match_id;

  select q, r into v_home_a_q, v_home_a_r
    from pvp_match_tiles where match_id = p_match_id and tile_type = 'home_a';
  select q, r into v_home_b_q, v_home_b_r
    from pvp_match_tiles where match_id = p_match_id and tile_type = 'home_b';

  with recursive reach_a(q, r) as (
    select v_home_a_q, v_home_a_r
    union
    select t.q, t.r
    from pvp_match_tiles t
    join reach_a ra on pvp_hex_adjacent(t.q, t.r, ra.q, ra.r)
    where t.match_id = p_match_id
      and (t.owner_country_id is null or t.owner_country_id = v_side_a)
  )
  update pvp_match_tiles t
    set connected_a = exists (
      select 1 from reach_a ra where ra.q = t.q and ra.r = t.r
    )
    where t.match_id = p_match_id;

  with recursive reach_b(q, r) as (
    select v_home_b_q, v_home_b_r
    union
    select t.q, t.r
    from pvp_match_tiles t
    join reach_b rb on pvp_hex_adjacent(t.q, t.r, rb.q, rb.r)
    where t.match_id = p_match_id
      and (t.owner_country_id is null or t.owner_country_id = v_side_b)
  )
  update pvp_match_tiles t
    set connected_b = exists (
      select 1 from reach_b rb where rb.q = t.q and rb.r = t.r
    )
    where t.match_id = p_match_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Income: sum of connected+owned resource node values, capped at the top-N
-- by value where N is the GDP-based route cap.
-- ---------------------------------------------------------------------------

create or replace function pvp_compute_income(p_match_id uuid, p_side text)
returns numeric
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_country_id uuid;
  v_gdp numeric;
  v_cap int;
  v_total numeric := 0;
  v_count int := 0;
  v_saturated_oil boolean;
  v_saturated_tech boolean;
  v_saturated_agri boolean;
  rec record;
begin
  select * into v_match from pvp_matches where id = p_match_id;
  v_country_id := case when p_side = 'a' then v_match.side_a_country_id else v_match.side_b_country_id end;

  select gdp into v_gdp from countries where id = v_country_id;
  v_cap := pvp_route_cap_for_gdp(coalesce(v_gdp, 0));

  v_saturated_oil := coalesce(v_match.oil_saturated_until_turn, 0) >= v_match.turn_number;
  v_saturated_tech := coalesce(v_match.tech_saturated_until_turn, 0) >= v_match.turn_number;
  v_saturated_agri := coalesce(v_match.agriculture_saturated_until_turn, 0) >= v_match.turn_number;

  for rec in
    select
      case
        when t.tile_type = 'oil' and v_saturated_oil then 0
        when t.tile_type = 'tech' and v_saturated_tech then 0
        when t.tile_type = 'agriculture' and v_saturated_agri then 0
        else pvp_tile_value(t.tile_type)
      end as value
    from pvp_match_tiles t
    where t.match_id = p_match_id
      and t.owner_country_id = v_country_id
      and t.tile_type in ('hub', 'oil', 'tech', 'agriculture')
      and (case when p_side = 'a' then t.connected_a else t.connected_b end)
    order by value desc
  loop
    exit when v_count >= v_cap;
    v_total := v_total + rec.value;
    v_count := v_count + 1;
  end loop;

  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Claim: validates adjacency/ownership/AP, applies the claim, recomputes
-- connectivity, checks market saturation, logs the event, and auto-ends
-- the turn if AP hits 0. Shared by both human submit_claim() and the bot AI.
-- ---------------------------------------------------------------------------

create or replace function pvp_claim_tile(p_match_id uuid, p_side text, p_q int, p_r int)
returns jsonb
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_claiming_country uuid;
  v_opponent_country uuid;
  v_tile pvp_match_tiles%rowtype;
  v_cost int;
  v_ap_remaining int;
  v_adjacent_to_mine boolean;
  v_adjacent_to_enemy boolean;
  v_owned_count int;
begin
  select * into v_match from pvp_matches where id = p_match_id for update;

  v_claiming_country := case when p_side = 'a' then v_match.side_a_country_id else v_match.side_b_country_id end;
  v_opponent_country := case when p_side = 'a' then v_match.side_b_country_id else v_match.side_a_country_id end;
  v_ap_remaining := case when p_side = 'a' then v_match.side_a_ap_remaining else v_match.side_b_ap_remaining end;

  select * into v_tile from pvp_match_tiles
    where match_id = p_match_id and q = p_q and r = p_r;

  if v_tile.match_id is null then
    return jsonb_build_object('ok', false, 'reason', 'TILE_NOT_FOUND');
  end if;
  if v_tile.tile_type in ('home_a', 'home_b') or v_tile.owner_country_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'TILE_NOT_CLAIMABLE');
  end if;

  select exists (
    select 1 from pvp_match_tiles t
    where t.match_id = p_match_id and t.owner_country_id = v_claiming_country
      and pvp_hex_adjacent(t.q, t.r, p_q, p_r)
  ) into v_adjacent_to_mine;

  if not v_adjacent_to_mine then
    return jsonb_build_object('ok', false, 'reason', 'NOT_ADJACENT');
  end if;

  select exists (
    select 1 from pvp_match_tiles t
    where t.match_id = p_match_id and t.owner_country_id = v_opponent_country
      and pvp_hex_adjacent(t.q, t.r, p_q, p_r)
  ) into v_adjacent_to_enemy;

  v_cost := case when v_adjacent_to_enemy then 2 else 1 end;

  if v_ap_remaining < v_cost then
    return jsonb_build_object('ok', false, 'reason', 'INSUFFICIENT_AP');
  end if;

  update pvp_match_tiles set owner_country_id = v_claiming_country
    where match_id = p_match_id and q = p_q and r = p_r;

  if p_side = 'a' then
    update pvp_matches set side_a_ap_remaining = side_a_ap_remaining - v_cost where id = p_match_id;
  else
    update pvp_matches set side_b_ap_remaining = side_b_ap_remaining - v_cost where id = p_match_id;
  end if;

  perform pvp_recompute_connectivity(p_match_id);

  insert into pvp_match_events (match_id, turn_number, country_id, event_type, q, r, detail)
    values (p_match_id, v_match.turn_number, v_claiming_country, 'claim', p_q, p_r,
            jsonb_build_object('cost', v_cost, 'tile_type', v_tile.tile_type));

  -- Market Saturation: full monopoly (all 5) of a resource type crashes its
  -- income to $0 for both sides for the next 4 plies (~2 turns each).
  if v_tile.tile_type in ('oil', 'tech', 'agriculture') then
    select count(*) into v_owned_count from pvp_match_tiles
      where match_id = p_match_id and tile_type = v_tile.tile_type
        and owner_country_id = v_claiming_country;

    if v_owned_count = 5 then
      if v_tile.tile_type = 'oil' then
        update pvp_matches set oil_saturated_until_turn = turn_number + 4 where id = p_match_id;
      elsif v_tile.tile_type = 'tech' then
        update pvp_matches set tech_saturated_until_turn = turn_number + 4 where id = p_match_id;
      else
        update pvp_matches set agriculture_saturated_until_turn = turn_number + 4 where id = p_match_id;
      end if;

      insert into pvp_match_events (match_id, turn_number, country_id, event_type, detail)
        values (p_match_id, v_match.turn_number, v_claiming_country, 'saturation',
                jsonb_build_object('resource', v_tile.tile_type));
    end if;
  end if;

  return jsonb_build_object('ok', true, 'q', p_q, 'r', p_r, 'cost', v_cost);
end;
$$;

-- ---------------------------------------------------------------------------
-- Turn advancement: credits income for the side whose turn just ended,
-- checks for match completion, otherwise flips the active side and resets
-- AP/timer. If the new active side is a bot, plays its entire turn inline
-- before returning.
-- ---------------------------------------------------------------------------

create or replace function pvp_finalize_match(p_match_id uuid)
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

  if v_match.side_a_cash > v_match.side_b_cash then
    v_winner := v_match.side_a_country_id;
    v_loser := v_match.side_b_country_id;
  elsif v_match.side_b_cash > v_match.side_a_cash then
    v_winner := v_match.side_b_country_id;
    v_loser := v_match.side_a_country_id;
  end if;

  if v_winner is not null then
    select treasury into v_loser_treasury from countries where id = v_loser;
    v_payout := coalesce(v_loser_treasury, 0) * 0.1;
    update countries set treasury = greatest(treasury - v_payout, 0) where id = v_loser;
    update countries set treasury = treasury + v_payout where id = v_winner;
  end if;

  update pvp_matches
    set status = 'completed', completed_at = now(),
        winner_country_id = v_winner, payout_amount = coalesce(v_payout, 0)
    where id = p_match_id;

  insert into pvp_match_events (match_id, turn_number, country_id, event_type, detail)
    values (p_match_id, v_match.turn_number, v_winner, 'match_end',
            jsonb_build_object('payout', coalesce(v_payout, 0)));

  insert into pvp_cooldowns (attacker_id, defender_id, last_attacked_at)
    values (v_match.side_a_country_id, v_match.side_b_country_id, now())
    on conflict (attacker_id, defender_id) do update set last_attacked_at = now();
  insert into pvp_cooldowns (attacker_id, defender_id, last_attacked_at)
    values (v_match.side_b_country_id, v_match.side_a_country_id, now())
    on conflict (attacker_id, defender_id) do update set last_attacked_at = now();
end;
$$;

create or replace function pvp_end_turn_and_advance(p_match_id uuid, p_auto_pass boolean)
returns void
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_ending_side text;
  v_ending_country uuid;
  v_income numeric;
  v_next_side_a boolean;
begin
  select * into v_match from pvp_matches where id = p_match_id for update;

  if v_match.status <> 'active' then
    return;
  end if;

  v_ending_side := case when v_match.current_turn_country_id = v_match.side_a_country_id then 'a' else 'b' end;
  v_ending_country := v_match.current_turn_country_id;
  v_income := pvp_compute_income(p_match_id, v_ending_side);

  if v_ending_side = 'a' then
    update pvp_matches set side_a_cash = side_a_cash + v_income where id = p_match_id;
  else
    update pvp_matches set side_b_cash = side_b_cash + v_income where id = p_match_id;
  end if;

  insert into pvp_match_events (match_id, turn_number, country_id, event_type, detail)
    values (p_match_id, v_match.turn_number, v_ending_country,
            case when p_auto_pass then 'auto_pass' else 'claim' end,
            jsonb_build_object('income', v_income, 'turn_end', true));

  if v_match.turn_number >= v_match.turns_per_side * 2 then
    perform pvp_finalize_match(p_match_id);
    return;
  end if;

  v_next_side_a := v_ending_side <> 'a';

  update pvp_matches set
    turn_number = turn_number + 1,
    current_turn_country_id = case when v_next_side_a then side_a_country_id else side_b_country_id end,
    turn_deadline = now() + interval '20 seconds',
    side_a_ap_remaining = case when v_next_side_a then 3 else side_a_ap_remaining end,
    side_b_ap_remaining = case when v_next_side_a then side_b_ap_remaining else 3 end
  where id = p_match_id;

  -- Bots play their entire turn inline, instantly - the human never
  -- observes a separate "bot is thinking" state.
  select * into v_match from pvp_matches where id = p_match_id;
  if v_match.side_b_is_bot and v_match.current_turn_country_id = v_match.side_b_country_id then
    perform pvp_play_bot_turn(p_match_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bot AI: deterministic, greedy value/cost claiming with a small bonus for
-- completing a monopoly or claiming near the enemy's home base/resources
-- (a cheap proxy for "blocking"), spending AP until it can't afford
-- anything else, then ending its own turn.
-- ---------------------------------------------------------------------------

create or replace function pvp_play_bot_turn(p_match_id uuid)
returns void
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_bot_country uuid;
  v_enemy_country uuid;
  v_ap_remaining int;
  v_best record;
  v_iterations int := 0;
begin
  select * into v_match from pvp_matches where id = p_match_id;
  v_bot_country := v_match.side_b_country_id;
  v_enemy_country := v_match.side_a_country_id;

  loop
    v_iterations := v_iterations + 1;
    exit when v_iterations > 10;

    select side_b_ap_remaining into v_ap_remaining from pvp_matches where id = p_match_id;
    exit when v_ap_remaining <= 0;

    select candidate.q, candidate.r, candidate.cost,
           (
             pvp_tile_value(candidate.tile_type)
             + case when candidate.would_monopolize then 100 else 0 end
             + case when candidate.near_enemy then 15 else 0 end
           )::numeric / candidate.cost as score
      into v_best
      from (
        select distinct t.q, t.r, t.tile_type,
          case when exists (
            select 1 from pvp_match_tiles e
            where e.match_id = p_match_id and e.owner_country_id = v_enemy_country
              and pvp_hex_adjacent(e.q, e.r, t.q, t.r)
          ) then 2 else 1 end as cost,
          exists (
            select 1 from pvp_match_tiles home
            where home.match_id = p_match_id and home.tile_type = 'home_a'
              and pvp_hex_adjacent(home.q, home.r, t.q, t.r)
          ) or exists (
            select 1 from pvp_match_tiles res
            where res.match_id = p_match_id and res.owner_country_id = v_enemy_country
              and pvp_hex_adjacent(res.q, res.r, t.q, t.r)
          ) as near_enemy,
          (
            t.tile_type in ('oil', 'tech', 'agriculture')
            and (
              select count(*) from pvp_match_tiles same
              where same.match_id = p_match_id and same.tile_type = t.tile_type
                and (same.owner_country_id = v_bot_country or (same.q = t.q and same.r = t.r))
            ) = 5
          ) as would_monopolize
        from pvp_match_tiles t
        where t.match_id = p_match_id
          and t.tile_type not in ('home_a', 'home_b')
          and t.owner_country_id is null
          and exists (
            select 1 from pvp_match_tiles mine
            where mine.match_id = p_match_id and mine.owner_country_id = v_bot_country
              and pvp_hex_adjacent(mine.q, mine.r, t.q, t.r)
          )
      ) candidate
      where candidate.cost <= v_ap_remaining
      order by score desc, candidate.q, candidate.r
      limit 1;

    exit when v_best.q is null;

    perform pvp_claim_tile(p_match_id, 'b', v_best.q, v_best.r);
  end loop;

  perform pvp_end_turn_and_advance(p_match_id, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Timeout catch-up: lazily auto-passes any turns whose deadline has
-- already elapsed, bounded so a very stale match can't loop forever.
-- ---------------------------------------------------------------------------

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

    perform pvp_end_turn_and_advance(p_match_id, true);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_match_state: the shared jsonb shape returned by poll_match(),
-- submit_claim(), and end_turn() so the client can use one merge function.
-- ---------------------------------------------------------------------------

create or replace function pvp_get_match_state(p_match_id uuid, p_country_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_tiles jsonb;
  v_my_side text;
begin
  select * into v_match from pvp_matches where id = p_match_id;
  v_my_side := case when v_match.side_a_country_id = p_country_id then 'a' else 'b' end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'q', t.q, 'r', t.r, 'tileType', t.tile_type,
    'ownerCountryId', t.owner_country_id,
    'connected', case when v_my_side = 'a' then t.connected_a else t.connected_b end
  )), '[]'::jsonb) into v_tiles
  from pvp_match_tiles t where t.match_id = p_match_id;

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
    'sideAApRemaining', v_match.side_a_ap_remaining,
    'sideBApRemaining', v_match.side_b_ap_remaining,
    'sideACash', v_match.side_a_cash,
    'sideBCash', v_match.side_b_cash,
    'oilSaturatedUntilTurn', v_match.oil_saturated_until_turn,
    'techSaturatedUntilTurn', v_match.tech_saturated_until_turn,
    'agricultureSaturatedUntilTurn', v_match.agriculture_saturated_until_turn,
    'winnerCountryId', v_match.winner_country_id,
    'payoutAmount', v_match.payout_amount,
    'tiles', v_tiles
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- find_match(): matchmaking entry point, direct adaptation of the old
-- find_battle() - same 1.2s/8s bot-fallback poll pattern and VIP-prefers-
-- VIP order-by (preserving the "Priority PvP matchmaking" perk).
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
      p_country_id, now() + interval '20 seconds'
    );
    perform pvp_seed_board(v_match_id, p_country_id, v_opponent.country_id);
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
  insert into pvp_matches (
    id, side_a_country_id, side_b_country_id, side_b_is_bot,
    current_turn_country_id, turn_deadline
  ) values (
    v_match_id, p_country_id, v_bot.id, true,
    p_country_id, now() + interval '20 seconds'
  );
  perform pvp_seed_board(v_match_id, p_country_id, v_bot.id);

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

-- ---------------------------------------------------------------------------
-- poll_match(): the in-match poll target - catches up any elapsed timeouts
-- then returns the full board+match state.
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

  perform pvp_catch_up_timeouts(p_match_id);

  return jsonb_build_object('ok', true) || pvp_get_match_state(p_match_id, p_country_id);
end;
$$;

grant execute on function poll_match(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_claim(): the move RPC.
-- ---------------------------------------------------------------------------

create or replace function submit_claim(p_match_id uuid, p_country_id uuid, p_q int, p_r int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_match pvp_matches%rowtype;
  v_side text;
  v_claim_result jsonb;
  v_ap_remaining int;
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
  v_claim_result := pvp_claim_tile(p_match_id, v_side, p_q, p_r);

  if (v_claim_result ->> 'ok')::boolean then
    select case when v_side = 'a' then side_a_ap_remaining else side_b_ap_remaining end
      into v_ap_remaining
      from pvp_matches where id = p_match_id;
    if v_ap_remaining <= 0 then
      perform pvp_end_turn_and_advance(p_match_id, false);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'claimResult', v_claim_result)
    || pvp_get_match_state(p_match_id, p_country_id);
end;
$$;

grant execute on function submit_claim(uuid, uuid, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- end_turn(): explicit early pass.
-- ---------------------------------------------------------------------------

create or replace function end_turn(p_match_id uuid, p_country_id uuid)
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

  perform pvp_catch_up_timeouts(p_match_id);
  select * into v_match from pvp_matches where id = p_match_id;

  if v_match.status = 'active' and v_match.current_turn_country_id = p_country_id then
    perform pvp_end_turn_and_advance(p_match_id, false);
  end if;

  return jsonb_build_object('ok', true) || pvp_get_match_state(p_match_id, p_country_id);
end;
$$;

grant execute on function end_turn(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_recent_matches(): history list, mirrors get_recent_battles().
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
  side_a_cash numeric,
  side_b_cash numeric,
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
           m.winner_country_id, m.payout_amount, m.side_a_cash, m.side_b_cash, m.completed_at
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
