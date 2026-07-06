import { formatSigFigs } from "@/lib/game/format";
import { getRankTier } from "@/lib/game/rankTiers";
import type { LeaderboardEntry } from "@/lib/types/game";

function Row({ entry, isMe }: { entry: LeaderboardEntry; isMe: boolean }) {
  const tier = getRankTier(entry.gdp);
  const isIridescent = tier.color === "iridescent";

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 ${
        isMe ? "bg-amber-500/10" : ""
      }`}
    >
      <span className="w-8 text-sm tabular-nums text-zinc-500">#{entry.rank}</span>
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-base shrink-0"
        style={{ backgroundColor: entry.flagStyle?.bg }}
      >
        {entry.flagEmoji ?? "🏳️"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {entry.username ? `@${entry.username}` : "Anonymous"}
        </p>
        <p className="text-xs text-zinc-500 truncate">{entry.name}</p>
      </div>
      <span
        className="hidden sm:inline text-xs font-medium shrink-0"
        style={{
          color: isIridescent ? undefined : tier.color,
          backgroundImage: isIridescent
            ? "linear-gradient(90deg, #ff9a9e, #a18cd1, #8fd3f4)"
            : undefined,
          WebkitBackgroundClip: isIridescent ? "text" : undefined,
          WebkitTextFillColor: isIridescent ? "transparent" : undefined,
        }}
      >
        {tier.name}
      </span>
      <span className="text-sm tabular-nums shrink-0">{formatSigFigs(entry.gdp, 5)}</span>
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

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-900 overflow-hidden">
        {entries.map((entry) => (
          <Row key={entry.countryId} entry={entry} isMe={entry.countryId === myCountryId} />
        ))}
      </div>

      {isPinnedOutside && (
        <div className="sticky bottom-16 sm:bottom-4 rounded-xl border-2 border-amber-500 bg-white dark:bg-black overflow-hidden">
          <Row entry={myCountry} isMe />
        </div>
      )}
    </div>
  );
}
