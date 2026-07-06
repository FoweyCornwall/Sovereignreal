import { getHand } from "@/lib/actions/policies";
import { PolicyHand } from "@/components/policies/PolicyHand";

export default async function PoliciesPage() {
  const hand = await getHand();

  return <PolicyHand initialHand={hand} />;
}
