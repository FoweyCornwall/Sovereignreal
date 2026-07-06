"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PolicyCard } from "@/components/policies/PolicyCard";
import { getStore, enactStorePolicy, refreshStore } from "@/lib/actions/policies";
import { usePollingRefresh } from "@/components/usePollingRefresh";
import { formatCountdown } from "@/lib/game/format";
import { STORE_REFRESH_COST_CREDITS } from "@/lib/game/store";
import type { StoreSlot } from "@/lib/types/game";

export function StoreGrid({
  initialSlots,
  restockAt,
  gdp,
  credits,
}: {
  initialSlots: StoreSlot[];
  restockAt: string;
  gdp: number;
  credits: number;
}) {
  usePollingRefresh();

  const [slots, setSlots] = useState(initialSlots);
  const [prevInitialSlots, setPrevInitialSlots] = useState(initialSlots);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const router = useRouter();

  // Resync local slots when the server gives us a fresh set (e.g. after
  // router.refresh()) - adjusted during render rather than via an effect,
  // per React's guidance for resetting state when a prop changes.
  if (initialSlots !== prevInitialSlots) {
    setPrevInitialSlots(initialSlots);
    setSlots(initialSlots);
  }

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remainingMs = Math.max(0, new Date(restockAt).getTime() - now);

  function handleRefreshStore() {
    setMessage(null);
    startTransition(async () => {
      const result = await refreshStore();
      if (!result.ok) {
        setMessage(`Not enough credits — you need ${result.shortfall} more.`);
        return;
      }
      const fresh = await getStore();
      setSlots(fresh.slots);
      router.refresh();
    });
  }

  function handleEnact(slot: StoreSlot) {
    setMessage(null);
    startTransition(async () => {
      const result = await enactStorePolicy(slot.slotPosition, slot.id);
      if (result.ok) {
        setSlots((prev) =>
          prev.map((s) =>
            s.slotPosition === slot.slotPosition ? { ...s, quantity: s.quantity - 1 } : s
          )
        );
        setMessage(`${result.activePolicy.title} enacted — countdown started.`);
        router.refresh();
      } else if (result.reason === "INSUFFICIENT_FUNDS") {
        setMessage(`Not enough treasury — you need ${result.shortfall.toFixed(3)} more.`);
      } else if (result.reason === "QUEUE_FULL") {
        setMessage("You already have 5 things in progress — wait for one to finish.");
      } else if (result.reason === "SOLD_OUT") {
        setMessage("That slot just sold out.");
      } else if (result.reason === "STALE_SLOT") {
        setMessage("The store just restocked — refresh to see what's available.");
      } else {
        setMessage("That policy is no longer available.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Store</h1>
          <p className="text-xs text-zinc-500">Restocks in {formatCountdown(remainingMs)}</p>
        </div>
        <button
          type="button"
          onClick={handleRefreshStore}
          disabled={pending || credits < STORE_REFRESH_COST_CREDITS}
          className="text-sm rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 disabled:opacity-50"
        >
          Refresh ({STORE_REFRESH_COST_CREDITS} credits)
        </button>
      </div>

      {message && (
        <p className="text-sm rounded-xl bg-zinc-100 dark:bg-zinc-900 px-3 py-2">
          {message}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {slots.map((slot) => (
          <PolicyCard
            key={slot.slotPosition}
            slot={slot}
            gdp={gdp}
            onEnact={handleEnact}
            pending={pending}
          />
        ))}
      </div>
    </div>
  );
}
