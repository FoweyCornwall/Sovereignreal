"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MatchmakingPanel } from "@/components/pvp/MatchmakingPanel";
import { MatchView } from "@/components/pvp/MatchView";
import type { RecentMatch } from "@/lib/actions/pvpMatch";
import { formatWithCommas } from "@/lib/game/format";

export function BattleClient({
  countryId,
  initialMatchId,
  recentMatches,
}: {
  countryId: string;
  initialMatchId: string | null;
  recentMatches: RecentMatch[];
}) {
  const [matchId, setMatchId] = useState<string | null>(initialMatchId);
  const router = useRouter();

  function handleDone() {
    setMatchId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {matchId ? (
        <MatchView matchId={matchId} countryId={countryId} onDone={handleDone} />
      ) : (
        <MatchmakingPanel onMatched={setMatchId} />
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
          Recent Matches
        </h2>
        <div className="rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
          {recentMatches.length === 0 && (
            <p className="text-sm text-zinc-500 px-4 py-3">No matches yet.</p>
          )}
          {recentMatches.map((m) => {
            const won = m.winnerCountryId === countryId;
            const iAmSideA = m.sideACountryId === countryId;
            const opponentName = iAmSideA ? m.sideBName : m.sideAName;
            const myWins = iAmSideA ? m.sideAWins : m.sideBWins;
            const opponentWins = iAmSideA ? m.sideBWins : m.sideAWins;
            return (
              <div key={m.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>
                  vs {opponentName}{" "}
                  <span className="text-zinc-500">
                    ({myWins}-{opponentWins}
                    {m.forfeited ? ", forfeit" : ""})
                  </span>
                </span>
                <span className={won ? "text-emerald-500" : "text-red-500"}>
                  {won ? "+" : "-"}
                  {m.payoutAmount ? formatWithCommas(m.payoutAmount) : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
