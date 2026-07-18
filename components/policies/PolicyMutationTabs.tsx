"use client";

import { useState } from "react";
import { StoreGrid } from "@/components/policies/StoreGrid";
import { MutationShop } from "@/components/policies/MutationShop";
import { CosmeticsShop } from "@/components/policies/CosmeticsShop";
import type { MutationItem, SectorState, StoreSlot } from "@/lib/types/game";
import type { SectorTheme } from "@/lib/game/cosmetics";

type Tab = "store" | "mutations" | "skins";

export function PolicyMutationTabs({
  slots,
  restockAt,
  mutationItems,
  sectors,
  gdp,
  credits,
  isVip,
  lastFreeRestockAt,
  cosmeticsOwned,
  equippedSectorTheme,
}: {
  slots: StoreSlot[];
  restockAt: string;
  mutationItems: MutationItem[];
  sectors: SectorState[];
  gdp: number;
  credits: number;
  isVip: boolean;
  lastFreeRestockAt: string | null;
  cosmeticsOwned: string[];
  equippedSectorTheme: SectorTheme | null;
}) {
  const [tab, setTab] = useState<Tab>("store");

  const TABS: { key: Tab; label: string }[] = [
    { key: "store", label: "Store" },
    { key: "mutations", label: "Mutations" },
    { key: "skins", label: "Skins" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
              tab === t.key ? "bg-brand-500 text-black" : "text-zinc-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "store" && (
        <StoreGrid
          initialSlots={slots}
          restockAt={restockAt}
          sectors={sectors}
          gdp={gdp}
          credits={credits}
          isVip={isVip}
          lastFreeRestockAt={lastFreeRestockAt}
        />
      )}
      {tab === "mutations" && <MutationShop items={mutationItems} gdp={gdp} />}
      {tab === "skins" && (
        <CosmeticsShop
          ownedPackKeys={cosmeticsOwned}
          equippedSectorTheme={equippedSectorTheme}
          credits={credits}
        />
      )}
    </div>
  );
}
