-- Phase 2: bot GDP drift (lazily piggybacked on get_leaderboard(), since
-- bots are only ever observed through that one read path) and the
-- leaderboard function gaining username. Bot countries themselves
-- (is_bot/nullable user_id) were added in 0003_identity_credits_bots_schema.sql;
-- see scripts/seed-bots.ts for the actual bot rows.

create table bot_drift_state (
  id smallint primary key default 1 check (id = 1),
  last_drift_at timestamptz not null default now()
);
insert into bot_drift_state (id, last_drift_at) values (1, now());

-- Internal bookkeeping only - no client (anon or authenticated) ever needs
-- to touch this directly, only drift_bots_if_due() below (security definer,
-- so it bypasses RLS as the table owner). RLS enabled with zero policies
-- means it's fully unreachable via the client API.
alter table bot_drift_state enable row level security;

-- BOT_GDP_HARD_CAP = 8,000,000,000: comfortably inside Gold (starts at 1e9),
-- safely under the Platinum threshold (1e10) - no bot can ever cross into
-- Platinum regardless of how long the game runs. A small additive term
-- (not just multiplicative) lets zero-GDP bots start climbing too.
create or replace function drift_bots_if_due()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_last timestamptz;
  v_elapsed numeric;
begin
  select last_drift_at into v_last from bot_drift_state where id = 1 for update;
  v_elapsed := extract(epoch from (now() - v_last));

  if v_elapsed < 60 then
    return;
  end if;

  update countries
    set gdp = least(
      8000000000,
      gdp * (1 + random() * 0.002 * (v_elapsed / 60)) + random() * 500 * (v_elapsed / 60)
    )
  where is_bot = true;

  update bot_drift_state set last_drift_at = now() where id = 1;
end;
$$;

-- Rewritten: adds username, and now needs to be plpgsql (not sql) to call
-- drift_bots_if_due() first. Table-returning functions can't have their
-- output columns changed via CREATE OR REPLACE, so drop first.
drop function if exists get_leaderboard(int);

create or replace function get_leaderboard(p_limit int default 100)
returns table (
  country_id uuid, name text, username text, flag_emoji text, flag_style jsonb, gdp numeric, rank bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform drift_bots_if_due();

  return query
    select c.id, c.name, c.username, c.flag_emoji, c.flag_style, c.gdp,
           row_number() over (order by c.gdp desc) as rank
    from countries c
    order by c.gdp desc
    limit p_limit;
end;
$$;

grant execute on function get_leaderboard(int) to authenticated;
