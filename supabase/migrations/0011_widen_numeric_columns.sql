-- Bug fix: "numeric field overflow" on enact/settle. gdp/treasury and their
-- per-second rates were declared with far too little headroom
-- (numeric(14,3) / numeric(10,4)) for a game whose own rank ladder
-- (lib/game/rankTiers.ts) already goes up to 1,000,000,000,000,000
-- (Transcendent). treasury_regen_per_sec scales linearly with gdp
-- (0.5 + 0.01 * gdp), so once gdp reaches the tens of billions the rate
-- itself already exceeds numeric(10,4)'s ~1-million ceiling, and the
-- next settle/enact write overflows and aborts. Widened to plain
-- unbounded numeric so this can never happen again at any scale.
-- sector_state.score/previous_score are intentionally left untouched -
-- bounded at [0,100] by game logic, not by column precision.

alter table countries
  alter column gdp type numeric,
  alter column gdp_per_sec type numeric,
  alter column treasury type numeric,
  alter column treasury_regen_per_sec type numeric;

alter table gdp_history
  alter column gdp type numeric;

alter table policy_library
  alter column base_cost type numeric;

alter table active_policies
  alter column cost_paid type numeric;
