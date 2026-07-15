import { createClient } from "@/lib/supabase/server";
import type { Country, SectorMutation, SectorState } from "@/lib/types/game";
import type { Sector } from "@/lib/game/constants";
import { redirect } from "next/navigation";

function mapCountry(row: {
  id: string;
  user_id: string | null;
  name: string;
  username: string | null;
  flag_emoji: string | null;
  flag_style: unknown;
  country_code: string | null;
  gdp: number;
  gdp_per_sec: number;
  treasury: number;
  treasury_regen_per_sec: number;
  last_settled_at: string;
  prestige_count?: number | null;
  prestige_gdp_bonus?: number | null;
  prestige_mutation_bonus?: number | null;
}): Country {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    username: row.username,
    flagEmoji: row.flag_emoji,
    flagStyle: row.flag_style as Country["flagStyle"],
    countryCode: row.country_code,
    gdp: row.gdp,
    gdpPerSec: row.gdp_per_sec,
    treasury: row.treasury,
    treasuryRegenPerSec: row.treasury_regen_per_sec,
    lastSettledAt: row.last_settled_at,
    prestigeCount: row.prestige_count ?? 0,
    prestigeGdpBonus: Number(row.prestige_gdp_bonus ?? 0),
    prestigeMutationBonus: Number(row.prestige_mutation_bonus ?? 0),
  };
}

// Loads the current user's country, settling any elapsed time/completed
// policies first (lazy-settle - see settle_country() in 0001_init.sql).
// Redirects to /setup if the user has no country yet, and to /login if
// unauthenticated. Use this at the top of every authenticated game page.
export async function loadGameState(): Promise<{
  country: Country;
  sectors: SectorState[];
  mutations: SectorMutation[];
  credits: number;
  lastDailyClaimAt: string | null;
  equippedSectorTheme: "ice" | "fire" | null;
  vipExpiresAt: string | null;
  lastFreeRestockAt: string | null;
}> {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/login");
  }

  const { data: existing } = await supabase
    .from("countries")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!existing) {
    redirect("/setup");
  }

  const { data: settled, error: settleError } = await supabase.rpc(
    "settle_country",
    { p_country_id: existing.id }
  );
  if (settleError || !settled) {
    throw new Error(`Failed to settle country: ${settleError?.message}`);
  }

  const { data: sectorRows, error: sectorError } = await supabase
    .from("sector_state")
    .select("sector, score, previous_score")
    .eq("country_id", existing.id);

  if (sectorError || !sectorRows) {
    throw new Error(`Failed to load sector state: ${sectorError?.message}`);
  }

  const { data: mutationRows, error: mutationError } = await supabase
    .from("sector_mutations")
    .select("sector, rarity, multiplier, acquired_at")
    .eq("country_id", existing.id);

  if (mutationError) {
    throw new Error(`Failed to load mutations: ${mutationError.message}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "credits, last_daily_claim_at, equipped_sector_theme, vip_expires_at, last_free_restock_at"
    )
    .eq("id", userData.user.id)
    .maybeSingle();

  return {
    country: mapCountry(settled),
    sectors: sectorRows.map((r) => ({
      sector: r.sector as Sector,
      score: r.score,
      previousScore: r.previous_score,
    })),
    mutations: (mutationRows ?? []).map((m) => ({
      sector: m.sector as Sector,
      rarity: m.rarity as SectorMutation["rarity"],
      multiplier: m.multiplier,
      acquiredAt: m.acquired_at,
    })),
    credits: profile?.credits ?? 0,
    lastDailyClaimAt: profile?.last_daily_claim_at ?? null,
    equippedSectorTheme: (profile?.equipped_sector_theme as "ice" | "fire" | null) ?? null,
    vipExpiresAt: profile?.vip_expires_at ?? null,
    lastFreeRestockAt: profile?.last_free_restock_at ?? null,
  };
}
