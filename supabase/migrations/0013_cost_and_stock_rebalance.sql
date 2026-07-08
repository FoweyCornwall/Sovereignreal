-- Late-game rebalance: T4/T5 base costs way up, and store stock in the
-- thousands so scarcity + decay actually feel meaningful. Existing
-- previously-rerolled slots keep their old quantity until the next 15-min
-- restock - acceptable, the store rerolls itself.

-- --------------------------------------------------------------------------
-- 1. Cost bump: T4 x150, T5 x500 (on top of every previous bump in 0005/0009)
-- --------------------------------------------------------------------------
update policy_library set base_cost = round(base_cost * 150) where tier = 4;
update policy_library set base_cost = round(base_cost * 500) where tier = 5;

-- --------------------------------------------------------------------------
-- 2. Rewrite reroll_store_slots() with the new stock ranges (was ~40x smaller).
-- --------------------------------------------------------------------------
create or replace function reroll_store_slots()
returns void
language plpgsql
as $$
declare
  v_position smallint;
  v_tier smallint;
  v_policy_id uuid;
  v_min int;
  v_max int;
  v_qty int;
  v_chosen uuid[] := '{}';
begin
  for v_position in 1..6 loop
    v_tier := pick_weighted_tier();

    select id into v_policy_id
    from policy_library
    where tier = v_tier and is_active = true and not (id = any(v_chosen))
    order by random()
    limit 1;

    if v_policy_id is null then
      select id into v_policy_id
      from policy_library
      where is_active = true and not (id = any(v_chosen))
      order by random()
      limit 1;
    end if;

    v_chosen := v_chosen || v_policy_id;

    v_min := case v_tier when 1 then 2000 when 2 then 1000 when 3 then 400 when 4 then 100 else 30 end;
    v_max := case v_tier when 1 then 5000 when 2 then 2500 when 3 then 1000 when 4 then 300 else 100 end;
    v_qty := v_min + floor(random() * (v_max - v_min + 1))::int;

    insert into store_slots (position, policy_id, quantity, initial_quantity, rolled_at, last_decay_at)
    values (v_position, v_policy_id, v_qty, v_qty, now(), now())
    on conflict (position) do update set
      policy_id = excluded.policy_id,
      quantity = excluded.quantity,
      initial_quantity = excluded.initial_quantity,
      rolled_at = excluded.rolled_at,
      last_decay_at = excluded.last_decay_at;
  end loop;
end;
$$;
