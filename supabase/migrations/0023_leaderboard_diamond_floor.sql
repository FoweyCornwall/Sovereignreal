-- Direct user ask: the leaderboard must be "infested with bots" and read as
-- a real, populated top table - nothing below Diamond belongs on it, bot or
-- real player. 0022 already floors newly-seeded visible bots at Diamond GDP
-- and hides the weak bot pool via show_on_leaderboard, but that alone still
-- let two things through: (1) real players of any GDP were never filtered
-- at all, and (2) any bot rows seeded before 0022 (back when there was no
-- Diamond floor) default show_on_leaderboard=true and stay visible until
-- reseeded. Fixing get_leaderboard() to filter by GDP directly closes both
-- gaps regardless of reseed timing - it's the one true gate everyone passes
-- through. get_my_rank() is untouched: a player below Diamond still sees
-- their own true global rank pinned at the bottom of the page (existing
-- LeaderboardTable behavior), they just don't clutter the visible top list.

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
    where c.gdp >= 100000000000
      and (not c.is_bot or c.show_on_leaderboard)
    order by c.gdp desc
    limit p_limit;
end;
$$;

grant execute on function get_leaderboard(int) to authenticated;
