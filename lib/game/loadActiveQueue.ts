import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { QueueItem, StatDeltas } from "@/lib/types/game";
import type { Sector } from "@/lib/game/constants";

export async function loadActiveQueue(): Promise<{ items: QueueItem[]; credits: number }> {
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

  const [{ data: rows, error }, { data: boostRows, error: boostError }, { data: profile }] =
    await Promise.all([
      supabase
        .from("active_policies")
        .select(
          "id, country_id, policy_id, tier, cost_paid, stat_deltas, started_at, completes_at, policy_library(title, primary_sector)"
        )
        .eq("country_id", country.id)
        .eq("settled", false)
        .order("completes_at", { ascending: true }),
      supabase
        .from("mutation_boosts")
        .select("id, target_sectors, proc_multiplier, expires_at")
        .eq("country_id", country.id),
      supabase.from("profiles").select("credits").eq("id", userData.user.id).maybeSingle(),
    ]);

  if (error || !rows) {
    throw new Error(`Failed to load active policies: ${error?.message}`);
  }
  if (boostError || !boostRows) {
    throw new Error(`Failed to load mutation boosts: ${boostError?.message}`);
  }

  const policyItems: QueueItem[] = rows.map((r) => {
    const policy = Array.isArray(r.policy_library) ? r.policy_library[0] : r.policy_library;
    return {
      kind: "policy",
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

  const boostItems: QueueItem[] = boostRows.map((b) => ({
    kind: "mutation_boost",
    id: b.id,
    targetSectors: b.target_sectors as Sector[],
    procMultiplier: b.proc_multiplier,
    expiresAt: b.expires_at,
  }));

  const items = [...policyItems, ...boostItems].sort((a, b) => {
    const aTime = new Date(a.kind === "policy" ? a.completesAt : a.expiresAt).getTime();
    const bTime = new Date(b.kind === "policy" ? b.completesAt : b.expiresAt).getTime();
    return aTime - bTime;
  });

  return { items, credits: profile?.credits ?? 0 };
}
