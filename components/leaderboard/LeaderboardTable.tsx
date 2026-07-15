import { formatWithCommas } from "@/lib/game/format";
import { getRankTier } from "@/lib/game/rankTiers";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { RankIcon } from "@/components/dashboard/RankIcon";
import { VipBadge } from "@/components/ui/VipBadge";
import type { LeaderboardEntry } from "@/lib/types/game";

function Row({ entry, isMe }: { entry: LeaderboardEntry; isMe: boolean }) {
  const tier = getRankTier(entry.gdp);
  const hasGradient = Boolean(tier.gradientClass);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 ${isMe ? "bg-brand-500/10" : ""} ${
        entry.isVip ? "ring-1 ring-inset ring-[#FFD700]" : ""
      }`}
    >
      <span className="w-8 text-sm tabular-nums text-zinc-500">#{entry.rank}</span>
      <CountryFlag
        countryCode={entry.countryCode}
        flagEmoji={entry.flagEmoji}
        flagStyle={entry.flagStyle}
        name={entry.name}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate flex items-center gap-1.5">
          <span className="truncate">{entry.username ? `@${entry.username}` : "Anonymous"}</span>
          {entry.isVip && <VipBadge />}
        </p>
        <p className="text-xs text-zinc-500 truncate">{entry.name}</p>
      </div>
      <span
        className={`hidden sm:inline-flex items-center gap-1 text-xs font-medium shrink-0 ${
          hasGradient ? `${tier.gradientClass} bg-clip-text text-transparent` : ""
        }`}
        style={{ color: hasGradient ? undefined : tier.color }}
      >
        <RankIcon gdp={entry.gdp} size={14} strokeWidth={2.25} />
        {tier.name}
      </span>
      <span className="text-sm tabular-nums shrink-0">{formatWithCommas(entry.gdp)}</span>
    </div>
  );
}

export function LeaderboardTable({
  entries,
  myCountryId,
  myCountry,
}: {
  entries: LeaderboardEntry[];
  myCountryId: string;
  myCountry: LeaderboardEntry;
}) {
  const myEntry = entries.find((e) => e.countryId === myCountryId);
  const isPinnedOutside = !myEntry;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Leaderboard</h1>

      <div className="rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm divide-y divide-zinc-100 dark:divide-zinc-900 overflow-hidden">
        {entries.map((entry) => (
          <Row key={entry.countryId} entry={entry} isMe={entry.countryId === myCountryId} />
        ))}
      </div>

      {isPinnedOutside && (
        <div className="sticky bottom-16 sm:bottom-4 rounded-xl border-2 border-brand-500 bg-white dark:bg-black overflow-hidden">
          <Row entry={myCountry} isMe />
        </div>
      )}
    </div>
  );
}
