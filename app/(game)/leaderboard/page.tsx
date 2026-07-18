import { loadLeaderboard } from "@/lib/game/loadLeaderboard";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";

export default async function LeaderboardPage() {
  const { entries, entriesByWins, myCountryId, myCountry } = await loadLeaderboard();

  return (
    <LeaderboardTable
      entries={entries}
      entriesByWins={entriesByWins}
      myCountryId={myCountryId}
      myCountry={myCountry}
    />
  );
}
