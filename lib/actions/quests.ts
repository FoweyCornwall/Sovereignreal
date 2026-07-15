"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type ClaimQuestResult =
  | { ok: true; creditsGranted: number }
  | { ok: false; reason: "NOT_FOUND" | "NOT_COMPLETE" | "ALREADY_CLAIMED" | "UNKNOWN"; message?: string };

export async function claimQuest(questId: string): Promise<ClaimQuestResult> {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("claim_daily_quest", {
    p_quest_id: questId,
  });
  if (error) {
    return { ok: false, reason: "UNKNOWN", message: error.message };
  }

  const result = data as unknown as
    | { ok: true; creditsGranted: number }
    | { ok: false; reason: string };

  if (!result.ok) {
    if (
      result.reason === "NOT_FOUND" ||
      result.reason === "NOT_COMPLETE" ||
      result.reason === "ALREADY_CLAIMED"
    ) {
      return { ok: false, reason: result.reason };
    }
    return { ok: false, reason: "UNKNOWN" };
  }

  return { ok: true, creditsGranted: result.creditsGranted };
}
