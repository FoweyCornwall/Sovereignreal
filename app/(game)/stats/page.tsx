import { loadGameState } from "@/lib/game/loadGameState";
import { loadStats } from "@/lib/game/loadStats";
import { GdpChart } from "@/components/stats/GdpChart";
import { PolicyHistoryList } from "@/components/stats/PolicyHistoryList";
import { SectorContributionList } from "@/components/stats/SectorContributionList";

export default async function StatsPage() {
  const { country, sectors } = await loadGameState();
  const { gdpHistory, policyHistory } = await loadStats(country.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold mb-2">GDP Growth</h1>
        <GdpChart points={gdpHistory} />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">
          Sector Contribution
        </h2>
        <SectorContributionList sectors={sectors} />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">
          Policy History
        </h2>
        <PolicyHistoryList entries={policyHistory} />
      </div>
    </div>
  );
}
