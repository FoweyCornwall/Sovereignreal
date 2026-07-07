"use client";

import { useState } from "react";
import { StoreGrid } from "@/components/policies/StoreGrid";
import { MutationShop } from "@/components/policies/MutationShop";
import type { MutationItem, SectorState, StoreSlot } from "@/lib/types/game";

type Tab = "store" | "mutations";

export function PolicyMutationTabs({
  slots,
  restockAt,
  mutationItems,
  sectors,
  gdp,
  credits,
}: {
  slots: StoreSlot[];
  restockAt: string;
  mutationItems: MutationItem[];
  sectors: SectorState[];
  gdp: number;
  credits: number;
}) {
  const [tab, setTab] = useState<Tab>("store");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex rounded-xl border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.08] backdrop-blur-xl p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab("store")}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
            tab === "store" ? "bg-amber-500 text-black" : "text-zinc-500"
          }`}
        >
          Store
        </button>
        <button
          type="button"
          onClick={() => setTab("mutations")}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
            tab === "mutations" ? "bg-amber-500 text-black" : "text-zinc-500"
          }`}
        >
          Mutations
        </button>
      </div>

      {tab === "store" ? (
        <StoreGrid
          initialSlots={slots}
          restockAt={restockAt}
          sectors={sectors}
          gdp={gdp}
          credits={credits}
        />
      ) : (
        <MutationShop items={mutationItems} gdp={gdp} />
      )}
    </div>
  );
}
