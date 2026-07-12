"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PolicyCard } from "@/components/policies/PolicyCard";
import {
  getStore,
  enactStorePolicy,
  refreshStore,
  claimVipFreeRestock,
} from "@/lib/actions/policies";
import { usePollingRefresh } from "@/components/usePollingRefresh";
import { formatCountdown, formatWithCommas } from "@/lib/game/format";
import { STORE_REFRESH_COST_CREDITS } from "@/lib/game/store";
import type { EnactPolicyResult, SectorState, StoreSlot } from "@/lib/types/game";

export function StoreGrid({
  initialSlots,
  restockAt,
  sectors,
  gdp,
  credits,
  initialStackCounts,
  isVip,
  lastFreeRestockAt,
}: {
  initialSlots: StoreSlot[];
  restockAt: string;
  sectors: SectorState[];
  gdp: number;
  credits: number;
  initialStackCounts: Record<string, number>;
  isVip: boolean;
  lastFreeRestockAt: string | null;
}) {
  usePollingRefresh();

  const [slots, setSlots] = useState(initialSlots);
  const [prevInitialSlots, setPrevInitialSlots] = useState(initialSlots);
  const [stackCounts, setStackCounts] = useState(initialStackCounts);
  const [prevStackCounts, setPrevStackCounts] = useState(initialStackCounts);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [enactPending, setEnactPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const router = useRouter();

  // Resync local slots when the server gives us a fresh set (e.g. after
  // router.refresh()) - adjusted during render rather than via an effect,
  // per React's guidance for resetting state when a prop changes.
  if (initialSlots !== prevInitialSlots) {
    setPrevInitialSlots(initialSlots);
    setSlots(initialSlots);
  }
  if (initialStackCounts !== prevStackCounts) {
    setPrevStackCounts(initialStackCounts);
    setStackCounts(initialStackCounts);
  }

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remainingMs = Math.max(0, new Date(restockAt).getTime() - now);
  const freeRestockReadyAt = lastFreeRestockAt
    ? new Date(lastFreeRestockAt).getTime() + 5 * 60 * 1000
    : 0;
  const freeRestockOnCooldown = isVip && now < freeRestockReadyAt;

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

  function handleVipFreeRestock() {
    setMessage(null);
    startTransition(async () => {
      const result = await claimVipFreeRestock();
      if (!result.ok) {
        if (result.reason === "ON_COOLDOWN") {
          setMessage("Free VIP restock is still on cooldown.");
        } else {
          setMessage("VIP perk not available.");
        }
        return;
      }
      const fresh = await getStore();
      setSlots(fresh.slots);
      router.refresh();
    });
  }

  async function handleEnact(slot: StoreSlot): Promise<EnactPolicyResult> {
    setMessage(null);
    setEnactPending(true);
    try {
      const result = await enactStorePolicy(slot.slotPosition, slot.id);
      if (result.ok) {
        setSlots((prev) =>
          prev.map((s) =>
            s.slotPosition === slot.slotPosition ? { ...s, quantity: s.quantity - 1 } : s
          )
        );
        setStackCounts((prev) => ({ ...prev, [slot.id]: (prev[slot.id] ?? 0) + 1 }));
        setMessage(`${result.activePolicy.title} enacted — countdown started.`);
        router.refresh();
      } else if (result.reason === "INSUFFICIENT_FUNDS") {
        setMessage(`Not enough treasury — you need ${formatWithCommas(result.shortfall)} more.`);
      } else if (result.reason === "QUEUE_FULL") {
        setMessage("You already have 7 things in progress — wait for one to finish.");
      } else if (result.reason === "SOLD_OUT") {
        setMessage("That slot just sold out.");
      } else if (result.reason === "STALE_SLOT") {
        setMessage("The store just restocked — refresh to see what's available.");
      } else {
        setMessage("That policy is no longer available.");
      }
      return result;
    } finally {
      setEnactPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Store</h1>
          <p className="text-xs text-zinc-500">Restocks in {formatCountdown(remainingMs)}</p>
        </div>
        <div className="flex gap-2">
          {isVip && (
            <button
              type="button"
              onClick={handleVipFreeRestock}
              disabled={pending || freeRestockOnCooldown}
              className="text-sm rounded-xl border border-[#FFD700] text-[#B8860B] px-3 py-1.5 disabled:opacity-50"
            >
              {freeRestockOnCooldown ? "Free restock (cooling down)" : "Free VIP restock"}
            </button>
          )}
          <button
            type="button"
            onClick={handleRefreshStore}
            disabled={pending || credits < STORE_REFRESH_COST_CREDITS}
            className="text-sm rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 px-3 py-1.5 disabled:opacity-50"
          >
            Refresh ({STORE_REFRESH_COST_CREDITS} credits)
          </button>
        </div>
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
            sectors={sectors}
            gdp={gdp}
            stackCount={stackCounts[slot.id] ?? 0}
            onEnact={handleEnact}
            pending={pending || enactPending}
          />
        ))}
      </div>
    </div>
  );
}
