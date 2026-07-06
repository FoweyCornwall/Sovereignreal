import type { Sector } from "@/lib/game/constants";

export type StatDeltas = Partial<Record<Sector, number>>;

export interface Country {
  id: string;
  userId: string;
  name: string;
  flagEmoji: string | null;
  flagStyle: { bg: string; pattern?: string } | null;
  countryCode: string | null;
  gdp: number;
  gdpPerSec: number;
  treasury: number;
  treasuryRegenPerSec: number;
  lastSettledAt: string;
}

export interface SectorState {
  sector: Sector;
  score: number;
  previousScore: number;
}

export interface PolicyCard {
  id: string;
  key: string;
  title: string;
  description: string | null;
  tier: number;
  primarySector: Sector;
  statDeltas: StatDeltas;
  baseCost: number;
  durationSeconds: number;
}

export interface ActivePolicy {
  id: string;
  countryId: string;
  policyId: string;
  title: string;
  tier: number;
  primarySector: Sector;
  costPaid: number;
  statDeltas: StatDeltas;
  startedAt: string;
  completesAt: string;
}

export interface PolicyHistoryEntry {
  id: string;
  title: string;
  primarySector: Sector;
  statDeltas: StatDeltas;
  costPaid: number;
  startedAt: string;
  settledAt: string;
}

export type EnactPolicyResult =
  | { ok: true; activePolicy: ActivePolicy }
  | { ok: false; reason: "INSUFFICIENT_FUNDS"; shortfall: number }
  | { ok: false; reason: "POLICY_NOT_FOUND" };

export interface LeaderboardEntry {
  countryId: string;
  name: string;
  flagEmoji: string | null;
  flagStyle: { bg: string; pattern?: string } | null;
  gdp: number;
  rank: number;
}
