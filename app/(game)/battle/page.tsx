import { loadGameState } from "@/lib/game/loadGameState";
import { getRecentBattles } from "@/lib/actions/battle";
import { BattleArena } from "@/components/battle/BattleArena";

export default async function BattlePage() {
  const [{ country }, recentBattles] = await Promise.all([loadGameState(), getRecentBattles()]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Battle</h1>
      <BattleArena countryId={country.id} recentBattles={recentBattles} />
    </div>
  );
}
