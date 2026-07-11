// Mirrors the seed rows in supabase/migrations/0016_cosmetics.sql - keep in
// sync. Used purely for display; the source of truth (price, ownership) is
// always the DB.
export type SectorTheme = "ice" | "fire";

export interface CosmeticPack {
  key: string;
  name: string;
  description: string;
  priceCredits: number;
  theme: SectorTheme;
}

export const COSMETIC_PACKS: CosmeticPack[] = [
  {
    key: "ice_pack",
    name: "Glacier Pack",
    description: "Frost and ice effects on mutated sectors.",
    priceCredits: 250,
    theme: "ice",
  },
  {
    key: "fire_pack",
    name: "Inferno Pack",
    description: "Ember and flame effects on mutated sectors.",
    priceCredits: 250,
    theme: "fire",
  },
];

export function getCosmeticPack(key: string): CosmeticPack | undefined {
  return COSMETIC_PACKS.find((p) => p.key === key);
}
