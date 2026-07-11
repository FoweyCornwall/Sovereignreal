import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/actions/auth";
import { DeleteAndRestartButton } from "@/components/settings/DeleteAndRestartButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { UsernameForm } from "@/components/settings/UsernameForm";
import { CreditsPanel } from "@/components/settings/CreditsPanel";
import { VipPanel } from "@/components/settings/VipPanel";
import { ChangeCountryPanel } from "@/components/settings/ChangeCountryPanel";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, credits, vip_expires_at")
    .eq("id", userData.user.id)
    .maybeSingle();

  const { data: country } = await supabase
    .from("countries")
    .select("name, flag_emoji, flag_style, country_code, identity_updated_at")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
          Username
        </h2>
        <UsernameForm currentUsername={profile?.username ?? null} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
          Credits
        </h2>
        <CreditsPanel credits={profile?.credits ?? 0} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
          VIP
        </h2>
        <VipPanel vipExpiresAt={profile?.vip_expires_at ?? null} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
          Appearance
        </h2>
        <ThemeToggle />
      </div>

      {country && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
            Change Country
          </h2>
          <p className="text-xs text-zinc-500">
            Change your name and flag without resetting your progress. Once every 24 hours.
          </p>
          <ChangeCountryPanel
            initialValues={{
              name: country.name,
              flagEmoji: country.flag_emoji,
              flagStyle: country.flag_style as { bg: string; pattern?: string } | null,
              countryCode: country.country_code,
            }}
            identityUpdatedAt={country.identity_updated_at}
          />
        </div>
      )}

      <form action={signOut}>
        <button
          type="submit"
          className="rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 py-2 px-4"
        >
          Sign out
        </button>
      </form>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
          Danger Zone
        </h2>
        <DeleteAndRestartButton />
      </div>
    </div>
  );
}
