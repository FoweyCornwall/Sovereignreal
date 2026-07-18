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
// Dropped 5000 -> 500 in 0033 alongside removing the 100-score sector cap,
// so the climb to Diamond/Master/Transcendent stays roughly as hard as
// before even with sectors free to grow unbounded.
export const GDP_SCALE = 500;

// treasury_regen_per_sec = gdp_per_sec / 2 (mirrored in settle_country()
// in 0033). No base regen anymore - at gdp/sec = 0 treasury is idle.
export const STARTING_TREASURY = 1000;

export const TIERS = [1, 2, 3, 4, 5] as const;
export type Tier = (typeof TIERS)[number];

// Per-tier defensive caps enforced in settle_country. T4/T5 bumped
// dramatically in 0033: a T5 is 50x the boost of a T1, so it justifies
// being 10x+ the cost.
export const TIER_MAX_SINGLE_DELTA: Record<Tier, number> = {
  1: 8,
  2: 14,
  3: 20,
  4: 200,
  5: 400,
};

export const TIER_DURATION_SECONDS: Record<Tier, { min: number; max: number }> = {
  1: { min: 10, max: 30 },
  2: { min: 120, max: 600 },
  3: { min: 600, max: 3600 },
  4: { min: 7200, max: 43200 },
  5: { min: 43200, max: 172800 }, // capped at 2 days
};

// Documentation only - unwired, actual costs always come from
// policy_library.base_cost in the DB. Rebalanced repeatedly (0005, 0009,
// 0013, 0028, 0031) - tiers 4-5 in particular are now far above these
// launch-era numbers. Approximate current ranges: T4 ~1.3M-2.5M, T5
// ~8.9M-17.3M (T5 halved again in 0031 after 0028's -30% cut). Before the
// GDP-scaling multiplier in enact_store_policy() pushes the effective
// price higher still.
export const TIER_COST_RANGE: Record<Tier, { min: number; max: number }> = {
  1: { min: 40, max: 120 },
  2: { min: 200, max: 600 },
  3: { min: 800, max: 1800 },
  4: { min: 1_337_500, max: 2_499_000 },
  5: { min: 8_925_000, max: 17_255_000 },
};

// Defensive floor on any single sector's score. Ceiling removed in 0033 -
// sectors grow unbounded, encouraging real strategy over a race to 100.
export const SECTOR_SCORE_FLOOR = 0;

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
export const SETTLE_POLL_INTERVAL_MS = 30_000;
