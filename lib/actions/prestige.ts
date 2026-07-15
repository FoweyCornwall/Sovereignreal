"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type RebirthResult =
  | {
      ok: true;
      prestigeCount: number;
      prestigeGdpBonus: number;
      prestigeTreasuryBonus: number;
    }
  | { ok: false; reason: "NOT_ELIGIBLE"; requiredGdp: number; currentGdp: number }
  | { ok: false; reason: "UNKNOWN"; message?: string };

// SQL identifier stays `ascend_country` (see lib/game/prestige.ts note);
// this action's name matches the user-facing "Rebirth" copy.
export async function rebirthCountry(): Promise<RebirthResult> {
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

  const { data, error } = await supabase.rpc("ascend_country", {
    p_country_id: country.id,
  });
  if (error) {
    return { ok: false, reason: "UNKNOWN", message: error.message };
  }

  const result = data as unknown as
    | {
        ok: true;
        prestigeCount: number;
        prestigeGdpBonus: number | string;
        prestigeTreasuryBonus: number | string;
      }
    | { ok: false; reason: string; requiredGdp?: number; currentGdp?: number };

  if (!result.ok) {
    if (result.reason === "NOT_ELIGIBLE") {
      return {
        ok: false,
        reason: "NOT_ELIGIBLE",
        requiredGdp: Number(result.requiredGdp ?? 0),
        currentGdp: Number(result.currentGdp ?? 0),
      };
    }
    return { ok: false, reason: "UNKNOWN" };
  }

  return {
    ok: true,
    prestigeCount: result.prestigeCount,
    prestigeGdpBonus: Number(result.prestigeGdpBonus),
    prestigeTreasuryBonus: Number(result.prestigeTreasuryBonus),
  };
}
