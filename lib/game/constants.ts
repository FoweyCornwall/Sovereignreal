export const SECTORS = [
  "economy",
  "social",
  "safety",
  "innovation",
  "productivity",
  "infrastructure",
  "environment",
  "immigration",
  "housing",
  "culture",
] as const;

export type Sector = (typeof SECTORS)[number];

export const SECTOR_LABELS: Record<Sector, string> = {
  economy: "Economy",
  social: "Social",
  safety: "Safety",
  innovation: "Innovation",
  productivity: "Productivity",
  infrastructure: "Infrastructure",
  environment: "Environment",
  immigration: "Immigration",
  housing: "Housing",
  culture: "Culture",
};

// Weighted composite used to derive gdp_per_sec from sector scores.
// Sums to 1.0. First-pass balance guess - expect a tuning/playtesting pass.
export const SECTOR_WEIGHTS: Record<Sector, number> = {
  economy: 0.2,
  productivity: 0.15,
  innovation: 0.12,
  infrastructure: 0.12,
  social: 0.09,
  safety: 0.08,
  environment: 0.08,
  housing: 0.06,
  immigration: 0.05,
  culture: 0.05,
};

// gdp_per_sec = GDP_SCALE * sum(sector_score_i * weight_i)
export const GDP_SCALE = 1000;

// treasury_regen_per_sec = BASE_TREASURY_REGEN + GDP_REGEN_FACTOR * gdp
export const BASE_TREASURY_REGEN = 0.5;
export const GDP_REGEN_FACTOR = 0.01;

export const STARTING_TREASURY = 1000;
export const STARTING_CREDITS = 20;

export const TIERS = [1, 2, 3, 4, 5] as const;
export type Tier = (typeof TIERS)[number];

// Per-tier caps enforced both in seed content and defensively at settle time.
export const TIER_MAX_SINGLE_DELTA: Record<Tier, number> = {
  1: 8,
  2: 14,
  3: 20,
  4: 30,
  5: 40,
};

export const TIER_DURATION_SECONDS: Record<Tier, { min: number; max: number }> = {
  1: { min: 10, max: 30 },
  2: { min: 120, max: 600 },
  3: { min: 600, max: 3600 },
  4: { min: 7200, max: 43200 },
  5: { min: 43200, max: 172800 }, // capped at 2 days
};

// Phase 2 rebalance: tiers 4-5 raised significantly (see
// supabase/migrations/0005_tier_cost_rebalance.sql) so they're meaningfully
// out of reach early-game, not just narrowly unaffordable. Tunable.
export const TIER_COST_RANGE: Record<Tier, { min: number; max: number }> = {
  1: { min: 20, max: 60 },
  2: { min: 100, max: 300 },
  3: { min: 400, max: 900 },
  4: { min: 6000, max: 15000 },
  5: { min: 25000, max: 60000 },
};

// Defensive floor/ceiling on any single sector's score, applied at settle time.
export const SECTOR_SCORE_FLOOR = 0;
export const SECTOR_SCORE_CEILING = 500;

// Hand size for the Policy Deck (Flow 3). Lower tiers drawn more often.
export const POLICY_HAND_SIZE = 5;
export const TIER_DRAW_WEIGHT: Record<Tier, number> = {
  1: 45,
  2: 27,
  3: 16,
  4: 8,
  5: 4,
};

// How often the client polls /api/settle while a game page is open (ms).
export const SETTLE_POLL_INTERVAL_MS = 10_000;
