"use client";

import { useEffect, useState } from "react";
import { SECTOR_LABELS } from "@/lib/game/constants";
import { formatCountdown, formatDelta } from "@/lib/game/format";
import type { ActivePolicy } from "@/lib/types/game";

export function ActivePolicyRow({ policy }: { policy: ActivePolicy }) {
  const startedAt = new Date(policy.startedAt).getTime();
  const completesAt = new Date(policy.completesAt).getTime();
  const totalMs = completesAt - startedAt;

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remainingMs = Math.max(0, completesAt - now);
  const progress = totalMs > 0 ? Math.min(1, (now - startedAt) / totalMs) : 1;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{policy.title}</h3>
        <span className="text-xs text-zinc-500">{SECTOR_LABELS[policy.primarySector]}</span>
      </div>

      <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
        <div
          className="h-full bg-amber-500 transition-all"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="tabular-nums">{formatCountdown(remainingMs)} remaining</span>
        <button
          type="button"
          disabled
          title="Premium feature — coming soon"
          className="text-xs rounded-full px-2 py-1 border border-zinc-300 dark:border-zinc-700 text-zinc-400 cursor-not-allowed"
        >
          ⚡ Speed Up (Coming Soon)
        </button>
      </div>

      <ul className="text-xs flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(policy.statDeltas).map(([sector, delta]) => (
          <li
            key={sector}
            className={delta! >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
          >
            {formatDelta(delta!)} {SECTOR_LABELS[sector as keyof typeof SECTOR_LABELS]}
          </li>
        ))}
      </ul>
    </div>
  );
}
