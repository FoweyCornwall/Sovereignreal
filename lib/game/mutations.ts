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
  { rarity: "uncommon", label: "Uncommon", weightPercent: 45, multiplier: 2, color: "var(--rarity-uncommon)" },
  { rarity: "rare", label: "Rare", weightPercent: 33, multiplier: 3, color: "var(--rarity-rare)" },
  { rarity: "epic", label: "Epic", weightPercent: 15, multiplier: 5, color: "var(--rarity-epic)" },
  { rarity: "legendary", label: "Legendary", weightPercent: 5.5, multiplier: 10, color: "var(--rarity-legendary)" },
  { rarity: "mythic", label: "Mythic", weightPercent: 1, multiplier: 30, color: "var(--rarity-mythic)" },
  { rarity: "exotic", label: "Exotic", weightPercent: 0.4, multiplier: 50, color: "var(--rarity-exotic)" },
  { rarity: "eternal", label: "Eternal", weightPercent: 0.1, multiplier: 100, color: "iridescent" },
];

export function getRarityInfo(rarity: MutationRarity): RarityInfo {
  return MUTATION_RARITIES_INFO.find((r) => r.rarity === rarity)!;
}

// Multipliers are unique per rarity, so a PvP match's frozen
// mutation_multiplier snapshot (which doesn't carry the rarity string) can
// be mapped back to its rarity/color for display.
export function getRarityInfoByMultiplier(multiplier: number): RarityInfo | undefined {
  return MUTATION_RARITIES_INFO.find((r) => r.multiplier === multiplier);
}

// Passive proc chance baseline: 0.05% per second per sector.
export const MUTATION_BASE_PROC_CHANCE_PER_SEC = 0.0005;
