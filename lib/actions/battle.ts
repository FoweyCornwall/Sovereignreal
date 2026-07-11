"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export interface BattleResult {
  id: string;
  attacker_id: string;
  defender_id: string;
  defender_is_bot: boolean;
  winner_id: string;
  attacker_power: number;
  defender_power: number;
  loot_amount: number;
  created_at: string;
}

export type FindBattleResult =
  | { ok: true; matched: false }
  | { ok: true; matched: true; isBot: boolean; battle: BattleResult }
  | { ok: false; reason: string };

async function requireCountryId(): Promise<string> {
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

  return country.id;
}

export async function findBattle(): Promise<FindBattleResult> {
  const supabase = await createClient();
  const countryId = await requireCountryId();

  const { data, error } = await supabase.rpc("find_battle", { p_country_id: countryId });
  if (error) {
    throw new Error(`Failed to find battle: ${error.message}`);
  }

  const result = data as unknown as {
    ok: boolean;
    matched?: boolean;
    is_bot?: boolean;
    battle?: BattleResult;
    reason?: string;
  };

  if (!result.ok) {
    return { ok: false, reason: result.reason ?? "UNKNOWN" };
  }
  if (!result.matched) {
    return { ok: true, matched: false };
  }
  return { ok: true, matched: true, isBot: result.is_bot ?? false, battle: result.battle! };
}

export async function cancelBattleSearch(): Promise<void> {
  const supabase = await createClient();
  const countryId = await requireCountryId();

  await supabase.rpc("cancel_battle_search", { p_country_id: countryId });
}

export interface RecentBattle {
  id: string;
  attackerId: string;
  attackerName: string;
  defenderId: string;
  defenderName: string;
  defenderIsBot: boolean;
  winnerId: string | null;
  lootAmount: number;
  createdAt: string;
}

export async function getRecentBattles(): Promise<RecentBattle[]> {
  const supabase = await createClient();
  const countryId = await requireCountryId();

  const { data, error } = await supabase.rpc("get_recent_battles", {
    p_country_id: countryId,
    p_limit: 20,
  });

  if (error) {
    throw new Error(`Failed to load battle history: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    attackerId: row.attacker_id,
    attackerName: row.attacker_name,
    defenderId: row.defender_id,
    defenderName: row.defender_name,
    defenderIsBot: row.defender_is_bot,
    winnerId: row.winner_id,
    lootAmount: row.loot_amount,
    createdAt: row.created_at,
    id: row.id,
  }));
}
