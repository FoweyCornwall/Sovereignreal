"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Fire-and-forget: the tour dismiss shouldn't block the UI. If the
// update fails, the tour re-shows on the next page load - fine, not a
// data-loss risk.
export async function markOnboardingSeen(): Promise<void> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  await supabase
    .from("profiles")
    .update({ has_seen_onboarding: true })
    .eq("id", userData.user.id);
}

// Replay from Settings: reset the flag so the tour retriggers on the
// next authenticated page load. Called from the "Replay Tutorial"
// button; revalidates the game layout so the flag is re-read.
export async function replayOnboarding(): Promise<void> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  await supabase
    .from("profiles")
    .update({ has_seen_onboarding: false })
    .eq("id", userData.user.id);

  revalidatePath("/", "layout");
}
