import { formatSigFigs } from "@/lib/game/format";
import type { LeaderboardEntry } from "@/lib/types/game";

function Row({ entry, isMe }: { entry: LeaderboardEntry; isMe: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 ${
        isMe ? "bg-amber-500/10" : ""
      }`}
    >
      <span className="w-8 text-sm tabular-nums text-zinc-500">#{entry.rank}</span>
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-base"
        style={{ backgroundColor: entry.flagStyle?.bg }}
      >
        {entry.flagEmoji ?? "🏳️"}
      </span>
      <span className="flex-1 text-sm font-medium truncate">{entry.name}</span>
      <span className="text-sm tabular-nums">{formatSigFigs(entry.gdp, 5)}</span>
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
      <h1 className="text-xl font-semibold">Global Leaderboard</h1>

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
