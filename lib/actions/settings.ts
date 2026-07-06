"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function deleteAndRestart() {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("countries")
    .delete()
    .eq("user_id", userData.user.id);

  if (error) {
    throw new Error(`Failed to delete country: ${error.message}`);
  }

  redirect("/setup");
}
