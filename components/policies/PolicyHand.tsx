"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PolicyCard } from "@/components/policies/PolicyCard";
import { getHand, enactPolicy } from "@/lib/actions/policies";
import type { PolicyCard as PolicyCardType } from "@/lib/types/game";

export function PolicyHand({ initialHand }: { initialHand: PolicyCardType[] }) {
  const [hand, setHand] = useState(initialHand);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleRefresh() {
    setMessage(null);
    startTransition(async () => {
      const fresh = await getHand();
      setHand(fresh);
    });
  }

  function handleEnact(policyId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await enactPolicy(policyId);
      if (result.ok) {
        setHand((prev) => prev.filter((p) => p.id !== policyId));
        setMessage(`${result.activePolicy.title} enacted — countdown started.`);
        router.refresh();
      } else if (result.reason === "INSUFFICIENT_FUNDS") {
        setMessage(
          `Not enough treasury — you need ${result.shortfall.toFixed(3)} more.`
        );
      } else {
        setMessage("That policy is no longer available. Try refreshing your hand.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Policy Deck</h1>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={pending}
          className="text-sm underline disabled:opacity-50"
        >
          Refresh hand
        </button>
      </div>

      {message && (
        <p className="text-sm rounded-md bg-zinc-100 dark:bg-zinc-900 px-3 py-2">
          {message}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {hand.map((policy) => (
          <PolicyCard
            key={policy.id}
            policy={policy}
            onEnact={handleEnact}
            pending={pending}
          />
        ))}
        {hand.length === 0 && (
          <p className="text-sm text-zinc-500 col-span-full">
            Your hand is empty — refresh to draw new policies.
          </p>
        )}
      </div>
    </div>
  );
}
