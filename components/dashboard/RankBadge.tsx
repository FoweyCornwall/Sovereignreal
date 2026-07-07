import { getRankTier } from "@/lib/game/rankTiers";

export function RankBadge({ gdp }: { gdp: number }) {
  const tier = getRankTier(gdp);
  const isIridescent = tier.color === "iridescent";

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{
        color: isIridescent ? "#000" : tier.color,
        backgroundColor: isIridescent ? undefined : `${tier.color}22`,
        backgroundImage: isIridescent
          ? "linear-gradient(90deg, #ff9a9e, #fad0c4, #a18cd1, #fbc2eb, #8fd3f4)"
          : undefined,
      }}
    >
      <span className="text-sm leading-none">{tier.icon}</span>
      {tier.name}
    </span>
  );
}
