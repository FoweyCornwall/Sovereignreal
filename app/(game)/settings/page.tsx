import { signOut } from "@/lib/actions/auth";
import { DeleteAndRestartButton } from "@/components/settings/DeleteAndRestartButton";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      <form action={signOut}>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 dark:border-zinc-700 py-2 px-4"
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
