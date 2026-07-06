import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CountrySetupForm } from "@/components/countryPicker/CountrySetupForm";

export default async function SetupPage() {
  const supabase = await createClient();
  const { data: userData, error } = await supabase.auth.getUser();

  if (error || !userData.user) {
    redirect("/login");
  }

  const { data: existing } = await supabase
    .from("countries")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (existing) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Found Your Nation</h1>
        <p className="text-sm text-zinc-500">
          Every player starts from the exact same baseline: zeroed sectors and
          a fixed starting treasury. What happens from here is up to you.
        </p>
      </div>
      <CountrySetupForm />
    </div>
  );
}
