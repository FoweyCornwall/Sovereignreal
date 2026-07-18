"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SECTOR_LABELS } from "@/lib/game/constants";
import { computeEffectiveCost } from "@/lib/game/store";
import { formatDuration, formatWithCommas } from "@/lib/game/format";
import { enactMutationItem } from "@/lib/actions/mutations";
import { MutationOddsTable } from "@/components/policies/MutationOddsTable";
import type { MutationItem } from "@/lib/types/game";

export function MutationShop({ items, gdp }: { items: MutationItem[]; gdp: number }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleBuy(item: MutationItem) {
    setMessage(null);
    startTransition(async () => {
      const result = await enactMutationItem(item.id);
      if (result.ok) {
        setMessage(`${item.title} activated.`);
        router.refresh();
      } else if (result.reason === "INSUFFICIENT_FUNDS") {
        setMessage(`Not enough treasury! You need ${formatWithCommas(result.shortfall)} more.`);
      } else if (result.reason === "QUEUE_FULL") {
        setMessage("You already have 7 things in progress. Wait for one to finish!");
      } else {
        setMessage("That item is no longer available.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Mutation Shop</h1>
        <p className="text-xs text-zinc-500">
          Temporarily boosts the odds of a sector randomly mutating.
        </p>
      </div>

      {message && (
        <p className="text-sm rounded-xl bg-zinc-100 dark:bg-zinc-900 px-3 py-2">
          {message}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((item) => {
          const effectiveCost = computeEffectiveCost(item.baseCost, gdp);
          return (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-2xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-4"
            >
              <h3 className="font-semibold">{item.title}</h3>
              {item.description && (
                <p className="text-sm text-zinc-500">{item.description}</p>
              )}
              <p className="text-sm">
                ×{item.procMultiplier} mutation odds on{" "}
                {item.targetSectors.map((s) => SECTOR_LABELS[s]).join(", ")}
              </p>
              <div className="flex items-center justify-between text-sm text-zinc-500">
                <span>Cost: {formatWithCommas(effectiveCost)}</span>
                <span>{formatDuration(item.durationSeconds)}</span>
              </div>
              <button
                type="button"
                onClick={() => handleBuy(item)}
                disabled={pending}
                className="rounded-xl bg-brand-500 text-black font-medium py-2.5 shadow-sm shadow-brand-500/20 disabled:opacity-50"
              >
                Activate
              </button>
            </div>
          );
        })}
      </div>

      <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mt-2">
        Mutation Odds
      </h2>
      <MutationOddsTable />
    </div>
  );
}
