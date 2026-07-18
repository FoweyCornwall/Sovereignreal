-- Three changes:
--   1. pvp_ensure_bot_sector_state: also set the bot's treasury to
--      gdp * 0.30 right before populating sectors. Bots have treasury=0
--      at seed time (they don't tick like real players), so
--      pvp_finalize_match's 15% cut of loser treasury was landing at
--      0 on every human-vs-bot win. Giving bots a synthetic treasury
--      proportional to their GDP makes the loot pool meaningful again.
--   2. One-shot: top-10 leaderboard-visible bots by GDP get
--      is_vip_bot = true. Guarantees the very top of the visible board
--      shows the gold VIP ring.
--   3. Indexes on countries.gdp desc and countries.wins desc for the
--      get_leaderboard / get_leaderboard_wins order-bys. Cheap wins
--      given a 1100+ bot pool.

-- ---------------------------------------------------------------------------
-- 1. pvp_ensure_bot_sector_state: set treasury + populate sectors.
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
  -- Synthetic treasury so pvp_finalize_match's 15% cut is meaningful.
  -- Bots never tick their own treasury, so we seed it fresh per match.
  update countries
    set treasury = gdp * 0.30
    where id = p_bot_id;

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
        score = excluded.score,
        previous_score = excluded.previous_score,
        updated_at = excluded.updated_at;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. One-shot: top-10 leaderboard bots are VIP.
-- ---------------------------------------------------------------------------

with top_ten as (
  select id from countries
  where is_bot = true and show_on_leaderboard = true
  order by gdp desc
  limit 10
)
update countries set is_vip_bot = true where id in (select id from top_ten);

-- ---------------------------------------------------------------------------
-- 3. Leaderboard indexes.
-- ---------------------------------------------------------------------------

create index if not exists countries_gdp_desc_idx on countries (gdp desc);
create index if not exists countries_wins_desc_idx on countries (wins desc);
