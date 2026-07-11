import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getRecentMatches } from "@/lib/actions/pvpMatch";
import { BattleClient } from "@/components/pvp/BattleClient";

export default async function BattlePage() {
  const supabase = await createClient();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) {
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

  const [{ data: activeMatch }, recentMatches] = await Promise.all([
    supabase
      .from("pvp_matches")
      .select("id")
      .or(`side_a_country_id.eq.${country.id},side_b_country_id.eq.${country.id}`)
      .eq("status", "active")
      .maybeSingle(),
    getRecentMatches(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Battle</h1>
      <BattleClient
        countryId={country.id}
        initialMatchId={activeMatch?.id ?? null}
        recentMatches={recentMatches}
      />
    </div>
  );
}
