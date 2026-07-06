"use server";

import { createClient } from "@/lib/supabase/server";
import { POLICY_HAND_SIZE, TIER_DRAW_WEIGHT, type Sector } from "@/lib/game/constants";
import type { EnactPolicyResult, PolicyCard, StatDeltas } from "@/lib/types/game";
import { redirect } from "next/navigation";

async function requireCountryId(): Promise<{ countryId: string }> {
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

  return { countryId: country.id };
}

function weightedSample<T extends { tier: number }>(pool: T[], count: number): T[] {
  const remaining = [...pool];
  const picked: T[] = [];

  while (remaining.length > 0 && picked.length < count) {
    const totalWeight = remaining.reduce(
      (sum, item) => sum + (TIER_DRAW_WEIGHT[item.tier as 1 | 2 | 3 | 4 | 5] ?? 1),
      0
    );
    let roll = Math.random() * totalWeight;
    let index = 0;
    for (; index < remaining.length; index++) {
      roll -= TIER_DRAW_WEIGHT[remaining[index].tier as 1 | 2 | 3 | 4 | 5] ?? 1;
      if (roll <= 0) break;
    }
    const chosenIndex = Math.min(index, remaining.length - 1);
    picked.push(remaining[chosenIndex]);
    remaining.splice(chosenIndex, 1);
  }

  return picked;
}

export async function getHand(): Promise<PolicyCard[]> {
  const supabase = await createClient();

  const { data: policies, error } = await supabase
    .from("policy_library")
    .select("id, key, title, description, tier, primary_sector, stat_deltas, base_cost, duration_seconds")
    .eq("is_active", true);

  if (error || !policies) {
    throw new Error(`Failed to load policy library: ${error?.message}`);
  }

  const hand = weightedSample(policies, POLICY_HAND_SIZE);

  return hand.map((p) => ({
    id: p.id,
    key: p.key,
    title: p.title,
    description: p.description,
    tier: p.tier,
    primarySector: p.primary_sector as Sector,
    statDeltas: p.stat_deltas as StatDeltas,
    baseCost: p.base_cost,
    durationSeconds: p.duration_seconds,
  }));
}

export async function enactPolicy(policyId: string): Promise<EnactPolicyResult> {
  const supabase = await createClient();
  const { countryId } = await requireCountryId();

  const { data, error } = await supabase.rpc("enact_policy", {
    p_country_id: countryId,
    p_policy_id: policyId,
  });

  if (error) {
    throw new Error(`Failed to enact policy: ${error.message}`);
  }

  const result = data as {
    ok: boolean;
    reason?: string;
    shortfall?: number;
    active_policy?: {
      id: string;
      country_id: string;
      policy_id: string;
      tier: number;
      cost_paid: number;
      stat_deltas: StatDeltas;
      started_at: string;
      completes_at: string;
    };
  };

  if (!result.ok) {
    if (result.reason === "INSUFFICIENT_FUNDS") {
      return { ok: false, reason: "INSUFFICIENT_FUNDS", shortfall: result.shortfall ?? 0 };
    }
    return { ok: false, reason: "POLICY_NOT_FOUND" };
  }

  const ap = result.active_policy!;

  const { data: policyRow } = await supabase
    .from("policy_library")
    .select("title, primary_sector")
    .eq("id", ap.policy_id)
    .single();

  return {
    ok: true,
    activePolicy: {
      id: ap.id,
      countryId: ap.country_id,
      policyId: ap.policy_id,
      title: policyRow?.title ?? "Policy",
      tier: ap.tier,
      primarySector: (policyRow?.primary_sector ?? "economy") as Sector,
      costPaid: ap.cost_paid,
      statDeltas: ap.stat_deltas,
      startedAt: ap.started_at,
      completesAt: ap.completes_at,
    },
  };
}
