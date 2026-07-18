"use client";

import { useTransition } from "react";
import {
  createVipCheckoutSession,
  createVipLifetimeCheckoutSession,
} from "@/lib/actions/billing";
import {
  isLifetimeVip,
  isVipActive,
  VIP_LIFETIME_LABEL,
  VIP_MONTHLY_LABEL,
} from "@/lib/game/vip";
import { VipBadge } from "@/components/ui/VipBadge";
import { RestorePurchasesButton } from "@/components/settings/RestorePurchasesButton";

const PERKS = [
  "Daily reward +15 credits (instead of +5)",
  "2x active-policy queue slots (14 instead of 7)",
  "Free personal store restock every 5 minutes",
  "1.5x mutation proc chance",
  "Priority PvP matchmaking",
  "VIP tag + gold outline on the Leaderboard",
];

export function VipPanel({ vipExpiresAt }: { vipExpiresAt: string | null }) {
  const [pending, startTransition] = useTransition();
  const active = isVipActive(vipExpiresAt);
  const lifetime = isLifetimeVip(vipExpiresAt);

  function handleSubscribe() {
    startTransition(() => createVipCheckoutSession());
  }
  function handleBuyLifetime() {
    startTransition(() => createVipLifetimeCheckoutSession());
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

      {lifetime ? (
        <p className="text-sm text-zinc-500">Lifetime VIP. Never expires!</p>
      ) : active ? (
        <>
          <p className="text-sm text-zinc-500">
            Subscription active until {new Date(vipExpiresAt!).toLocaleDateString()}.
          </p>
          <button
            type="button"
            onClick={handleBuyLifetime}
            disabled={pending}
            className="rounded-xl border-2 border-[#FFD700] bg-transparent text-[#B8860B] dark:text-[#FFD700] font-medium py-2.5 disabled:opacity-50"
          >
            Upgrade to Lifetime, {VIP_LIFETIME_LABEL}
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={pending}
            className="rounded-xl bg-[#FFD700] text-black font-medium py-2.5 disabled:opacity-50"
          >
            Subscribe, {VIP_MONTHLY_LABEL}
          </button>
          <button
            type="button"
            onClick={handleBuyLifetime}
            disabled={pending}
            className="rounded-xl border-2 border-[#FFD700] bg-transparent text-[#B8860B] dark:text-[#FFD700] font-medium py-2.5 disabled:opacity-50"
          >
            Buy Lifetime, {VIP_LIFETIME_LABEL} (one-time)
          </button>
        </div>
      )}
      <RestorePurchasesButton />
    </div>
  );
}
