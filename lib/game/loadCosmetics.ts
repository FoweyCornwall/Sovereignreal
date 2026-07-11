import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { SectorTheme } from "@/lib/game/cosmetics";

export async function loadCosmetics(): Promise<{
  ownedPackKeys: string[];
  equippedSectorTheme: SectorTheme | null;
  credits: number;
}> {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/login");
  }

  const [{ data: owned }, { data: profile }] = await Promise.all([
    supabase.from("user_cosmetics").select("pack_key").eq("user_id", userData.user.id),
    supabase
      .from("profiles")
      .select("equipped_sector_theme, credits")
      .eq("id", userData.user.id)
      .maybeSingle(),
  ]);

  return {
    ownedPackKeys: (owned ?? []).map((r) => r.pack_key),
    equippedSectorTheme: (profile?.equipped_sector_theme as SectorTheme | null) ?? null,
    credits: profile?.credits ?? 0,
  };
}
