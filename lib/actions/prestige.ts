"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type AscendResult =
  | {
      ok: true;
      prestigeCount: number;
      prestigeGdpBonus: number;
      prestigeMutationBonus: number;
    }
  | { ok: false; reason: "NOT_ELIGIBLE"; requiredGdp: number; currentGdp: number }
  | { ok: false; reason: "UNKNOWN"; message?: string };

export async function ascendCountry(): Promise<AscendResult> {
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
        prestigeMutationBonus: number | string;
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
    prestigeMutationBonus: Number(result.prestigeMutationBonus),
  };
}
