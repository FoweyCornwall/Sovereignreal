"use server";

import { createClient } from "@/lib/supabase/server";
import type { Sector } from "@/lib/game/constants";
import type {
  EnactPolicyResult,
  RefreshStoreResult,
  StatDeltas,
  StoreSlot,
} from "@/lib/types/game";
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

export async function getStore(): Promise<{ slots: StoreSlot[]; restockAt: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_store");

  if (error || !data) {
    throw new Error(`Failed to load store: ${error?.message}`);
  }

  return {
    restockAt: data[0]?.restock_at ?? new Date().toISOString(),
    slots: data.map((row) => ({
      slotPosition: row.slot_position,
      id: row.policy_id,
      key: row.policy_id,
      title: row.title,
      description: row.description,
      tier: row.tier,
      primarySector: row.primary_sector as Sector,
      statDeltas: row.stat_deltas as StatDeltas,
      baseCost: row.base_cost,
      durationSeconds: row.duration_seconds,
      quantity: row.quantity,
      initialQuantity: row.initial_quantity,
    })),
  };
}

export async function enactStorePolicy(
  slotPosition: number,
  expectedPolicyId: string
): Promise<EnactPolicyResult> {
  const supabase = await createClient();
  const { countryId } = await requireCountryId();

  const { data, error } = await supabase.rpc("enact_store_policy", {
    p_country_id: countryId,
    p_position: slotPosition,
    p_expected_policy_id: expectedPolicyId,
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
    if (
      result.reason === "QUEUE_FULL" ||
      result.reason === "SOLD_OUT" ||
      result.reason === "STALE_SLOT"
    ) {
      return { ok: false, reason: result.reason };
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

export async function refreshStore(): Promise<RefreshStoreResult> {
  const supabase = await createClient();
  const { countryId } = await requireCountryId();

  const { data, error } = await supabase.rpc("refresh_store", {
    p_country_id: countryId,
  });

  if (error) {
    throw new Error(`Failed to refresh store: ${error.message}`);
  }

  const result = data as { ok: boolean; reason?: string; shortfall?: number };

  if (!result.ok) {
    return {
      ok: false,
      reason: "INSUFFICIENT_CREDITS",
      shortfall: result.shortfall ?? 0,
    };
  }

  return { ok: true };
}

export type SkipActivePolicyResult =
  | { ok: true }
  | { ok: false; reason: "INSUFFICIENT_CREDITS"; shortfall: number }
  | { ok: false; reason: "ALREADY_DUE" | "NOT_FOUND" };

export async function skipActivePolicy(activePolicyId: string): Promise<SkipActivePolicyResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("skip_active_policy", {
    p_active_policy_id: activePolicyId,
  });

  if (error) {
    throw new Error(`Failed to skip timer: ${error.message}`);
  }

  const result = data as { ok: boolean; reason?: string; shortfall?: number };
  if (!result.ok) {
    if (result.reason === "INSUFFICIENT_CREDITS") {
      return { ok: false, reason: "INSUFFICIENT_CREDITS", shortfall: result.shortfall ?? 0 };
    }
    if (result.reason === "ALREADY_DUE") {
      return { ok: false, reason: "ALREADY_DUE" };
    }
    return { ok: false, reason: "NOT_FOUND" };
  }

  return { ok: true };
}

export type ClaimVipFreeRestockResult =
  | { ok: true }
  | { ok: false; reason: "NOT_VIP" | "ON_COOLDOWN"; retryAt?: string };

export async function claimVipFreeRestock(): Promise<ClaimVipFreeRestockResult> {
  const supabase = await createClient();
  const { countryId } = await requireCountryId();

  const { data, error } = await supabase.rpc("claim_vip_free_restock", {
    p_country_id: countryId,
  });

  if (error) {
    throw new Error(`Failed to claim VIP restock: ${error.message}`);
  }

  const result = data as { ok: boolean; reason?: string; retry_at?: string };
  if (!result.ok) {
    if (result.reason === "ON_COOLDOWN") {
      return { ok: false, reason: "ON_COOLDOWN", retryAt: result.retry_at };
    }
    return { ok: false, reason: "NOT_VIP" };
  }

  return { ok: true };
}
