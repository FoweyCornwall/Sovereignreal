import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/actions/auth";
import { DeleteAndRestartButton } from "@/components/settings/DeleteAndRestartButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { UsernameForm } from "@/components/settings/UsernameForm";
import { CreditsPanel } from "@/components/settings/CreditsPanel";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: country }] = await Promise.all([
    supabase.from("profiles").select("username").eq("id", userData.user.id).maybeSingle(),
    supabase.from("countries").select("credits").eq("user_id", userData.user.id).maybeSingle(),
  ]);

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
        <CreditsPanel credits={country?.credits ?? 0} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
          Appearance
        </h2>
        <ThemeToggle />
      </div>

      <form action={signOut}>
        <button
          type="submit"
          className="rounded-full border border-zinc-300 dark:border-zinc-700 py-2 px-4"
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
