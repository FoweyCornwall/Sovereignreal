import { getRankTier } from "@/lib/game/rankTiers";
import { RankIcon } from "@/components/dashboard/RankIcon";

export function RankBadge({ gdp }: { gdp: number }) {
  const tier = getRankTier(gdp);
  const isIridescent = tier.color === "iridescent";

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{
        color: isIridescent ? "#000" : tier.color,
        backgroundColor: isIridescent
          ? undefined
          : `color-mix(in srgb, ${tier.color} 13%, transparent)`,
        backgroundImage: isIridescent
          ? "linear-gradient(90deg, #ff9a9e, #fad0c4, #a18cd1, #fbc2eb, #8fd3f4)"
          : undefined,
      }}
    >
      <RankIcon gdp={gdp} size={14} strokeWidth={2.25} />
      {tier.name}
    </span>
  );
}
