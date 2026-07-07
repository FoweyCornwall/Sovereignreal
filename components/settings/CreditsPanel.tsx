"use client";

import { useTransition } from "react";
import { CREDIT_PACKS } from "@/lib/billing/creditPacks";
import { createCheckoutSession } from "@/lib/actions/billing";
import { formatWithCommas } from "@/lib/game/format";

export function CreditsPanel({ credits }: { credits: number }) {
  const [pending, startTransition] = useTransition();

  function handleBuy(packKey: string) {
    startTransition(() => createCheckoutSession(packKey));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        Balance: <span className="font-semibold tabular-nums">{formatWithCommas(credits)}</span> credits
      </p>
      <div className="flex flex-col gap-2">
        {CREDIT_PACKS.map((pack) => (
          <button
            key={pack.key}
            type="button"
            onClick={() => handleBuy(pack.key)}
            disabled={pending}
            className="flex items-center justify-between rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm px-4 py-2 text-sm disabled:opacity-50"
          >
            <span>{pack.label}</span>
            <span className="font-medium">${(pack.priceCents / 100).toFixed(2)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
