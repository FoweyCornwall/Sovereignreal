"use client";

import { useState } from "react";
import { StoreGrid } from "@/components/policies/StoreGrid";
import { MutationShop } from "@/components/policies/MutationShop";
import type { MutationItem, StoreSlot } from "@/lib/types/game";

type Tab = "store" | "mutations";

export function PolicyMutationTabs({
  slots,
  restockAt,
  mutationItems,
  gdp,
  credits,
}: {
  slots: StoreSlot[];
  restockAt: string;
  mutationItems: MutationItem[];
  gdp: number;
  credits: number;
}) {
  const [tab, setTab] = useState<Tab>("store");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex rounded-full border border-zinc-200 dark:border-zinc-800 p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab("store")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            tab === "store" ? "bg-amber-500 text-black" : "text-zinc-500"
          }`}
        >
          Store
        </button>
        <button
          type="button"
          onClick={() => setTab("mutations")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            tab === "mutations" ? "bg-amber-500 text-black" : "text-zinc-500"
          }`}
        >
          Mutations
        </button>
      </div>

      {tab === "store" ? (
        <StoreGrid initialSlots={slots} restockAt={restockAt} gdp={gdp} credits={credits} />
      ) : (
        <MutationShop items={mutationItems} gdp={gdp} />
      )}
    </div>
  );
}
