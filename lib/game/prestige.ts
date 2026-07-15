// Mirrors constants baked into 0030_prestige.sql. Keep in sync if the SQL
// changes - these values are only used for client-side gating and copy,
// the server truth is enforced inside ascend_country() and
// compute_gdp_per_sec() regardless.

export const ASCENSION_MIN_GDP = 100_000_000_000; // Diamond floor
export const GDP_BONUS_PER_PRESTIGE = 0.1; // +10% base GDP/sec per prestige, additive
export const MUTATION_BONUS_PER_PRESTIGE = 0.05; // +5% mutation proc rate per prestige, additive

export function canAscend(gdp: number): boolean {
  return gdp >= ASCENSION_MIN_GDP;
}

export function prestigeBonusPercents(count: number): {
  gdpPct: number;
  mutationPct: number;
} {
  return {
    gdpPct: Math.round(count * GDP_BONUS_PER_PRESTIGE * 100),
    mutationPct: Math.round(count * MUTATION_BONUS_PER_PRESTIGE * 100),
  };
}
