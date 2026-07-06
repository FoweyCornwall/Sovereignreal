-- Sovereign MVP schema: profiles, countries, sectors, policy library,
-- active policies, GDP history, RLS, and the lazy-settle/enact/leaderboard
-- functions. See /root/.claude/plans/intent-goal-sovereign-calm-kahan.md
-- (or the equivalent plan doc) for the design rationale.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table countries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null,
  flag_emoji text,
  flag_style jsonb,
  country_code text,
  gdp numeric(14, 3) not null default 0,
  gdp_per_sec numeric(10, 4) not null default 0,
  treasury numeric(14, 3) not null default 1000,
  treasury_regen_per_sec numeric(10, 4) not null default 0.5,
  last_settled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index countries_gdp_idx on countries (gdp desc);

create table sector_state (
  country_id uuid not null references countries (id) on delete cascade,
  sector text not null check (
    sector in (
      'economy', 'social', 'safety', 'innovation', 'productivity',
      'infrastructure', 'environment', 'immigration', 'housing', 'culture'
    )
  ),
  score numeric(10, 3) not null default 0,
  previous_score numeric(10, 3) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (country_id, sector)
);

create table policy_library (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  title text not null,
  description text,
  tier smallint not null check (tier between 1 and 5),
  primary_sector text not null check (
    primary_sector in (
      'economy', 'social', 'safety', 'innovation', 'productivity',
      'infrastructure', 'environment', 'immigration', 'housing', 'culture'
    )
  ),
  stat_deltas jsonb not null,
  base_cost numeric(10, 3) not null,
  duration_seconds integer not null check (duration_seconds > 0 and duration_seconds <= 172800),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table active_policies (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries (id) on delete cascade,
  policy_id uuid not null references policy_library (id),
  tier smallint not null,
  cost_paid numeric(10, 3) not null,
  stat_deltas jsonb not null,
  started_at timestamptz not null default now(),
  completes_at timestamptz not null,
  settled boolean not null default false,
  settled_at timestamptz
);
create index active_policies_pending_by_country_idx
  on active_policies (country_id) where not settled;
create index active_policies_pending_by_completion_idx
  on active_policies (completes_at) where not settled;

create view policy_history as
  select
    ap.id,
    ap.country_id,
    pl.title,
    pl.primary_sector,
    ap.stat_deltas,
    ap.cost_paid,
    ap.started_at,
    ap.settled_at
  from active_policies ap
  join policy_library pl on pl.id = ap.policy_id
  where ap.settled = true;

create table gdp_history (
  id bigint generated always as identity primary key,
  country_id uuid not null references countries (id) on delete cascade,
  gdp numeric(14, 3) not null,
  recorded_at timestamptz not null default now()
);
create index gdp_history_country_time_idx on gdp_history (country_id, recorded_at);

-- ---------------------------------------------------------------------------
-- New-user bootstrap
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table countries enable row level security;
alter table sector_state enable row level security;
alter table policy_library enable row level security;
alter table active_policies enable row level security;
alter table gdp_history enable row level security;

create policy "own profile rw" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own country rw" on countries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own sector_state rw" on sector_state
  for all using (
    exists (select 1 from countries c where c.id = sector_state.country_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from countries c where c.id = sector_state.country_id and c.user_id = auth.uid())
  );

create policy "policy library public read" on policy_library
  for select using (true);

create policy "own active_policies rw" on active_policies
  for all using (
    exists (select 1 from countries c where c.id = active_policies.country_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from countries c where c.id = active_policies.country_id and c.user_id = auth.uid())
  );

create policy "own gdp_history rw" on gdp_history
  for all using (
    exists (select 1 from countries c where c.id = gdp_history.country_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from countries c where c.id = gdp_history.country_id and c.user_id = auth.uid())
  );

-- Note: countries has no broad cross-user SELECT policy on purpose. RLS can
-- only restrict rows, not columns, so a plain "authenticated can select"
-- policy here would also leak `treasury` to other players. Cross-user reads
-- go exclusively through the security-definer functions below.

-- ---------------------------------------------------------------------------
-- Lazy-settle core (security invoker - relies on the owner-only RLS above)
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
  v_new_gdp_per_sec numeric;
begin
  select * into v_country from countries where id = p_country_id for update;
  if not found then
    raise exception 'country not found';
  end if;

  v_cursor_time := v_country.last_settled_at;

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

    select coalesce(sum(
      ss.score * (case ss.sector
        when 'economy' then 0.20 when 'productivity' then 0.15
        when 'innovation' then 0.12 when 'infrastructure' then 0.12
        when 'social' then 0.09 when 'safety' then 0.08
        when 'environment' then 0.08 when 'housing' then 0.06
        when 'immigration' then 0.05 when 'culture' then 0.05
      end)
    ), 0) * 1000 into v_new_gdp_per_sec
    from sector_state ss
    where ss.country_id = p_country_id;

    v_country.gdp_per_sec := v_new_gdp_per_sec;
    v_country.treasury_regen_per_sec := 0.5 + 0.01 * v_country.gdp;
  end loop;

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

grant execute on function settle_country(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enact a policy: settle first, then check funds and queue it, atomically.
-- ---------------------------------------------------------------------------

create or replace function enact_policy(p_country_id uuid, p_policy_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_country countries%rowtype;
  v_policy policy_library%rowtype;
  v_active active_policies%rowtype;
begin
  perform settle_country(p_country_id);

  select * into v_country from countries where id = p_country_id for update;
  if not found then
    raise exception 'country not found';
  end if;

  select * into v_policy from policy_library where id = p_policy_id and is_active = true;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'POLICY_NOT_FOUND');
  end if;

  if v_country.treasury < v_policy.base_cost then
    return jsonb_build_object(
      'ok', false,
      'reason', 'INSUFFICIENT_FUNDS',
      'shortfall', v_policy.base_cost - v_country.treasury
    );
  end if;

  update countries set treasury = treasury - v_policy.base_cost where id = p_country_id;

  insert into active_policies (country_id, policy_id, tier, cost_paid, stat_deltas, started_at, completes_at)
  values (
    p_country_id, v_policy.id, v_policy.tier, v_policy.base_cost, v_policy.stat_deltas,
    now(), now() + (v_policy.duration_seconds || ' seconds')::interval
  )
  returning * into v_active;

  return jsonb_build_object('ok', true, 'active_policy', row_to_json(v_active));
end;
$$;

grant execute on function enact_policy(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Leaderboard (security definer - the only cross-user read path)
-- ---------------------------------------------------------------------------

create or replace function get_leaderboard(p_limit int default 100)
returns table (
  country_id uuid, name text, flag_emoji text, flag_style jsonb, gdp numeric, rank bigint
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select id, name, flag_emoji, flag_style, gdp,
         row_number() over (order by gdp desc) as rank
  from countries
  order by gdp desc
  limit p_limit;
$$;

grant execute on function get_leaderboard(int) to authenticated;

create or replace function get_my_rank(p_country_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_gdp numeric;
  v_rank bigint;
begin
  select user_id, gdp into v_owner, v_gdp from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select count(*) + 1 into v_rank from countries where gdp > v_gdp;
  return v_rank;
end;
$$;

grant execute on function get_my_rank(uuid) to authenticated;
