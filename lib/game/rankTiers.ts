export interface RankTier {
  name: string;
  threshold: number;
  color: string;
  icon: string;
}

// GDP thresholds. Note the last gap is 100x while every other gap is 10x -
// intentional, making Transcendent a deliberately much rarer top tier.
export const RANK_TIERS: RankTier[] = [
  { name: "Bronze", threshold: 0, color: "#B08D57", icon: "🥉" },
  { name: "Silver", threshold: 100_000_000, color: "#C0C0C0", icon: "🥈" },
  { name: "Gold", threshold: 1_000_000_000, color: "#FFD700", icon: "🥇" },
  { name: "Platinum", threshold: 10_000_000_000, color: "#8FDDE0", icon: "🔷" },
  { name: "Diamond", threshold: 100_000_000_000, color: "#B9F2FF", icon: "💎" },
  { name: "Master", threshold: 1_000_000_000_000, color: "#9D4EDD", icon: "🏆" },
  { name: "Grandmaster", threshold: 10_000_000_000_000, color: "#FF5C7A", icon: "👑" },
  {
    name: "Transcendent",
    threshold: 1_000_000_000_000_000,
    color: "iridescent",
    icon: "✨",
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
