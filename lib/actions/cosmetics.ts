"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { SectorTheme } from "@/lib/game/cosmetics";

export type PurchaseCosmeticResult =
  | { ok: true }
  | { ok: false; reason: "ALREADY_OWNED" | "PACK_NOT_FOUND" }
  | { ok: false; reason: "INSUFFICIENT_CREDITS"; shortfall: number };

export async function purchaseCosmeticPack(packKey: string): Promise<PurchaseCosmeticResult> {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("purchase_cosmetic_pack", { p_pack_key: packKey });
  if (error) {
    throw new Error(`Failed to purchase cosmetic pack: ${error.message}`);
  }

  const result = data as { ok: boolean; reason?: string; shortfall?: number };
  if (!result.ok) {
    if (result.reason === "INSUFFICIENT_CREDITS") {
      return { ok: false, reason: "INSUFFICIENT_CREDITS", shortfall: result.shortfall ?? 0 };
    }
    if (result.reason === "ALREADY_OWNED") return { ok: false, reason: "ALREADY_OWNED" };
    return { ok: false, reason: "PACK_NOT_FOUND" };
  }

  return { ok: true };
}

export async function equipSectorTheme(theme: SectorTheme | null): Promise<{ ok: boolean }> {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("equip_sector_theme", { p_theme: theme });
  if (error) {
    throw new Error(`Failed to equip theme: ${error.message}`);
  }

  const result = data as { ok: boolean };
  return { ok: result.ok };
}
