import { loadGameState } from "@/lib/game/loadGameState";
import { DashboardView } from "@/components/dashboard/DashboardView";

export default async function DashboardPage() {
  const { country, sectors, mutations } = await loadGameState();

  return <DashboardView country={country} sectors={sectors} mutations={mutations} />;
}
