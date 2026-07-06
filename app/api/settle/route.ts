import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: country } = await supabase
    .from("countries")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!country) {
    return NextResponse.json({ error: "no country" }, { status: 404 });
  }

  const { data: settled, error: settleError } = await supabase.rpc(
    "settle_country",
    { p_country_id: country.id }
  );

  if (settleError) {
    return NextResponse.json({ error: settleError.message }, { status: 500 });
  }

  return NextResponse.json({ country: settled });
}
