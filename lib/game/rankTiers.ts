export interface RankTier {
  name: string;
  threshold: number;
  color: string;
}

// GDP thresholds. Note the last gap is 100x while every other gap is 10x -
// intentional, making Transcendent a deliberately much rarer top tier.
export const RANK_TIERS: RankTier[] = [
  { name: "Bronze", threshold: 0, color: "var(--tier-bronze)" },
  { name: "Silver", threshold: 100_000_000, color: "var(--tier-silver)" },
  { name: "Gold", threshold: 1_000_000_000, color: "var(--tier-gold)" },
  { name: "Platinum", threshold: 10_000_000_000, color: "var(--tier-platinum)" },
  { name: "Diamond", threshold: 100_000_000_000, color: "var(--tier-diamond)" },
  { name: "Master", threshold: 1_000_000_000_000, color: "var(--tier-master)" },
  { name: "Grandmaster", threshold: 10_000_000_000_000, color: "var(--tier-grandmaster)" },
  {
    name: "Transcendent",
    threshold: 1_000_000_000_000_000,
    color: "iridescent",
  },
];

export const PLATINUM_THRESHOLD = RANK_TIERS[3].threshold;

export function getRankTier(gdp: number): RankTier {
  let current = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (gdp >= tier.threshold) current = tier;
    else break;
  }
  return current;
}

export function getNextRankTier(gdp: number): RankTier | null {
  const currentIndex = RANK_TIERS.findIndex(
    (tier) => tier.name === getRankTier(gdp).name
  );
  return RANK_TIERS[currentIndex + 1] ?? null;
}
