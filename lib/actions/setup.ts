"use server";

import { createClient } from "@/lib/supabase/server";
import { SECTORS, STARTING_CREDITS, STARTING_TREASURY } from "@/lib/game/constants";
import { redirect } from "next/navigation";

export interface CreateCountryInput {
  name: string;
  flagEmoji?: string;
  flagStyle?: { bg: string; pattern?: string };
  countryCode?: string;
}

export async function createCountry(input: CreateCountryInput) {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/login");
  }

  const trimmedName = input.name.trim();
  if (!trimmedName) {
    return { ok: false as const, reason: "NAME_REQUIRED" as const };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userData.user.id)
    .maybeSingle();

  const { data: country, error: insertError } = await supabase
    .from("countries")
    .insert({
      user_id: userData.user.id,
      name: trimmedName,
      username: profile?.username ?? null,
      flag_emoji: input.flagEmoji ?? null,
      flag_style: input.flagStyle ?? null,
      country_code: input.countryCode ?? null,
      gdp: 0,
      gdp_per_sec: 0,
      treasury: STARTING_TREASURY,
      treasury_regen_per_sec: 0.5,
      credits: STARTING_CREDITS,
    })
    .select("id")
    .single();

  if (insertError || !country) {
    return { ok: false as const, reason: "INSERT_FAILED" as const, message: insertError?.message };
  }

  const { error: sectorError } = await supabase.from("sector_state").insert(
    SECTORS.map((sector) => ({
      country_id: country.id,
      sector,
      score: 0,
      previous_score: 0,
    }))
  );

  if (sectorError) {
    return { ok: false as const, reason: "INSERT_FAILED" as const, message: sectorError.message };
  }

  redirect("/dashboard");
}
