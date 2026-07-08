"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type ClaimDailyRewardResult =
  | { ok: true; creditsGranted: number }
  | { ok: false; reason: "ALREADY_CLAIMED" }
  | { ok: false; reason: "FAILED"; message: string };

export async function claimDailyReward(): Promise<ClaimDailyRewardResult> {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("claim_daily_reward");
  if (error) {
    return { ok: false, reason: "FAILED", message: error.message };
  }

  const result = data as { ok: boolean; reason?: string; credits_granted?: number };
  if (!result.ok) {
    if (result.reason === "ALREADY_CLAIMED") return { ok: false, reason: "ALREADY_CLAIMED" };
    return { ok: false, reason: "FAILED", message: result.reason ?? "unknown" };
  }

  return { ok: true, creditsGranted: result.credits_granted ?? 5 };
}
