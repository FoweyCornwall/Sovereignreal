// Mirrors constants baked into 0031_t5_price_cut_and_rebirths.sql (which
// superseded 0030's +10% GDP / +5% mutation values). Keep in sync if the
// SQL changes - these values are only used for client-side gating and
// copy, the server truth is enforced inside ascend_country() and
// compute_gdp_per_sec()/settle_country() regardless.
//
// User-facing name is "Rebirth" - the SQL identifiers (ascend_country,
// last_ascended_at, prestige_*) keep their pre-rename names since players
// never see them and renaming them would just add churn to the migration
// with zero benefit.

export const ASCENSION_MIN_GDP = 100_000_000_000; // Diamond floor
export const GDP_BONUS_PER_PRESTIGE = 0.5; // +50% base GDP/sec per rebirth, additive
export const TREASURY_BONUS_PER_PRESTIGE = 0.5; // +50% treasury regen/sec per rebirth, additive

export function canAscend(gdp: number): boolean {
  return gdp >= ASCENSION_MIN_GDP;
}

export function prestigeBonusPercents(count: number): {
  gdpPct: number;
  treasuryPct: number;
} {
  return {
    gdpPct: Math.round(count * GDP_BONUS_PER_PRESTIGE * 100),
    treasuryPct: Math.round(count * TREASURY_BONUS_PER_PRESTIGE * 100),
  };
}
