import { loadGameState } from "@/lib/game/loadGameState";
import { DashboardView } from "@/components/dashboard/DashboardView";

export default async function DashboardPage() {
  const { country, sectors } = await loadGameState();

  return <DashboardView country={country} sectors={sectors} />;
}
