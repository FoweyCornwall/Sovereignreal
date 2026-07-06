"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export type UpdateUsernameResult =
  | { ok: true }
  | { ok: false; reason: "INVALID_FORMAT" | "TAKEN" | "UPDATE_FAILED"; message?: string };

export async function updateUsername(newUsername: string): Promise<UpdateUsernameResult> {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/login");
  }

  const trimmed = newUsername.trim();
  if (!USERNAME_PATTERN.test(trimmed)) {
    return { ok: false, reason: "INVALID_FORMAT" };
  }

  const { data: available, error: availError } = await supabase.rpc(
    "is_username_available",
    { p_username: trimmed }
  );
  if (availError) {
    return { ok: false, reason: "UPDATE_FAILED", message: availError.message };
  }
  if (!available) {
    return { ok: false, reason: "TAKEN" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ username: trimmed })
    .eq("id", userData.user.id);

  if (error) {
    return { ok: false, reason: "UPDATE_FAILED", message: error.message };
  }

  return { ok: true };
}

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
