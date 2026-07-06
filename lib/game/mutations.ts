import type { MutationRarity } from "@/lib/types/game";

export interface RarityInfo {
  rarity: MutationRarity;
  label: string;
  weightPercent: number;
  multiplier: number;
  color: string;
}

// Mirrors the weighted roll in settle_country() (0006_mutations.sql).
export const MUTATION_RARITIES_INFO: RarityInfo[] = [
  { rarity: "uncommon", label: "Uncommon", weightPercent: 45, multiplier: 2, color: "#4ADE80" },
  { rarity: "rare", label: "Rare", weightPercent: 33, multiplier: 3, color: "#38BDF8" },
  { rarity: "epic", label: "Epic", weightPercent: 15, multiplier: 5, color: "#A855F7" },
  { rarity: "legendary", label: "Legendary", weightPercent: 5.5, multiplier: 10, color: "#F59E0B" },
  { rarity: "mythic", label: "Mythic", weightPercent: 1, multiplier: 30, color: "#EC4899" },
  { rarity: "exotic", label: "Exotic", weightPercent: 0.4, multiplier: 50, color: "#22D3EE" },
  { rarity: "eternal", label: "Eternal", weightPercent: 0.1, multiplier: 100, color: "iridescent" },
];

export function getRarityInfo(rarity: MutationRarity): RarityInfo {
  return MUTATION_RARITIES_INFO.find((r) => r.rarity === rarity)!;
}

// Passive proc chance baseline: 0.05% per second per sector.
export const MUTATION_BASE_PROC_CHANCE_PER_SEC = 0.0005;
