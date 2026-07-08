"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gift } from "lucide-react";
import { claimDailyReward } from "@/lib/actions/dailyReward";

export function DailyRewardChip({ lastClaimedAt }: { lastClaimedAt: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  // Compare in UTC to match the SQL side (claim_daily_reward()).
  function alreadyClaimedToday(): boolean {
    if (!lastClaimedAt) return false;
    const last = new Date(lastClaimedAt);
    const now = new Date();
    return (
      last.getUTCFullYear() === now.getUTCFullYear() &&
      last.getUTCMonth() === now.getUTCMonth() &&
      last.getUTCDate() === now.getUTCDate()
    );
  }

  if (alreadyClaimedToday() && !message) {
    return null;
  }

  function handleClaim() {
    setMessage(null);
    startTransition(async () => {
      const result = await claimDailyReward();
      if (result.ok) {
        setMessage(`+${result.creditsGranted} credits`);
        router.refresh();
      } else if (result.reason === "ALREADY_CLAIMED") {
        setMessage("Already claimed today.");
        router.refresh();
      } else {
        setMessage("Couldn't claim right now.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClaim}
      disabled={pending}
      className="inline-flex items-center gap-1.5 self-start rounded-full bg-brand-500/10 border border-brand-500/40 text-brand-500 px-3 py-1 text-xs font-medium disabled:opacity-50"
    >
      <Gift className="w-3.5 h-3.5" strokeWidth={2.25} aria-hidden />
      {message ?? "Claim +5 daily credits"}
    </button>
  );
}
