"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COSMETIC_PACKS } from "@/lib/game/cosmetics";
import { purchaseCosmeticPack, equipSectorTheme } from "@/lib/actions/cosmetics";
import { formatWithCommas } from "@/lib/game/format";
import type { SectorTheme } from "@/lib/game/cosmetics";

export function CosmeticsShop({
  ownedPackKeys,
  equippedSectorTheme,
  credits,
}: {
  ownedPackKeys: string[];
  equippedSectorTheme: SectorTheme | null;
  credits: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleBuy(packKey: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await purchaseCosmeticPack(packKey);
      if (result.ok) {
        setMessage("Pack purchased!");
        router.refresh();
      } else if (result.reason === "INSUFFICIENT_CREDITS") {
        setMessage(`Not enough credits — you need ${result.shortfall} more.`);
      } else if (result.reason === "ALREADY_OWNED") {
        setMessage("You already own that pack.");
      } else {
        setMessage("That pack isn't available.");
      }
    });
  }

  function handleEquip(theme: SectorTheme) {
    setMessage(null);
    startTransition(async () => {
      const isEquipped = equippedSectorTheme === theme;
      await equipSectorTheme(isEquipped ? null : theme);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-500">
        Restyle how mutated sectors look on your Dashboard. Balance: {formatWithCommas(credits)}{" "}
        credits.
      </p>

      {message && (
        <p className="text-sm rounded-xl bg-zinc-100 dark:bg-zinc-900 px-3 py-2">{message}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {COSMETIC_PACKS.map((pack) => {
          const owned = ownedPackKeys.includes(pack.key);
          const equipped = equippedSectorTheme === pack.theme;
          return (
            <div
              key={pack.key}
              className={`flex flex-col gap-3 rounded-2xl border-2 p-4 shadow-sm ${
                pack.theme === "ice" ? "theme-ice-mid" : "theme-fire-mid"
              }`}
            >
              <h3 className="font-semibold">{pack.name}</h3>
              <p className="text-sm opacity-80">{pack.description}</p>
              <div className="flex items-center justify-between text-sm opacity-80">
                <span>{owned ? "Owned" : `${formatWithCommas(pack.priceCredits)} credits`}</span>
              </div>

              {owned ? (
                <button
                  type="button"
                  onClick={() => handleEquip(pack.theme)}
                  disabled={pending}
                  className={`rounded-xl font-medium py-2.5 disabled:opacity-50 ${
                    equipped
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                      : "bg-brand-500 text-black"
                  }`}
                >
                  {equipped ? "Unequip" : "Equip"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleBuy(pack.key)}
                  disabled={pending}
                  className="rounded-xl bg-brand-500 text-black font-medium py-2.5 disabled:opacity-50"
                >
                  Buy
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
