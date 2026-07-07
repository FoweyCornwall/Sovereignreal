-- Bug fix: migration 0009 lowered the sector score ceiling from 500 to 100
-- and taught settle_country to clamp scores to that ceiling, but only when a
-- policy delta actually touches a sector. Any sector that was already above
-- 100 at the moment 0009 ran (e.g. Safety sitting at 101.870 from the old
-- 500-point scale) just stays stuck above the cap forever, since nothing
-- ever writes to sector_state.score for it again. This backfills every
-- existing row down to the new ceiling and refreshes the cached
-- gdp_per_sec on every country so it reflects the corrected scores
-- immediately, rather than waiting for each country's next settle call.

update sector_state set score = 100, updated_at = now() where score > 100;
update sector_state set previous_score = 100 where previous_score > 100;

update countries set gdp_per_sec = compute_gdp_per_sec(id);
