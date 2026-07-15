import { prestigeBonusPercents } from "@/lib/game/prestige";

// Small amber "star + count" chip shown next to the country name on the
// dashboard header and on every leaderboard row where the player has
// prestiged at least once. Deliberately distinct from RankBadge (tier
// color) and VipBadge (gold ring) so it reads as its own axis.
export function PrestigeBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const { gdpPct, mutationPct } = prestigeBonusPercents(count);
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
      style={{
        backgroundColor: "color-mix(in srgb, #f59e0b 15%, transparent)",
        border: "1px solid color-mix(in srgb, #f59e0b 45%, transparent)",
      }}
      title={`Prestige ${count} — +${gdpPct}% GDP/sec, +${mutationPct}% mutation proc rate`}
    >
      <span aria-hidden>★</span>
      {count}
    </span>
  );
}
