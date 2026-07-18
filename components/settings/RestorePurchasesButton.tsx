"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreMyPurchases } from "@/lib/actions/billing";
import { RefreshCw } from "lucide-react";

// Shared "Restore Purchases" affordance used by both the Credits panel
// and the VIP panel. Calls the recovery action, shows a short toast
// beneath the button, and refreshes the layout so credit/VIP counters
// update in place.
export function RestorePurchasesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await restoreMyPurchases();
      if (result.restored > 0) {
        setMessage(
          `Restored ${result.restored} purchase${result.restored === 1 ? "" : "s"}!`
        );
        router.refresh();
      } else if (result.errors.length > 0) {
        setMessage("Something went wrong. Please contact support.");
      } else {
        setMessage("Everything is already synced!");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="flex items-center gap-2 text-xs rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 px-3 py-2 w-fit disabled:opacity-50"
      >
        <RefreshCw size={14} className={pending ? "animate-spin" : ""} />
        Restore Purchases
      </button>
      {message && <p className="text-xs text-zinc-500">{message}</p>}
    </div>
  );
}
