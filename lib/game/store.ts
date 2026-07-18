import type { Tier } from "@/lib/game/constants";

// Mirrored in SQL (reroll_store_slots() in
// supabase/migrations/0033_uncap_sectors_and_rebalance.sql) - keep in sync.
export const STORE_SLOT_COUNT = 8;
export const STORE_RESTOCK_SECONDS = 900; // 15 minutes
export const STORE_REFRESH_COST_CREDITS = 5;

// Mirrored in skip_active_policy() in supabase/migrations/0019_skip_timer_and_country_identity.sql - keep in sync.
export const SKIP_TIMER_COST_CREDITS = 5;

// Mirrored in skip_all_policies() in
// supabase/migrations/0033_uncap_sectors_and_rebalance.sql.
export const SKIP_ALL_COST_CREDITS = 15;

// Scarcer at higher tiers. Mirrored in reroll_store_slots() in
// supabase/migrations/0013_cost_and_stock_rebalance.sql - keep in sync.
export const STORE_SLOT_QUANTITY_RANGE: Record<Tier, { min: number; max: number }> = {
  1: { min: 2000, max: 5000 },
  2: { min: 1000, max: 2500 },
  3: { min: 400, max: 1000 },
  4: { min: 100, max: 300 },
  5: { min: 30, max: 100 },
};

// Chance per elapsed minute that a slot's stock ticks down a little, to
// simulate other players buying even when the store is quiet. Tunable.
export const STORE_DECAY_CHANCE_PER_MINUTE = 0.15;

// Mirrored in enact_store_policy()/enact_mutation_item() in
// supabase/migrations/0025_queue_cap_seven.sql - keep in sync (VIP cap there is 14).
export const MAX_ACTIVE_POLICIES = 7;

// effective_cost = base_cost * (1 + gdp * GDP_COST_SCALE_FACTOR)
export const GDP_COST_SCALE_FACTOR = 1 / 1_000_000;

export function computeEffectiveCost(baseCost: number, gdp: number): number {
  return baseCost * (1 + gdp * GDP_COST_SCALE_FACTOR);
}
