import { getStore } from "@/lib/actions/policies";
import { getMutationShopItems } from "@/lib/actions/mutations";
import { loadGameState } from "@/lib/game/loadGameState";
import { PolicyMutationTabs } from "@/components/policies/PolicyMutationTabs";

export default async function PoliciesPage() {
  const [{ slots, restockAt }, mutationItems, { country, sectors }] = await Promise.all([
    getStore(),
    getMutationShopItems(),
    loadGameState(),
  ]);

  return (
    <PolicyMutationTabs
      slots={slots}
      restockAt={restockAt}
      mutationItems={mutationItems}
      sectors={sectors}
      gdp={country.gdp}
      credits={country.credits}
    />
  );
}
