import type { Sector } from "@/lib/game/constants";

export type StatDeltas = Partial<Record<Sector, number>>;

export interface Country {
  id: string;
  userId: string | null;
  name: string;
  username: string | null;
  flagEmoji: string | null;
  flagStyle: { bg: string; pattern?: string } | null;
  countryCode: string | null;
  gdp: number;
  gdpPerSec: number;
  treasury: number;
  treasuryRegenPerSec: number;
  credits: number;
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

// A store slot: a policy card plus its position in the shared global store
// and remaining stock.
export interface StoreSlot extends PolicyCard {
  slotPosition: number;
  quantity: number;
  initialQuantity: number;
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
  | { ok: false; reason: "QUEUE_FULL" }
  | { ok: false; reason: "SOLD_OUT" }
  | { ok: false; reason: "STALE_SLOT" }
  | { ok: false; reason: "POLICY_NOT_FOUND" };

export type RefreshStoreResult =
  | { ok: true }
  | { ok: false; reason: "INSUFFICIENT_CREDITS"; shortfall: number };

export interface LeaderboardEntry {
  countryId: string;
  name: string;
  username: string | null;
  flagEmoji: string | null;
  flagStyle: { bg: string; pattern?: string } | null;
  gdp: number;
  rank: number;
}

export const MUTATION_RARITIES = [
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
  "exotic",
  "eternal",
] as const;
export type MutationRarity = (typeof MUTATION_RARITIES)[number];

export interface SectorMutation {
  sector: Sector;
  rarity: MutationRarity;
  multiplier: number;
  acquiredAt: string;
}

export interface MutationItem {
  id: string;
  key: string;
  title: string;
  description: string | null;
  targetSectors: Sector[];
  procMultiplier: number;
  durationSeconds: number;
  baseCost: number;
}

export interface MutationBoost {
  id: string;
  targetSectors: Sector[];
  procMultiplier: number;
  expiresAt: string;
}

export type EnactMutationResult =
  | { ok: true }
  | { ok: false; reason: "INSUFFICIENT_FUNDS"; shortfall: number }
  | { ok: false; reason: "QUEUE_FULL" }
  | { ok: false; reason: "ITEM_NOT_FOUND" };
