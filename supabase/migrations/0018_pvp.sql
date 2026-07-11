-- Real-time-ish PvP: no websockets/cron - the client polls find_battle()
-- every ~1.2s for up to ~8s looking for a live opponent in the same rank
-- tier; if none shows up in time, it auto-falls-back to a bot opponent.
-- Combat is resolved instantly (no turns): power = gdp scaled by safety/
-- innovation sector scores, times a random 0.85-1.15 modifier. Higher
-- power wins. Winner takes 10% of loser's treasury; attacker always pays
-- 1% of their own treasury as the cost of waging war, win or lose.

create table battle_queue (
  country_id uuid primary key references countries (id) on delete cascade,
  rank_tier text not null,
  is_vip boolean not null default false,
  queued_at timestamptz not null default now()
);
alter table battle_queue enable row level security;
-- No client policies - only find_battle() (security definer) touches this.

create table battles (
  id uuid primary key default gen_random_uuid(),
  attacker_id uuid not null references countries (id) on delete cascade,
  defender_id uuid not null references countries (id) on delete cascade,
  defender_is_bot boolean not null default false,
  winner_id uuid references countries (id),
  attacker_power numeric not null,
  defender_power numeric not null,
  loot_amount numeric not null default 0,
  created_at timestamptz not null default now()
);
alter table battles enable row level security;
create policy "own battles read" on battles
  for select using (
    exists (
      select 1 from countries c
      where c.id in (battles.attacker_id, battles.defender_id) and c.user_id = auth.uid()
    )
  );

create index battles_attacker_idx on battles (attacker_id, created_at desc);
create index battles_defender_idx on battles (defender_id, created_at desc);

create table battle_cooldowns (
  attacker_id uuid not null references countries (id) on delete cascade,
  defender_id uuid not null references countries (id) on delete cascade,
  last_attacked_at timestamptz not null,
  primary key (attacker_id, defender_id)
);
alter table battle_cooldowns enable row level security;
-- No client policies - internal bookkeeping only.

-- --------------------------------------------------------------------------
-- Mirrors lib/game/rankTiers.ts thresholds - keep in sync.
-- --------------------------------------------------------------------------

create or replace function rank_tier_for_gdp(p_gdp numeric)
returns text
language sql
immutable
as $$
  select case
    when p_gdp >= 1000000000000000 then 'Transcendent'
    when p_gdp >= 10000000000000 then 'Grandmaster'
    when p_gdp >= 1000000000000 then 'Master'
    when p_gdp >= 100000000000 then 'Diamond'
    when p_gdp >= 10000000000 then 'Platinum'
    when p_gdp >= 1000000000 then 'Gold'
    when p_gdp >= 100000000 then 'Silver'
    else 'Bronze'
  end;
$$;

-- --------------------------------------------------------------------------
-- Combat resolution, shared by both a live-player match and a bot fallback.
-- --------------------------------------------------------------------------

create or replace function resolve_battle(
  p_attacker_id uuid, p_defender_id uuid, p_defender_is_bot boolean
)
returns jsonb
language plpgsql
as $$
declare
  v_attacker countries%rowtype;
  v_defender countries%rowtype;
  v_attacker_safety numeric := 0;
  v_attacker_innovation numeric := 0;
  v_defender_safety numeric := 0;
  v_defender_innovation numeric := 0;
  v_attacker_power numeric;
  v_defender_power numeric;
  v_winner_id uuid;
  v_loot numeric;
  v_upkeep numeric;
  v_battle battles%rowtype;
begin
  select * into v_attacker from countries where id = p_attacker_id for update;
  select * into v_defender from countries where id = p_defender_id for update;

  select score into v_attacker_safety from sector_state
    where country_id = p_attacker_id and sector = 'safety';
  select score into v_attacker_innovation from sector_state
    where country_id = p_attacker_id and sector = 'innovation';

  if not p_defender_is_bot then
    select score into v_defender_safety from sector_state
      where country_id = p_defender_id and sector = 'safety';
    select score into v_defender_innovation from sector_state
      where country_id = p_defender_id and sector = 'innovation';
  end if;

  v_attacker_power := v_attacker.gdp
    * (1 + coalesce(v_attacker_safety, 0) / 200.0)
    * (1 + coalesce(v_attacker_innovation, 0) / 200.0)
    * (0.85 + random() * 0.3);

  v_defender_power := v_defender.gdp
    * (1 + coalesce(v_defender_safety, 0) / 200.0)
    * (1 + coalesce(v_defender_innovation, 0) / 200.0)
    * (0.85 + random() * 0.3);

  if v_attacker_power >= v_defender_power then
    v_winner_id := p_attacker_id;
  else
    v_winner_id := p_defender_id;
  end if;

  v_upkeep := v_attacker.treasury * 0.01;
  update countries set treasury = greatest(treasury - v_upkeep, 0) where id = p_attacker_id;

  if v_winner_id = p_attacker_id then
    v_loot := v_defender.treasury * 0.1;
    update countries set treasury = greatest(treasury - v_loot, 0) where id = p_defender_id;
    update countries set treasury = treasury + v_loot where id = p_attacker_id;
  else
    v_loot := v_attacker.treasury * 0.1;
    update countries set treasury = greatest(treasury - v_loot, 0) where id = p_attacker_id;
    update countries set treasury = treasury + v_loot where id = p_defender_id;
  end if;

  insert into battle_cooldowns (attacker_id, defender_id, last_attacked_at)
  values (p_attacker_id, p_defender_id, now())
  on conflict (attacker_id, defender_id) do update set last_attacked_at = now();

  insert into battles (
    attacker_id, defender_id, defender_is_bot, winner_id,
    attacker_power, defender_power, loot_amount
  ) values (
    p_attacker_id, p_defender_id, p_defender_is_bot, v_winner_id,
    v_attacker_power, v_defender_power, v_loot
  )
  returning * into v_battle;

  delete from battle_queue where country_id in (p_attacker_id, p_defender_id);

  return row_to_json(v_battle)::jsonb;
end;
$$;

-- --------------------------------------------------------------------------
-- find_battle(): the one entry point the client polls (~1.2s interval, up
-- to ~8s before giving up on a live opponent and fighting a bot instead).
-- Idempotent to call repeatedly - first call enqueues, later calls just
-- check for a match or time out into a bot fight.
-- --------------------------------------------------------------------------

create or replace function find_battle(p_country_id uuid)
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
begin
  select user_id into v_owner from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select * into v_country from countries where id = p_country_id;
  v_is_vip := is_vip(v_owner);
  v_rank_tier := rank_tier_for_gdp(v_country.gdp);

  select queued_at into v_queued_at from battle_queue where country_id = p_country_id;

  if v_queued_at is null then
    perform settle_country(p_country_id);
    insert into battle_queue (country_id, rank_tier, is_vip, queued_at)
    values (p_country_id, v_rank_tier, v_is_vip, now())
    on conflict (country_id) do nothing;
    v_queued_at := now();
  end if;

  -- Look for a live opponent: same rank tier, not myself, not on cooldown
  -- from me, not shielded (unless they're a bot, which can't happen here
  -- since only real players enqueue). VIPs prefer matching other VIPs
  -- first (priority matchmaking) via the order by.
  select bq.country_id, bq.is_vip into v_opponent
  from battle_queue bq
  join countries c on c.id = bq.country_id
  where bq.country_id <> p_country_id
    and bq.rank_tier = v_rank_tier
    and c.created_at < now() - interval '24 hours'
    and not exists (
      select 1 from battle_cooldowns bc
      where bc.attacker_id = p_country_id and bc.defender_id = bq.country_id
        and bc.last_attacked_at > now() - interval '30 minutes'
    )
  order by (bq.is_vip = v_is_vip) desc, bq.queued_at asc
  limit 1
  for update of bq skip locked;

  if v_opponent.country_id is not null then
    return jsonb_build_object(
      'ok', true, 'matched', true, 'is_bot', false,
      'battle', resolve_battle(p_country_id, v_opponent.country_id, false)
    );
  end if;

  -- No live opponent yet - keep waiting until the 8s window elapses.
  if now() - v_queued_at < interval '8 seconds' then
    return jsonb_build_object('ok', true, 'matched', false);
  end if;

  -- Timed out - fall back to a bot in the same rank tier (or any bot if
  -- none exist in this tier yet).
  select id into v_bot from countries
  where is_bot = true and rank_tier_for_gdp(gdp) = v_rank_tier
    and not exists (
      select 1 from battle_cooldowns bc
      where bc.attacker_id = p_country_id and bc.defender_id = countries.id
        and bc.last_attacked_at > now() - interval '30 minutes'
    )
  order by random()
  limit 1;

  if v_bot.id is null then
    select id into v_bot from countries
    where is_bot = true
    order by random()
    limit 1;
  end if;

  if v_bot.id is null then
    delete from battle_queue where country_id = p_country_id;
    return jsonb_build_object('ok', false, 'reason', 'NO_OPPONENT_AVAILABLE');
  end if;

  return jsonb_build_object(
    'ok', true, 'matched', true, 'is_bot', true,
    'battle', resolve_battle(p_country_id, v_bot.id, true)
  );
end;
$$;

grant execute on function find_battle(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- Cancel: leave the queue without fighting (e.g. player navigates away).
-- --------------------------------------------------------------------------

create or replace function cancel_battle_search(p_country_id uuid)
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

  delete from battle_queue where country_id = p_country_id;
end;
$$;

grant execute on function cancel_battle_search(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- Recent battle history for a country (for the /battles page).
-- --------------------------------------------------------------------------

create or replace function get_recent_battles(p_country_id uuid, p_limit int default 20)
returns table (
  id uuid,
  attacker_id uuid,
  attacker_name text,
  defender_id uuid,
  defender_name text,
  defender_is_bot boolean,
  winner_id uuid,
  loot_amount numeric,
  created_at timestamptz
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
    select b.id, b.attacker_id, ca.name, b.defender_id, cd.name, b.defender_is_bot,
           b.winner_id, b.loot_amount, b.created_at
    from battles b
    join countries ca on ca.id = b.attacker_id
    join countries cd on cd.id = b.defender_id
    where b.attacker_id = p_country_id or b.defender_id = p_country_id
    order by b.created_at desc
    limit p_limit;
end;
$$;

grant execute on function get_recent_battles(uuid, int) to authenticated;
