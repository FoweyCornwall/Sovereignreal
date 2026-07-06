import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { GameNav } from "@/components/nav/GameNav";

export default async function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 justify-center">
      <div className="flex flex-1 max-w-4xl w-full">
        <GameNav />
        <main className="flex-1 min-w-0 pb-16 sm:pb-0">
          <div className="mx-auto max-w-2xl w-full px-4 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
