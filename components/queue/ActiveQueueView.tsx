"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePollingRefresh } from "@/components/usePollingRefresh";
import { ActivePolicyRow } from "@/components/queue/ActivePolicyRow";
import { MutationBoostRow } from "@/components/queue/MutationBoostRow";
import { skipActivePolicy, skipAllPolicies } from "@/lib/actions/policies";
import { SKIP_ALL_COST_CREDITS } from "@/lib/game/store";
import type { QueueItem } from "@/lib/types/game";

export function ActiveQueueView({ items, credits }: { items: QueueItem[]; credits: number }) {
  usePollingRefresh();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const policyCount = items.filter((i) => i.kind === "policy").length;

  // One shared clock for every row's countdown, instead of each row running
  // its own 1s interval (which was N independent timers + N independent
  // re-renders per second once several policies/boosts were active at once).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  function handleSkip(activePolicyId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await skipActivePolicy(activePolicyId);
      if (result.ok) {
        router.refresh();
      } else if (result.reason === "INSUFFICIENT_CREDITS") {
        setMessage(`Not enough credits! You need ${result.shortfall} more.`);
      } else if (result.reason === "ALREADY_DUE") {
        setMessage("That policy is already finishing up.");
      } else {
        setMessage("That policy is no longer active.");
      }
    });
  }

  function handleSkipAll() {
    setMessage(null);
    startTransition(async () => {
      const result = await skipAllPolicies();
      if (result.ok) {
        setMessage(`Skipped ${result.skipped} ${result.skipped === 1 ? "policy" : "policies"}.`);
        router.refresh();
      } else if (result.reason === "INSUFFICIENT_CREDITS") {
        setMessage(`Not enough credits! You need ${result.shortfall} more.`);
      } else if (result.reason === "NOTHING_TO_SKIP") {
        setMessage("No policies to skip.");
      } else {
        setMessage("Couldn't skip. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Active Policies</h1>
        {policyCount > 0 && (
          <button
            type="button"
            onClick={handleSkipAll}
            disabled={pending || credits < SKIP_ALL_COST_CREDITS}
            className="text-xs sm:text-sm rounded-xl border border-black/5 dark:border-white/5 bg-amber-500 text-black font-semibold px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500"
          >
            Skip All ({SKIP_ALL_COST_CREDITS} credits)
          </button>
        )}
      </div>

      {message && (
        <p className="text-sm rounded-xl bg-zinc-100 dark:bg-zinc-900 px-3 py-2">{message}</p>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No policies in progress. Head to the Store to enact one.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) =>
            item.kind === "policy" ? (
              <ActivePolicyRow
                key={item.id}
                policy={item}
                credits={credits}
                onSkip={handleSkip}
                skipPending={pending}
                now={now}
              />
            ) : (
              <MutationBoostRow key={item.id} boost={item} now={now} />
            )
          )}
        </div>
      )}
    </div>
  );
}
