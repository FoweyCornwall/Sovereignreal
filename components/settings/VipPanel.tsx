"use client";

import { useTransition } from "react";
import { createVipCheckoutSession } from "@/lib/actions/billing";
import { isVipActive, VIP_MONTHLY_LABEL } from "@/lib/game/vip";
import { VipBadge } from "@/components/ui/VipBadge";

const PERKS = [
  "Daily reward +15 credits (instead of +5)",
  "2x active-policy queue slots (10 instead of 5)",
  "Free personal store restock every 5 minutes",
  "1.5x mutation proc chance",
  "Priority PvP matchmaking",
  "VIP tag + gold outline on the Leaderboard",
];

export function VipPanel({ vipExpiresAt }: { vipExpiresAt: string | null }) {
  const [pending, startTransition] = useTransition();
  const active = isVipActive(vipExpiresAt);

  function handleSubscribe() {
    startTransition(() => createVipCheckoutSession());
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#FFD700] bg-[#FFD700]/5 p-4">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">Sovereign VIP</h3>
        {active && <VipBadge />}
      </div>

      <ul className="text-sm text-zinc-600 dark:text-zinc-400 flex flex-col gap-1 list-disc list-inside">
        {PERKS.map((perk) => (
          <li key={perk}>{perk}</li>
        ))}
      </ul>

      {active ? (
        <p className="text-sm text-zinc-500">
          Active until {new Date(vipExpiresAt!).toLocaleDateString()}.
        </p>
      ) : (
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={pending}
          className="rounded-xl bg-[#FFD700] text-black font-medium py-2.5 disabled:opacity-50"
        >
          Subscribe — {VIP_MONTHLY_LABEL}
        </button>
      )}
    </div>
  );
}
