-- T4/T5 policies became too expensive after every prior rebalance
-- (0005/0009/0013 compounded). Direct user ask: 30% cheaper across both
-- tiers, on top of everything already applied - a pure data update, no
-- formula/schema change.
update policy_library set base_cost = round(base_cost * 0.7) where tier in (4, 5);
