import { GDP_SCALE, SECTOR_SCORE_CEILING, SECTOR_WEIGHTS, type Sector } from "@/lib/game/constants";
import type { SectorState } from "@/lib/types/game";

export type Trend = "up" | "down" | "flat";

export function computeTrend(state: SectorState): Trend {
  if (state.score > state.previousScore) return "up";
  if (state.score < state.previousScore) return "down";
  return "flat";
}

// Pure client-side interpolation for the visual "ticking" GDP/treasury
// counters between server settles. Never trusted as authoritative state.
export function interpolateValue(
  baseValue: number,
  perSecondRate: number,
  fetchedAt: number,
  now: number = Date.now()
): number {
  const elapsedSeconds = Math.max(0, (now - fetchedAt) / 1000);
  return baseValue + perSecondRate * elapsedSeconds;
}

// Mirrors settle_country()'s diminishing-returns step (0009_gameplay_rebalance.sql):
// positive deltas shrink the closer a sector already is to the 100 ceiling,
// so a policy's *relative* benefit depends on current sector state. Negative
// deltas are unaffected. Used purely for display - the server is still the
// only place this is actually applied.
export function computeEffectiveDelta(baseDelta: number, currentScore: number): number {
  if (baseDelta <= 0) return baseDelta;
  const room = Math.max(0, 1 - currentScore / SECTOR_SCORE_CEILING);
  return baseDelta * room;
}

export interface SectorContribution {
  sector: Sector;
  score: number;
  weight: number;
  contribution: number;
  sharePercent: number;
}

// Mirrors the gdp_per_sec formula computed server-side in settle_country() -
// used here only to break the total down per-sector for the Stats page, not
// to recompute authoritative GDP.
export function computeSectorContributions(
  sectorStates: SectorState[]
): SectorContribution[] {
  const rows = sectorStates.map((s) => ({
    sector: s.sector,
    score: s.score,
    weight: SECTOR_WEIGHTS[s.sector],
    contribution: s.score * SECTOR_WEIGHTS[s.sector] * GDP_SCALE,
  }));

  const total = rows.reduce((sum, r) => sum + r.contribution, 0);

  return rows.map((r) => ({
    ...r,
    sharePercent: total > 0 ? (r.contribution / total) * 100 : 0,
  }));
}
