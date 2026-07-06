"use client";

import { usePollingRefresh } from "@/components/usePollingRefresh";
import { ActivePolicyRow } from "@/components/queue/ActivePolicyRow";
import type { ActivePolicy } from "@/lib/types/game";

export function ActiveQueueView({ policies }: { policies: ActivePolicy[] }) {
  usePollingRefresh();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Active Policies</h1>

      {policies.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No policies in progress. Head to the Policy Deck to enact one.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {policies.map((p) => (
            <ActivePolicyRow key={p.id} policy={p} />
          ))}
        </div>
      )}
    </div>
  );
}
