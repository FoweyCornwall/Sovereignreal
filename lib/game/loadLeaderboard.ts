import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isVipActive } from "@/lib/game/vip";
import type { LeaderboardEntry } from "@/lib/types/game";

const LEADERBOARD_LIMIT = 100;

export async function loadLeaderboard(): Promise<{
  entries: LeaderboardEntry[];
  myCountryId: string;
  myRank: number;
  myCountry: LeaderboardEntry;
}> {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/login");
  }

  const { data: country } = await supabase
    .from("countries")
    .select("id, name, username, flag_emoji, flag_style, country_code, gdp")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!country) {
    redirect("/setup");
  }

  const [
    { data: rows, error: leaderboardError },
    { data: rank, error: rankError },
    { data: profile },
  ] = await Promise.all([
    supabase.rpc("get_leaderboard", { p_limit: LEADERBOARD_LIMIT }),
    supabase.rpc("get_my_rank", { p_country_id: country.id }),
    supabase.from("profiles").select("vip_expires_at").eq("id", userData.user.id).maybeSingle(),
  ]);

  if (leaderboardError || !rows) {
    throw new Error(`Failed to load leaderboard: ${leaderboardError?.message}`);
  }
  if (rankError || rank == null) {
    throw new Error(`Failed to load rank: ${rankError?.message}`);
  }

  return {
    entries: rows.map((r) => ({
      countryId: r.country_id,
      name: r.name,
      username: r.username,
      flagEmoji: r.flag_emoji,
      flagStyle: r.flag_style as LeaderboardEntry["flagStyle"],
      countryCode: r.country_code,
      gdp: r.gdp,
      rank: r.rank,
      isVip: r.is_vip,
    })),
    myCountryId: country.id,
    myRank: rank,
    myCountry: {
      countryId: country.id,
      name: country.name,
      username: country.username,
      flagEmoji: country.flag_emoji,
      flagStyle: country.flag_style as LeaderboardEntry["flagStyle"],
      countryCode: country.country_code,
      gdp: country.gdp,
      rank,
      isVip: isVipActive(profile?.vip_expires_at ?? null),
    } satisfies LeaderboardEntry,
  };
}
