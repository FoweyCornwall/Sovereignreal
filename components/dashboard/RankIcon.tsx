import { Award, Medal, Trophy, Gem, Diamond, Crown, Sparkles, type LucideIcon } from "lucide-react";
import { getRankTier } from "@/lib/game/rankTiers";

const TIER_ICON: Record<string, LucideIcon> = {
  Bronze: Award,
  Silver: Medal,
  Gold: Trophy,
  Platinum: Gem,
  Diamond: Diamond,
  Master: Crown,
  Grandmaster: Crown,
  Transcendent: Sparkles,
};

export function RankIcon({
  gdp,
  size = 14,
  strokeWidth = 2,
}: {
  gdp: number;
  size?: number;
  strokeWidth?: number;
}) {
  const tier = getRankTier(gdp);
  const Icon = TIER_ICON[tier.name] ?? Award;
  const isIridescent = tier.color === "iridescent";
  return (
    <Icon
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      style={{ color: isIridescent ? "#a18cd1" : tier.color }}
      aria-hidden
    />
  );
}
