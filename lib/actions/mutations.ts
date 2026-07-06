"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Sector } from "@/lib/game/constants";
import type { EnactMutationResult, MutationItem } from "@/lib/types/game";

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

export async function getMutationShopItems(): Promise<MutationItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("mutation_item_library")
    .select("id, key, title, description, target_sectors, proc_multiplier, duration_seconds, base_cost")
    .eq("is_active", true);

  if (error || !data) {
    throw new Error(`Failed to load mutation shop: ${error?.message}`);
  }

  return data.map((item) => ({
    id: item.id,
    key: item.key,
    title: item.title,
    description: item.description,
    targetSectors: item.target_sectors as Sector[],
    procMultiplier: item.proc_multiplier,
    durationSeconds: item.duration_seconds,
    baseCost: item.base_cost,
  }));
}

export async function enactMutationItem(itemId: string): Promise<EnactMutationResult> {
  const supabase = await createClient();
  const { countryId } = await requireCountryId();

  const { data, error } = await supabase.rpc("enact_mutation_item", {
    p_country_id: countryId,
    p_item_id: itemId,
  });

  if (error) {
    throw new Error(`Failed to enact mutation item: ${error.message}`);
  }

  const result = data as { ok: boolean; reason?: string; shortfall?: number };

  if (!result.ok) {
    if (result.reason === "INSUFFICIENT_FUNDS") {
      return { ok: false, reason: "INSUFFICIENT_FUNDS", shortfall: result.shortfall ?? 0 };
    }
    if (result.reason === "QUEUE_FULL") {
      return { ok: false, reason: "QUEUE_FULL" };
    }
    return { ok: false, reason: "ITEM_NOT_FOUND" };
  }

  return { ok: true };
}
