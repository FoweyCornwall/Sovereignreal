import { GDP_SCALE, SECTOR_WEIGHTS, type Sector } from "@/lib/game/constants";
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

// Sector scores are uncapped and diminishing returns are gone (0033) -
// every policy's baseDelta applies verbatim. Kept as an identity wrapper
// so callers don't have to change; will inline in a future cleanup.
export function computeEffectiveDelta(baseDelta: number): number {
  return baseDelta;
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
