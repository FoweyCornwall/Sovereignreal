-- Bots high up on the leaderboard now get 5-15 random rebirths (was
-- capped at 6, weighted heavily toward 0-2). Rest of the visible bot
-- pool keeps the original weighted 0-6 distribution so mid/lower ranks
-- still show the "no correlation between rank and rebirth count" story.
--
-- "High up" = top 30 leaderboard-visible bots by GDP. Multiple bots
-- share values (guaranteed by random). Rebirths within the top 30 are
-- shuffled so rank position does not strictly correlate with rebirth
-- count - a bot at rank 12 might have 15 rebirths while rank 3 has 6.
--
-- Safe to re-run: both statements just re-randomize their targets.

-- Top 30 by GDP: random 5-15 rebirths.
with top_bots as (
  select id from countries
  where is_bot = true and show_on_leaderboard = true
  order by gdp desc
  limit 30
)
update countries c
  set prestige_count = 5 + floor(random() * 11)::int
  where c.id in (select id from top_bots);

-- Everyone else visible: original weighted 0-6 distribution.
update countries set prestige_count = case
  when random() < 0.35 then 0
  when random() < 0.60 then 1
  when random() < 0.80 then 2
  when random() < 0.92 then 3
  when random() < 0.98 then 4
  else 5 + floor(random() * 2)::int
end
where is_bot = true and show_on_leaderboard = true
  and id not in (
    select id from countries
    where is_bot = true and show_on_leaderboard = true
    order by gdp desc
    limit 30
  );
