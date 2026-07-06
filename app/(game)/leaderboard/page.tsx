import { loadLeaderboard } from "@/lib/game/loadLeaderboard";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";

export default async function LeaderboardPage() {
  const { entries, myCountryId, myCountry } = await loadLeaderboard();

  return (
    <LeaderboardTable entries={entries} myCountryId={myCountryId} myCountry={myCountry} />
  );
}
