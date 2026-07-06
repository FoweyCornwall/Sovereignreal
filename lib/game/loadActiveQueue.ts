import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { ActivePolicy, StatDeltas } from "@/lib/types/game";
import type { Sector } from "@/lib/game/constants";

export async function loadActiveQueue(): Promise<ActivePolicy[]> {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/login");
  }

  const { data: country } = await supabase
    .from("countries")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!country) {
    redirect("/setup");
  }

  await supabase.rpc("settle_country", { p_country_id: country.id });

  const { data: rows, error } = await supabase
    .from("active_policies")
    .select(
      "id, country_id, policy_id, tier, cost_paid, stat_deltas, started_at, completes_at, policy_library(title, primary_sector)"
    )
    .eq("country_id", country.id)
    .eq("settled", false)
    .order("completes_at", { ascending: true });

  if (error || !rows) {
    throw new Error(`Failed to load active policies: ${error?.message}`);
  }

  return rows.map((r) => {
    const policy = Array.isArray(r.policy_library) ? r.policy_library[0] : r.policy_library;
    return {
      id: r.id,
      countryId: r.country_id,
      policyId: r.policy_id,
      title: policy?.title ?? "Policy",
      tier: r.tier,
      primarySector: (policy?.primary_sector ?? "economy") as Sector,
      costPaid: r.cost_paid,
      statDeltas: r.stat_deltas as StatDeltas,
      startedAt: r.started_at,
      completesAt: r.completes_at,
    };
  });
}
