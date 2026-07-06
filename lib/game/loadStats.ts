import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { PolicyHistoryEntry, StatDeltas } from "@/lib/types/game";
import type { Sector } from "@/lib/game/constants";

const GDP_HISTORY_LIMIT = 200;
const POLICY_HISTORY_LIMIT = 50;

export interface GdpHistoryPoint {
  gdp: number;
  recordedAt: string;
}

export async function loadStats(countryId: string): Promise<{
  gdpHistory: GdpHistoryPoint[];
  policyHistory: PolicyHistoryEntry[];
}> {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/login");
  }

  const [{ data: gdpRows, error: gdpError }, { data: historyRows, error: historyError }] =
    await Promise.all([
      supabase
        .from("gdp_history")
        .select("gdp, recorded_at")
        .eq("country_id", countryId)
        .order("recorded_at", { ascending: false })
        .limit(GDP_HISTORY_LIMIT),
      supabase
        .from("policy_history")
        .select("id, title, primary_sector, stat_deltas, cost_paid, started_at, settled_at")
        .eq("country_id", countryId)
        .order("settled_at", { ascending: false })
        .limit(POLICY_HISTORY_LIMIT),
    ]);

  if (gdpError || !gdpRows) {
    throw new Error(`Failed to load GDP history: ${gdpError?.message}`);
  }
  if (historyError || !historyRows) {
    throw new Error(`Failed to load policy history: ${historyError?.message}`);
  }

  return {
    gdpHistory: gdpRows
      .map((r) => ({ gdp: r.gdp, recordedAt: r.recorded_at }))
      .reverse(),
    policyHistory: historyRows.map((r) => ({
      id: r.id,
      title: r.title,
      primarySector: r.primary_sector as Sector,
      statDeltas: r.stat_deltas as StatDeltas,
      costPaid: r.cost_paid,
      startedAt: r.started_at,
      settledAt: r.settled_at!,
    })),
  };
}
