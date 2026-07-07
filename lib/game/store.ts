import type { Tier } from "@/lib/game/constants";

// Mirrored in SQL (supabase/migrations/0004_policy_store.sql) - keep in sync.
export const STORE_SLOT_COUNT = 6;
export const STORE_RESTOCK_SECONDS = 900; // 15 minutes
export const STORE_REFRESH_COST_CREDITS = 5;

// Scarcer at higher tiers. First-pass proposal, tunable.
export const STORE_SLOT_QUANTITY_RANGE: Record<Tier, { min: number; max: number }> = {
  1: { min: 40, max: 80 },
  2: { min: 20, max: 40 },
  3: { min: 10, max: 20 },
  4: { min: 4, max: 8 },
  5: { min: 1, max: 3 },
};

// Chance per elapsed minute that a slot's stock ticks down a little, to
// simulate other players buying even when the store is quiet. Tunable.
export const STORE_DECAY_CHANCE_PER_MINUTE = 0.15;

export const MAX_ACTIVE_POLICIES = 5;

// Stacking: each additional enactment of the same policy applies these
// factors, compounding per stack (positive^N, negative^N).
export const STACK_POSITIVE_FACTOR = 0.9;
export const STACK_NEGATIVE_FACTOR = 1.1;

// effective_cost = base_cost * (1 + gdp * GDP_COST_SCALE_FACTOR)
export const GDP_COST_SCALE_FACTOR = 1 / 1_000_000;

export function computeEffectiveCost(baseCost: number, gdp: number): number {
  return baseCost * (1 + gdp * GDP_COST_SCALE_FACTOR);
}
