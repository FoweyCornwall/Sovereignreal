import { getStore } from "@/lib/actions/policies";
import { getMutationShopItems } from "@/lib/actions/mutations";
import { loadGameState } from "@/lib/game/loadGameState";
import { loadCosmetics } from "@/lib/game/loadCosmetics";
import { PolicyMutationTabs } from "@/components/policies/PolicyMutationTabs";
import { isVipActive } from "@/lib/game/vip";

export default async function PoliciesPage() {
  const [{ slots, restockAt }, mutationItems, gameState, cosmetics] = await Promise.all([
    getStore(),
    getMutationShopItems(),
    loadGameState(),
    loadCosmetics(),
  ]);

  return (
    <PolicyMutationTabs
      slots={slots}
      restockAt={restockAt}
      mutationItems={mutationItems}
      sectors={gameState.sectors}
      gdp={gameState.country.gdp}
      credits={gameState.credits}
      isVip={isVipActive(gameState.vipExpiresAt)}
      lastFreeRestockAt={gameState.lastFreeRestockAt}
      cosmeticsOwned={cosmetics.ownedPackKeys}
      equippedSectorTheme={cosmetics.equippedSectorTheme}
    />
  );
}
