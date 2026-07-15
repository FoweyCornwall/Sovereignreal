import { getRankTier } from "@/lib/game/rankTiers";
import { RankIcon } from "@/components/dashboard/RankIcon";

export function RankBadge({ gdp }: { gdp: number }) {
  const tier = getRankTier(gdp);
  const hasGradient = Boolean(tier.gradientClass);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        tier.gradientClass ?? ""
      }`}
      style={{
        color: hasGradient ? "#000" : tier.color,
        backgroundColor: hasGradient
          ? undefined
          : `color-mix(in srgb, ${tier.color} 13%, transparent)`,
      }}
    >
      <RankIcon gdp={gdp} size={14} strokeWidth={2.25} />
      {tier.name}
    </span>
  );
}
