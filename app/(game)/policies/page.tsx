import { getStore } from "@/lib/actions/policies";
import { getMutationShopItems } from "@/lib/actions/mutations";
import { loadGameState } from "@/lib/game/loadGameState";
import { loadCosmetics } from "@/lib/game/loadCosmetics";
import { PolicyMutationTabs } from "@/components/policies/PolicyMutationTabs";
import { createClient } from "@/lib/supabase/server";
import { isVipActive } from "@/lib/game/vip";

export default async function PoliciesPage() {
  const supabase = await createClient();

  const [{ slots, restockAt }, mutationItems, gameState, cosmetics] = await Promise.all([
    getStore(),
    getMutationShopItems(),
    loadGameState(),
    loadCosmetics(),
  ]);

  // Stack counts: how many times this country has ever enacted each policy in
  // the store. Powers the "derived benefit" display on each card so the shown
  // impact reflects the NEXT enactment's stacked deltas, not the base card.
  const { data: stackRows } = await supabase
    .from("active_policies")
    .select("policy_id")
    .eq("country_id", gameState.country.id);

  const stackCounts: Record<string, number> = {};
  for (const row of stackRows ?? []) {
    stackCounts[row.policy_id] = (stackCounts[row.policy_id] ?? 0) + 1;
  }

  return (
    <PolicyMutationTabs
      slots={slots}
      restockAt={restockAt}
      mutationItems={mutationItems}
      sectors={gameState.sectors}
      gdp={gameState.country.gdp}
      credits={gameState.credits}
      stackCounts={stackCounts}
      isVip={isVipActive(gameState.vipExpiresAt)}
      lastFreeRestockAt={gameState.lastFreeRestockAt}
      cosmeticsOwned={cosmetics.ownedPackKeys}
      equippedSectorTheme={cosmetics.equippedSectorTheme}
    />
  );
}
