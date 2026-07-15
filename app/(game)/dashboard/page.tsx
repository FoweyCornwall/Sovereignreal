import { loadGameState } from "@/lib/game/loadGameState";
import { DashboardView } from "@/components/dashboard/DashboardView";

export default async function DashboardPage() {
  const {
    country,
    sectors,
    mutations,
    credits,
    lastDailyClaimAt,
    equippedSectorTheme,
    vipExpiresAt,
    dailyQuests,
  } = await loadGameState();

  return (
    <DashboardView
      country={country}
      sectors={sectors}
      mutations={mutations}
      credits={credits}
      lastDailyClaimAt={lastDailyClaimAt}
      equippedSectorTheme={equippedSectorTheme}
      vipExpiresAt={vipExpiresAt}
      dailyQuests={dailyQuests}
    />
  );
}
